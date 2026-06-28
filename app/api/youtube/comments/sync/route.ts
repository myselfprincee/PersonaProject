import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import { fetchYoutubeVideoPayloadWithComments } from "@/services/youtube-comments/ytdlp-comments.service";
import {
  analyzePendingYoutubeComments,
  ingestCommentsFromYtDlpPayload,
} from "@/services/youtube-comments/youtube-comments.service";

export async function POST(request: NextRequest) {
  console.log("[youtube-comments][sync] request started");
  const { userId } = await auth();

  if (!userId) {
    console.warn("[youtube-comments][sync] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getYoutubeConnectionForUser(userId);

  if (!connection) {
    console.warn("[youtube-comments][sync] no youtube connection", { userId });
    return NextResponse.json(
      { error: "No YouTube channel connected." },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    youtubeVideoId?: string;
    autoAnalyze?: boolean;
  };

  const youtubeVideoId = body.youtubeVideoId?.trim();

  if (!youtubeVideoId) {
    console.warn("[youtube-comments][sync] missing youtubeVideoId", { userId });
    return NextResponse.json(
      { error: "youtubeVideoId is required." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id, video_id")
    .eq("youtube_connection_id", connection.id)
    .eq("video_id", youtubeVideoId)
    .maybeSingle();

  if (videoError) {
    console.error("[youtube-comments][sync] failed to load video row", {
      youtubeVideoId,
      error: videoError.message,
    });
    return NextResponse.json({ error: videoError.message }, { status: 500 });
  }

  if (!video) {
    console.warn("[youtube-comments][sync] video not found in catalog", {
      youtubeVideoId,
      youtubeConnectionId: connection.id,
    });
    return NextResponse.json(
      { error: "Video not found in your catalog yet. Sync videos first." },
      { status: 404 },
    );
  }

  try {
    console.log("[youtube-comments][sync] starting yt-dlp fetch", {
      youtubeVideoId,
      youtubeConnectionId: connection.id,
      videoId: video.id,
      autoAnalyze: body.autoAnalyze !== false,
    });
    const payload = await fetchYoutubeVideoPayloadWithComments(youtubeVideoId);
    console.log("[youtube-comments][sync] yt-dlp fetch completed", {
      youtubeVideoId,
      title: payload.title ?? null,
      uploader: payload.uploader ?? null,
      commentsCount: payload.comments.length,
    });

    const result = await ingestCommentsFromYtDlpPayload({
      youtubeConnectionId: connection.id,
      videoId: video.id as string,
      youtubeVideoId,
      payload,
    });

    console.log("[youtube-comments][sync] comments ingested", {
      youtubeVideoId,
      ingestedComments: result.inserted,
    });

    let analyzed = 0;
    if (body.autoAnalyze !== false) {
      console.log("[youtube-comments][sync] starting auto-analyze", {
        youtubeVideoId,
        youtubeConnectionId: connection.id,
      });
      const analysis = await analyzePendingYoutubeComments({
        youtubeConnectionId: connection.id,
        limit: 20,
      });
      analyzed = analysis.length;
      console.log("[youtube-comments][sync] auto-analyze completed", {
        youtubeVideoId,
        analyzedComments: analyzed,
      });
    }

    console.log("[youtube-comments][sync] request succeeded", {
      youtubeVideoId,
      ingestedComments: result.inserted,
      analyzedComments: analyzed,
    });

    return NextResponse.json({
      ok: true,
      ingestedComments: result.inserted,
      analyzedComments: analyzed,
    });
  } catch (error) {
    console.error("[youtube-comments][sync] request failed", {
      youtubeVideoId,
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync YouTube comments.",
      },
      { status: 500 },
    );
  }
}
