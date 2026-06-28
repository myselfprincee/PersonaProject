import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import { getYoutubeCommentById } from "@/services/youtube-comments/youtube-comments.service";
import { sendYoutubeCommentReply } from "@/services/youtube-comments/youtube-comment-send.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  console.log("[youtube-comments][send] request started");
  const { userId } = await auth();

  if (!userId) {
    console.warn("[youtube-comments][send] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getYoutubeConnectionForUser(userId);

  if (!connection) {
    console.warn("[youtube-comments][send] no youtube connection", { userId });
    return NextResponse.json(
      { error: "No YouTube channel connected." },
      { status: 404 },
    );
  }

  const { id } = await params;

  try {
    console.log("[youtube-comments][send] loading comment", { commentId: id });
    const comment = await getYoutubeCommentById(id);

    if (comment.youtubeConnectionId !== connection.id) {
      console.warn("[youtube-comments][send] comment not owned by connection", {
        commentId: id,
        youtubeConnectionId: connection.id,
        commentYoutubeConnectionId: comment.youtubeConnectionId,
      });
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const result = await sendYoutubeCommentReply(id);
    console.log("[youtube-comments][send] reply sent", {
      commentId: id,
      replyCommentId: result.replyCommentId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[youtube-comments][send] failed", {
      commentId: id,
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send YouTube reply.",
      },
      { status: 500 },
    );
  }
}
