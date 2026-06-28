import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import {
  getYoutubeCommentById,
  updateYoutubeCommentStatus,
} from "@/services/youtube-comments/youtube-comments.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  console.log("[youtube-comments][status] request started");
  const { userId } = await auth();

  if (!userId) {
    console.warn("[youtube-comments][status] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getYoutubeConnectionForUser(userId);

  if (!connection) {
    console.warn("[youtube-comments][status] no youtube connection", {
      userId,
    });
    return NextResponse.json(
      { error: "No YouTube channel connected." },
      { status: 404 },
    );
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?:
      | "needs_reply"
      | "ai_ready"
      | "waiting_review"
      | "approved"
      | "posted"
      | "ignored";
    aiReply?: string;
  };

  if (!body.status) {
    console.warn("[youtube-comments][status] missing status", {
      commentId: id,
    });
    return NextResponse.json({ error: "status is required." }, { status: 400 });
  }

  try {
    console.log("[youtube-comments][status] loading comment", {
      commentId: id,
      nextStatus: body.status,
      hasAiReply:
        typeof body.aiReply === "string" && body.aiReply.trim().length > 0,
    });
    const comment = await getYoutubeCommentById(id);
    if (comment.youtubeConnectionId !== connection.id) {
      console.warn(
        "[youtube-comments][status] comment not owned by connection",
        {
          commentId: id,
          youtubeConnectionId: connection.id,
          commentYoutubeConnectionId: comment.youtubeConnectionId,
        },
      );
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    await updateYoutubeCommentStatus({
      commentId: id,
      status: body.status,
      aiReply: body.aiReply,
    });

    console.log("[youtube-comments][status] updated", {
      commentId: id,
      nextStatus: body.status,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[youtube-comments][status] failed", {
      commentId: id,
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update comment status.",
      },
      { status: 500 },
    );
  }
}
