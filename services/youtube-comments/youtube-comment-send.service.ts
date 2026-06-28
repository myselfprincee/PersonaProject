import { google } from "googleapis";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getYoutubeCommentById } from "@/services/youtube-comments/youtube-comments.service";

function createOauthClient(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`,
  );

  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export async function sendYoutubeCommentReply(commentId: string) {
  console.log("[youtube-comments][send:service] started", { commentId });
  const supabase = createAdminClient();
  const comment = await getYoutubeCommentById(commentId);

  // Important: replies to existing comments must use comments.insert.
  // commentThreads.insert is only for creating new top-level comments.

  if (!comment.aiReply?.trim()) {
    console.warn("[youtube-comments][send:service] missing ai reply", {
      commentId,
    });
    throw new Error("No AI reply is available for this comment.");
  }

  if (comment.youtubeParentCommentId) {
    console.warn(
      "[youtube-comments][send:service] attempted reply to non-top-level comment",
      {
        commentId,
        youtubeParentCommentId: comment.youtubeParentCommentId,
      },
    );
    throw new Error(
      "Only top-level comments should be replied to from this inbox send flow.",
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from("youtube_connections")
    .select("refresh_token")
    .eq("id", comment.youtubeConnectionId)
    .single();

  if (connectionError) {
    console.error(
      "[youtube-comments][send:service] failed to load youtube connection",
      {
        commentId,
        error: connectionError.message,
      },
    );
    throw connectionError;
  }

  const oauthClient = createOauthClient(connection.refresh_token as string);
  const youtube = google.youtube({ version: "v3", auth: oauthClient });

  try {
    console.log("[youtube-comments][send:service] sending reply to youtube", {
      commentId,
      parentCommentId: comment.youtubeCommentId,
      replyLength: comment.aiReply.length,
    });
    const response = await youtube.comments.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          parentId: comment.youtubeCommentId,
          textOriginal: comment.aiReply,
        },
      },
    });

    const replyCommentId = response.data.id ?? null;

    const { error: updateError } = await supabase
      .from("youtube_comments")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        youtube_reply_comment_id: replyCommentId,
        reply_error: null,
      })
      .eq("id", commentId);

    if (updateError) {
      console.error(
        "[youtube-comments][send:service] failed to persist sent reply",
        {
          commentId,
          replyCommentId,
          error: updateError.message,
        },
      );
      throw updateError;
    }

    console.log("[youtube-comments][send:service] completed", {
      commentId,
      replyCommentId,
    });

    return {
      replyCommentId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send reply.";

    console.error("[youtube-comments][send:service] failed", {
      commentId,
      error: message,
    });

    await supabase
      .from("youtube_comments")
      .update({
        reply_error: message,
        status: "waiting_review",
      })
      .eq("id", commentId);

    throw error;
  }
}
