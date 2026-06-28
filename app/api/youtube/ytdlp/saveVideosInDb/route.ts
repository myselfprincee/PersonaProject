import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import pLimit from "p-limit";

import { createAdminClient } from "@/lib/db/supabase-admin";
import { upsertCatalogVideos } from "@/repositories/videos.repository";
import { findAllVideoIds } from "@/app/worker/youtube/findAllVideosWithTitles";
import { downloadTranscriptToTempFile } from "@/services/youtube/youtube-transcript.service";
import {
  readTranscriptJsonFromStorage,
  uploadTranscriptBufferToStorage,
} from "@/services/storage/raw-transcript-storage.service";
import { processTranscriptForVideo } from "@/services/transcript/transcript-ingestion.service";

const UPSERT_BATCH_SIZE = 500;
const LOOKUP_BATCH_SIZE = 500;
const VIDEO_CONCURRENCY = 4;
const DOWNLOAD_CONCURRENCY = 4;
const EMBEDDING_CONCURRENCY = 2;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function loadTranscriptMap(videoIds: string[]) {
  const supabase = createAdminClient();
  const transcriptMap = new Map<string, string>();

  for (const batch of chunkArray(videoIds, LOOKUP_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("transcripts")
      .select("video_id, storage_path")
      .in("video_id", batch);

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      if (row.video_id && row.storage_path) {
        transcriptMap.set(row.video_id, row.storage_path);
      }
    }
  }

  return transcriptMap;
}

async function loadChunkedVideoIds(videoIds: string[]) {
  const supabase = createAdminClient();
  const chunkedVideoIds = new Set<string>();

  for (const batch of chunkArray(videoIds, LOOKUP_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("video_chunks")
      .select("video_id")
      .in("video_id", batch);

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      if (row.video_id) {
        chunkedVideoIds.add(row.video_id);
      }
    }
  }

  return chunkedVideoIds;
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: connection, error: connectionError } = await supabase
    .from("youtube_connections")
    .select("id, channel_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (connectionError) {
    return NextResponse.json(
      { error: connectionError.message },
      { status: 500 },
    );
  }

  if (!connection) {
    return NextResponse.json(
      { error: "No YouTube channel connected." },
      { status: 404 },
    );
  }

  const startedAt = Date.now();
  const forceReprocess = request.nextUrl.searchParams.get("force") === "true";

  try {
    const discoveredVideos = await findAllVideoIds(connection.channel_id);

    if (discoveredVideos.length === 0) {
      return NextResponse.json({
        ok: true,
        totalVideos: 0,
        processedVideos: 0,
        skippedVideos: 0,
        failedVideos: 0,
        message: "No videos found.",
      });
    }

    const savedVideos: Array<{ id: string; video_id: string; title: string }> =
      [];

    for (const batch of chunkArray(discoveredVideos, UPSERT_BATCH_SIZE)) {
      const rows = await upsertCatalogVideos(
        batch.map((video) => ({
          youtubeConnectionId: connection.id,
          youtubeVideoId: video.id,
          title: video.title,
        })),
      );

      savedVideos.push(...rows);
    }

    const videoIds = savedVideos.map((video) => video.id);
    const transcriptMap = await loadTranscriptMap(videoIds);
    const chunkedVideoIds = await loadChunkedVideoIds(videoIds);

    const downloadLimit = pLimit(DOWNLOAD_CONCURRENCY);
    const embeddingLimit = pLimit(EMBEDDING_CONCURRENCY);
    const videoLimit = pLimit(VIDEO_CONCURRENCY);

    let processedVideos = 0;
    let downloadedTranscripts = 0;
    let reusedStoredTranscripts = 0;
    let skippedVideos = 0;
    let generatedChunks = 0;
    const failures: Array<{
      youtubeVideoId: string;
      title: string;
      error: string;
    }> = [];

    await Promise.all(
      savedVideos.map((video) =>
        videoLimit(async () => {
          try {
            if (!forceReprocess && chunkedVideoIds.has(video.id)) {
              skippedVideos += 1;
              return;
            }

            let transcriptJson: unknown;
            let localPath: string | null = null;

            try {
              const existingStoragePath = transcriptMap.get(video.id);

              if (existingStoragePath) {
                transcriptJson =
                  await readTranscriptJsonFromStorage(existingStoragePath);
                reusedStoredTranscripts += 1;
              } else {
                const download = await downloadLimit(() =>
                  downloadTranscriptToTempFile({
                    youtubeVideoId: video.video_id,
                    channelId: connection.channel_id,
                  }),
                );

                localPath = download.localPath;
                const fileBuffer = await fs.readFile(localPath);
                transcriptJson = JSON.parse(fileBuffer.toString("utf-8"));

                const upload = await uploadTranscriptBufferToStorage({
                  videoId: video.id,
                  filePath: localPath,
                  buffer: fileBuffer,
                });

                transcriptMap.set(video.id, upload.storagePath);
                downloadedTranscripts += 1;
              }

              const processed = await embeddingLimit(() =>
                processTranscriptForVideo({
                  videoId: video.id,
                  transcriptJson,
                  replaceExisting: true,
                }),
              );

              generatedChunks += processed.chunkCount;
              processedVideos += 1;
            } finally {
              if (localPath) {
                await fs.unlink(localPath).catch(() => undefined);
              }
            }
          } catch (error) {
            failures.push({
              youtubeVideoId: video.video_id,
              title: video.title,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown error occurred.",
            });
          }
        }),
      ),
    );

    return NextResponse.json({
      ok: failures.length === 0,
      forceReprocess,
      totalVideos: discoveredVideos.length,
      indexedVideos: processedVideos,
      skippedVideos,
      failedVideos: failures.length,
      downloadedTranscripts,
      reusedStoredTranscripts,
      generatedChunks,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      failures: failures.slice(0, 25),
      message:
        failures.length === 0
          ? "Videos, transcripts, and embeddings processed successfully."
          : "Processing completed with some failures.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  }
}
