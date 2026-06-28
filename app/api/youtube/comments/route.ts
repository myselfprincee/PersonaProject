import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import {
  listYoutubeComments,
  summarizeYoutubeCommentCounts,
} from "@/services/youtube-comments/youtube-comments.service";

export async function GET(request: NextRequest) {
  console.log("[youtube-comments][list] request started", {
    status: request.nextUrl.searchParams.get("status") ?? "all",
    videoId: request.nextUrl.searchParams.get("videoId") ?? null,
    search: request.nextUrl.searchParams.get("search") ?? null,
  });
  const { userId } = await auth();

  if (!userId) {
    console.warn("[youtube-comments][list] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getYoutubeConnectionForUser(userId);

  if (!connection) {
    console.warn("[youtube-comments][list] no youtube connection", { userId });
    return NextResponse.json(
      { error: "No YouTube channel connected." },
      { status: 404 },
    );
  }

  const status = request.nextUrl.searchParams.get("status") ?? "all";
  const videoId = request.nextUrl.searchParams.get("videoId") ?? undefined;
  const search = request.nextUrl.searchParams.get("search") ?? undefined;

  try {
    console.log("[youtube-comments][list] loading inbox", {
      youtubeConnectionId: connection.id,
      status,
      videoId: videoId ?? null,
      search: search ?? null,
    });
    const [comments, counts] = await Promise.all([
      listYoutubeComments({
        youtubeConnectionId: connection.id,
        status: status as
          | "all"
          | "needs_reply"
          | "ai_ready"
          | "waiting_review"
          | "approved"
          | "posted"
          | "ignored",
        videoId,
        search,
      }),
      summarizeYoutubeCommentCounts(connection.id),
    ]);

    console.log("[youtube-comments][list] loaded inbox", {
      youtubeConnectionId: connection.id,
      commentsCount: comments.length,
      counts,
    });
    return NextResponse.json({
      connection,
      counts,
      comments,
    });
  } catch (error) {
    console.error("[youtube-comments][list] failed", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load comments inbox.",
      },
      { status: 500 },
    );
  }
}
