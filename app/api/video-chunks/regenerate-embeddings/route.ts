import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { generateEmbeddingsForTexts } from "@/services/embeddings/embedding.service";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";

const UPDATE_BATCH_SIZE = 100;

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      videoId?: string;
    };
    const connection = await getYoutubeConnectionForUser(userId);

    if (!connection) {
      return NextResponse.json(
        { error: "Connect YouTube before regenerating chunk embeddings." },
        { status: 404 },
      );
    }

    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.min(Math.max(Math.floor(body.limit), 1), 30)
        : 30;
    const supabase = createAdminClient();
    let videoIds: string[] = [];

    if (typeof body.videoId === "string" && body.videoId.trim()) {
      videoIds = [body.videoId.trim()];
    } else {
      const { data, error } = await supabase
        .from("video_chunks")
        .select("video_id, videos!inner(id, youtube_connection_id)")
        .eq("videos.youtube_connection_id", connection.id)
        .is("embedding", null)
        .order("video_id", { ascending: true });

      if (error) {
        throw error;
      }

      const discoveredVideoIds = Array.from(
        new Set(
          ((data ?? []) as Array<{ video_id: string | null }>).flatMap((row) =>
            typeof row.video_id === "string" && row.video_id
              ? [row.video_id]
              : [],
          ),
        ),
      );

      videoIds = discoveredVideoIds.slice(0, limit);
    }

    const results: Array<{
      videoId: string;
      chunkCount: number;
      updated: number;
    }> = [];

    for (const videoId of videoIds) {
      const { data: chunks, error: chunkError } = await supabase
        .from("video_chunks")
        .select("id, chunk_text")
        .eq("video_id", videoId)
        .is("embedding", null)
        .order("chunk_index", { ascending: true });

      if (chunkError) {
        throw chunkError;
      }

      const rows = (chunks ?? []) as Array<{ id: string; chunk_text: string }>;

      if (rows.length === 0) {
        results.push({
          videoId,
          chunkCount: 0,
          updated: 0,
        });
        continue;
      }

      const embeddings = await generateEmbeddingsForTexts(
        rows.map((row) => row.chunk_text),
      );

      for (let index = 0; index < rows.length; index += UPDATE_BATCH_SIZE) {
        const batch = rows.slice(index, index + UPDATE_BATCH_SIZE);

        for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
          const row = batch[batchIndex];
          const embedding = embeddings[index + batchIndex];
          const { error: updateError } = await supabase
            .from("video_chunks")
            .update({ embedding })
            .eq("id", row.id);

          if (updateError) {
            throw updateError;
          }
        }
      }

      results.push({
        videoId,
        chunkCount: rows.length,
        updated: rows.length,
      });
    }

    return NextResponse.json({
      processedVideos: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to regenerate chunk embeddings.",
      },
      { status: 500 },
    );
  }
}
