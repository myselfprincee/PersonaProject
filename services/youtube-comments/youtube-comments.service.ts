import { createAdminClient } from "@/lib/db/supabase-admin";
import { fetchHybridScopedMatches } from "@/app/querying/fetchHybridScopedMatches";
import { parseJson3Transcript } from "@/chunking/transcriptChunker";
import { readTranscriptJsonFromStorage } from "@/services/storage/raw-transcript-storage.service";
import { createGeminiClient } from "@/services/youtube-comments/gemini";
import type {
  CommentInboxStatus,
  YoutubeCommentAnalysis,
  YoutubeCommentRecord,
} from "@/services/youtube-comments/types";
import {
  asBoolean,
  asNumber,
  asString,
  normalizeText,
  toIsoTimestamp,
} from "./utils";

function toIsoFromUnixTimestamp(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function stripMarkdownCodeFence(value: string) {
  const trimmed = value.trim();

  const fencedMatch = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

async function loadVideoTranscriptContext(videoId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transcripts")
    .select("storage_path")
    .eq("video_id", videoId)
    .maybeSingle();

  if (error) {
    console.error(
      "[youtube-comments][transcript] failed to load transcript row",
      {
        videoId,
        error: error.message,
      },
    );
    return null;
  }

  if (!data?.storage_path) {
    console.log("[youtube-comments][transcript] no transcript found", {
      videoId,
    });
    return null;
  }

  try {
    const transcriptJson = await readTranscriptJsonFromStorage(
      data.storage_path,
    );
    const transcriptText = parseJson3Transcript(transcriptJson)
      .map((segment) => segment.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!transcriptText) {
      return null;
    }

    return transcriptText.slice(0, 8_000);
  } catch (storageError) {
    console.error("[youtube-comments][transcript] failed to read transcript", {
      videoId,
      storagePath: data.storage_path,
      error:
        storageError instanceof Error ? storageError.message : storageError,
    });
    return null;
  }
}

const ANALYSIS_MODEL =
  process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";

type CommentRow = {
  id: string;
  youtube_connection_id: string;
  video_id: string;
  youtube_video_id: string;
  youtube_comment_id: string;
  youtube_parent_comment_id: string | null;
  youtube_reply_comment_id: string | null;
  author_name: string | null;
  author_channel_id: string | null;
  author_channel_url: string | null;
  author_avatar_url: string | null;
  author_is_uploader: boolean;
  author_is_verified: boolean;
  comment_text: string;
  like_count: number;
  published_at: string | null;
  comment_updated_at: string | null;
  status: CommentInboxStatus;
  intent: string | null;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | null;
  priority: "low" | "medium" | "high" | null;
  confidence: number | null;
  ai_reply: string | null;
  ai_reply_model: string | null;
  reviewed_at: string | null;
  posted_at: string | null;
  reply_error: string | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
  videos:
    | {
        id: string;
        title: string;
        video_id: string;
        thumbnail_url: string | null;
      }
    | Array<{
        id: string;
        title: string;
        video_id: string;
        thumbnail_url: string | null;
      }>;
};

type YtDlpCommentNode = Record<string, unknown>;

type CommentUpsertRow = {
  youtube_connection_id: string;
  video_id: string;
  youtube_video_id: string;
  youtube_comment_id: string;
  youtube_parent_comment_id: string | null;
  author_name: string | null;
  author_channel_id: string | null;
  author_channel_url: string | null;
  author_avatar_url: string | null;
  author_is_uploader: boolean;
  author_is_verified: boolean;
  comment_text: string;
  like_count: number;
  published_at: string | null;
  comment_updated_at: string | null;
  raw_payload: unknown;
};

type ExtractedCommentNode = {
  row: CommentUpsertRow;
  children: ExtractedCommentNode[];
};

function mapCommentRow(row: CommentRow): YoutubeCommentRecord {
  const video = Array.isArray(row.videos) ? row.videos[0] : row.videos;

  return {
    id: row.id,
    youtubeConnectionId: row.youtube_connection_id,
    videoId: row.video_id,
    youtubeVideoId: row.youtube_video_id,
    youtubeCommentId: row.youtube_comment_id,
    youtubeParentCommentId: row.youtube_parent_comment_id,
    youtubeReplyCommentId: row.youtube_reply_comment_id,
    authorName: row.author_name,
    authorChannelId: row.author_channel_id,
    authorChannelUrl: row.author_channel_url,
    authorAvatarUrl: row.author_avatar_url,
    authorIsUploader: row.author_is_uploader,
    authorIsVerified: row.author_is_verified,
    commentText: row.comment_text,
    likeCount: row.like_count,
    publishedAt: row.published_at,
    commentUpdatedAt: row.comment_updated_at,
    status: row.status,
    intent: row.intent,
    sentiment: row.sentiment,
    priority: row.priority,
    confidence: row.confidence,
    aiReply: row.ai_reply,
    aiReplyModel: row.ai_reply_model,
    reviewedAt: row.reviewed_at,
    postedAt: row.posted_at,
    replyError: row.reply_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rawPayload: row.raw_payload,
    video: {
      id: video?.id ?? row.video_id,
      title: video?.title ?? "Untitled",
      videoId: video?.video_id ?? row.youtube_video_id,
      thumbnailUrl: video?.thumbnail_url ?? null,
    },
  };
}

function extractCommentRows(input: {
  youtubeConnectionId: string;
  videoId: string;
  youtubeVideoId: string;
  comments: unknown;
}) {
  const rows: CommentUpsertRow[] = [];

  function buildNode(
    node: YtDlpCommentNode,
    parentYoutubeCommentId: string | null,
  ): ExtractedCommentNode | null {
    const commentId = asString(node.id) ?? asString(node.comment_id);
    const commentText = normalizeText(
      asString(node.text) ?? asString(node.comment),
    );

    if (!commentId || !commentText) {
      return null;
    }

    const directParent = asString(node.parent);
    const resolvedParentCommentId =
      directParent && directParent !== "root"
        ? directParent
        : parentYoutubeCommentId;

    const row: CommentUpsertRow = {
      youtube_connection_id: input.youtubeConnectionId,
      video_id: input.videoId,
      youtube_video_id: input.youtubeVideoId,
      youtube_comment_id: commentId,
      youtube_parent_comment_id: resolvedParentCommentId,
      author_name: asString(node.author),
      author_channel_id:
        asString(node.author_id) ?? asString(node.author_channel_id),
      author_channel_url:
        asString(node.author_url) ?? asString(node.author_channel_url),
      author_avatar_url:
        asString(node.author_thumbnail) ?? asString(node.author_avatar_url),
      author_is_uploader: asBoolean(node.author_is_uploader) ?? false,
      author_is_verified: asBoolean(node.author_is_verified) ?? false,
      comment_text: commentText,
      like_count: asNumber(node.like_count) ?? 0,
      published_at:
        toIsoFromUnixTimestamp(node.timestamp) ??
        toIsoTimestamp(node.published_time_text) ??
        null,
      comment_updated_at:
        toIsoTimestamp(node.time_text) ??
        toIsoTimestamp(node._time_text) ??
        null,
      raw_payload: node,
    };

    const replies = Array.isArray(node.replies) ? node.replies : [];
    const children = replies
      .map((reply) => {
        if (!reply || typeof reply !== "object") {
          return null;
        }

        return buildNode(reply as YtDlpCommentNode, commentId);
      })
      .filter((reply): reply is ExtractedCommentNode => reply !== null);

    return { row, children };
  }

  function collectRows(
    commentNode: ExtractedCommentNode,
    parentIsUploader: boolean,
    isTopLevel: boolean,
  ) {
    const includeInInbox =
      isTopLevel || (!commentNode.row.author_is_uploader && parentIsUploader);

    if (includeInInbox || commentNode.row.author_is_uploader) {
      rows.push(commentNode.row);
    }

    for (const child of commentNode.children) {
      collectRows(child, commentNode.row.author_is_uploader, false);
    }
  }

  const comments = Array.isArray(input.comments) ? input.comments : [];
  for (const comment of comments) {
    if (!comment || typeof comment !== "object") {
      continue;
    }

    const commentNode = buildNode(comment as YtDlpCommentNode, null);
    if (!commentNode) {
      continue;
    }

    collectRows(commentNode, false, true);
  }

  return rows;
}

export async function ingestCommentsFromYtDlpPayload(input: {
  youtubeConnectionId: string;
  videoId: string;
  youtubeVideoId: string;
  payload: unknown;
}) {
  console.log("[youtube-comments][ingest] started", {
    youtubeConnectionId: input.youtubeConnectionId,
    videoId: input.videoId,
    youtubeVideoId: input.youtubeVideoId,
  });
  const supabase = createAdminClient();
  const payloadRecord = input.payload as Record<string, unknown>;
  const rows = extractCommentRows({
    youtubeConnectionId: input.youtubeConnectionId,
    videoId: input.videoId,
    youtubeVideoId: input.youtubeVideoId,
    comments: payloadRecord.comments,
  });

  console.log("[youtube-comments][ingest] extracted rows", {
    youtubeVideoId: input.youtubeVideoId,
    rowsCount: rows.length,
    payloadHasComments: Array.isArray(payloadRecord.comments),
    payloadCommentsCount: Array.isArray(payloadRecord.comments)
      ? payloadRecord.comments.length
      : 0,
  });

  if (rows.length === 0) {
    console.warn("[youtube-comments][ingest] no rows extracted", {
      youtubeVideoId: input.youtubeVideoId,
    });
    return { inserted: 0 };
  }

  const { error } = await supabase.from("youtube_comments").upsert(rows, {
    onConflict: "youtube_comment_id",
  });

  if (error) {
    console.error("[youtube-comments][ingest] upsert failed", {
      youtubeVideoId: input.youtubeVideoId,
      error: error.message,
    });
    throw error;
  }

  console.log("[youtube-comments][ingest] completed", {
    youtubeVideoId: input.youtubeVideoId,
    inserted: rows.length,
  });

  return { inserted: rows.length };
}

export async function listYoutubeComments(input: {
  youtubeConnectionId: string;
  status?: CommentInboxStatus | "all";
  videoId?: string;
  search?: string;
  limit?: number;
}) {
  console.log("[youtube-comments][service:list] started", input);
  const supabase = createAdminClient();
  let query = supabase
    .from("youtube_comments")
    .select(
      "id, youtube_connection_id, video_id, youtube_video_id, youtube_comment_id, youtube_parent_comment_id, youtube_reply_comment_id, author_name, author_channel_id, author_channel_url, author_avatar_url, author_is_uploader, author_is_verified, comment_text, like_count, published_at, comment_updated_at, status, intent, sentiment, priority, confidence, ai_reply, ai_reply_model, reviewed_at, posted_at, reply_error, raw_payload, created_at, updated_at, videos!inner(id, title, video_id, thumbnail_url)",
    )
    .eq("youtube_connection_id", input.youtubeConnectionId)
    .eq("author_is_uploader", false)
    .or(
      "youtube_parent_comment_id.is.null,youtube_reply_comment_id.not.is.null",
    )
    .order("published_at", { ascending: false })
    .limit(input.limit ?? 200);

  if (input.status && input.status !== "all") {
    query = query.eq("status", input.status);
  }

  if (input.videoId) {
    query = query.eq("video_id", input.videoId);
  }

  if (input.search?.trim()) {
    query = query.or(
      `comment_text.ilike.%${input.search.trim()}%,author_name.ilike.%${input.search.trim()}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[youtube-comments][service:list] failed", {
      error: error.message,
      input,
    });
    throw error;
  }

  console.log("[youtube-comments][service:list] completed", {
    count: (data ?? []).length,
    input,
  });

  return ((data ?? []) as CommentRow[]).map(mapCommentRow);
}

export async function getYoutubeCommentById(commentId: string) {
  console.log("[youtube-comments][service:getById] started", { commentId });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("youtube_comments")
    .select(
      "id, youtube_connection_id, video_id, youtube_video_id, youtube_comment_id, youtube_parent_comment_id, youtube_reply_comment_id, author_name, author_channel_id, author_channel_url, author_avatar_url, author_is_uploader, author_is_verified, comment_text, like_count, published_at, comment_updated_at, status, intent, sentiment, priority, confidence, ai_reply, ai_reply_model, reviewed_at, posted_at, reply_error, raw_payload, created_at, updated_at, videos!inner(id, title, video_id, thumbnail_url)",
    )
    .eq("id", commentId)
    .single();

  if (error) {
    console.error("[youtube-comments][service:getById] failed", {
      commentId,
      error: error.message,
    });
    throw error;
  }

  console.log("[youtube-comments][service:getById] completed", {
    commentId,
    youtubeVideoId: (data as CommentRow).youtube_video_id,
  });

  return mapCommentRow(data as CommentRow);
}

export async function summarizeYoutubeCommentCounts(
  youtubeConnectionId: string,
) {
  console.log("[youtube-comments][service:counts] started", {
    youtubeConnectionId,
  });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("youtube_comments")
    .select("status")
    .eq("youtube_connection_id", youtubeConnectionId);

  if (error) {
    console.error("[youtube-comments][service:counts] failed", {
      youtubeConnectionId,
      error: error.message,
    });
    throw error;
  }

  const counts: Record<string, number> = {
    all: 0,
    needs_reply: 0,
    ai_ready: 0,
    waiting_review: 0,
    approved: 0,
    posted: 0,
    ignored: 0,
  };

  for (const row of data ?? []) {
    const status = row.status as CommentInboxStatus;
    counts.all += 1;
    counts[status] = (counts[status] ?? 0) + 1;
  }

  console.log("[youtube-comments][service:counts] completed", {
    youtubeConnectionId,
    counts,
  });
  return counts;
}

function clip(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toSuggestedStatus(
  analysis: YoutubeCommentAnalysis,
): CommentInboxStatus {
  if (!analysis.shouldReply) {
    return "ignored";
  }

  return analysis.confidence >= 0.9 ? "approved" : "ai_ready";
}

export async function analyzeYoutubeComment(commentId: string) {
  console.log("[youtube-comments][analyze:single] started", { commentId });
  const comment = await getYoutubeCommentById(commentId);
  const supabase = createAdminClient();
  const videoMatches = await fetchHybridScopedMatches({
    youtubeConnectionId: comment.youtubeConnectionId,
    question: comment.commentText,
  });
  const currentVideoTranscript = await loadVideoTranscriptContext(
    comment.videoId,
  );

  const context = videoMatches.matches
    .slice(0, 6)
    .map((match, index) => {
      const videoContext = match.videoContext
        ? [
            `Summary: ${match.videoContext.summary}`,
            `Hook: ${match.videoContext.hook}`,
            `Thumbnail: ${match.videoContext.thumbnailDescription}`,
            `Views: ${match.videoContext.viewCount ?? "Unknown"}`,
            `Likes: ${match.videoContext.likeCount ?? "Unknown"}`,
            `Comments: ${match.videoContext.commentCount ?? "Unknown"}`,
            `Topics: ${match.videoContext.topics.join(", ") || "None"}`,
            `Keywords: ${match.videoContext.keywords.join(", ") || "None"}`,
          ].join("\n")
        : "";

      return [
        `Context ${index + 1}`,
        match.video_title ? `Video Title: ${match.video_title}` : null,
        videoContext || null,
        `Transcript: ${match.chunk_text}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");

  const ai = createGeminiClient();
  const prompt = [
    "You are helping a YouTube creator manage a comments inbox.",
    "Analyze the incoming comment, decide if it deserves a reply, and draft a short natural reply in the creator's own tone.",
    "The reply must feel human, concise, and grounded in the creator's existing content context.",
    "Prefer context from the specific video this comment belongs to. Use other matched videos only as supporting context.",
    "Do not overpraise. Do not sound like customer support. Do not use emojis unless the comment itself strongly invites it.",
    "Return strict JSON with keys: intent, sentiment, priority, confidence, shouldReply, suggestedStatus, reply, rationale.",
    "Allowed sentiment: positive, neutral, negative, mixed.",
    "Allowed priority: low, medium, high.",
    "Allowed suggestedStatus: needs_reply, ai_ready, waiting_review, approved, posted, ignored.",
    `Video title: ${comment.video.title}`,
    `Incoming comment author: ${comment.authorName ?? "Unknown"}`,
    `Incoming comment: ${comment.commentText}`,
    "Transcript for the specific video this comment belongs to:",
    currentVideoTranscript ||
      "No stored transcript found for this exact video.",
    "Other relevant creator context from matching videos:",
    context || "No retrieved creator context found.",
  ].join("\n");

  console.log("[youtube-comments][analyze:single] generating AI reply", {
    commentId,
    youtubeConnectionId: comment.youtubeConnectionId,
    videoId: comment.videoId,
    contextMatches: videoMatches.matches.length,
    hasCurrentVideoTranscript: Boolean(currentVideoTranscript),
    currentVideoTranscriptLength: currentVideoTranscript?.length ?? 0,
  });

  const response = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: prompt,
  });

  const rawText = response.text?.trim() ?? "";
  const sanitizedRawText = stripMarkdownCodeFence(rawText);
  console.log("[youtube-comments][analyze:single] AI response received", {
    commentId,
    rawTextPreview: rawText.slice(0, 300),
    sanitizedRawTextPreview: sanitizedRawText.slice(0, 300),
  });
  const parsed = JSON.parse(
    sanitizedRawText,
  ) as Partial<YoutubeCommentAnalysis>;

  const analysis: YoutubeCommentAnalysis = {
    intent:
      typeof parsed.intent === "string" ? parsed.intent : "general_engagement",
    sentiment:
      parsed.sentiment === "positive" ||
      parsed.sentiment === "neutral" ||
      parsed.sentiment === "negative" ||
      parsed.sentiment === "mixed"
        ? parsed.sentiment
        : "neutral",
    priority:
      parsed.priority === "low" ||
      parsed.priority === "medium" ||
      parsed.priority === "high"
        ? parsed.priority
        : "medium",
    confidence: clip(
      typeof parsed.confidence === "number" ? parsed.confidence : 0.75,
      0,
      1,
    ),
    shouldReply: Boolean(parsed.shouldReply),
    suggestedStatus:
      parsed.suggestedStatus === "needs_reply" ||
      parsed.suggestedStatus === "ai_ready" ||
      parsed.suggestedStatus === "waiting_review" ||
      parsed.suggestedStatus === "approved" ||
      parsed.suggestedStatus === "posted" ||
      parsed.suggestedStatus === "ignored"
        ? parsed.suggestedStatus
        : "ai_ready",
    reply: normalizeText(typeof parsed.reply === "string" ? parsed.reply : ""),
    rationale: normalizeText(
      typeof parsed.rationale === "string" ? parsed.rationale : "",
    ),
  };

  const nextStatus = toSuggestedStatus(analysis);
  const { error } = await supabase
    .from("youtube_comments")
    .update({
      intent: analysis.intent,
      sentiment: analysis.sentiment,
      priority: analysis.priority,
      confidence: analysis.confidence,
      ai_reply: analysis.reply,
      ai_reply_model: ANALYSIS_MODEL,
      status: nextStatus,
    })
    .eq("id", commentId);

  if (error) {
    console.error("[youtube-comments][analyze:single] update failed", {
      commentId,
      error: error.message,
    });
    throw error;
  }

  console.log("[youtube-comments][analyze:single] completed", {
    commentId,
    status: nextStatus,
    confidence: analysis.confidence,
    shouldReply: analysis.shouldReply,
  });

  return {
    analysis,
    status: nextStatus,
  };
}

export async function analyzePendingYoutubeComments(input: {
  youtubeConnectionId: string;
  limit?: number;
}) {
  console.log("[youtube-comments][analyze:queue] started", input);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("youtube_comments")
    .select("id")
    .eq("youtube_connection_id", input.youtubeConnectionId)
    .in("status", ["needs_reply", "waiting_review"])
    .order("published_at", { ascending: false })
    .limit(input.limit ?? 20);

  if (error) {
    console.error("[youtube-comments][analyze:queue] failed to load queue", {
      error: error.message,
      input,
    });
    throw error;
  }

  console.log("[youtube-comments][analyze:queue] loaded queue", {
    input,
    queuedComments: (data ?? []).length,
  });

  const results = [] as Array<{ id: string; status: CommentInboxStatus }>;
  for (const row of data ?? []) {
    const result = await analyzeYoutubeComment(row.id as string);
    results.push({ id: row.id as string, status: result.status });
  }

  console.log("[youtube-comments][analyze:queue] completed", {
    input,
    analyzedComments: results.length,
  });
  return results;
}

export async function updateYoutubeCommentStatus(input: {
  commentId: string;
  status: CommentInboxStatus;
  aiReply?: string;
}) {
  console.log("[youtube-comments][service:updateStatus] started", {
    commentId: input.commentId,
    status: input.status,
    hasAiReply:
      typeof input.aiReply === "string" && input.aiReply.trim().length > 0,
  });
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {
    status: input.status,
  };

  if (typeof input.aiReply === "string") {
    patch.ai_reply = input.aiReply;
  }

  if (input.status === "approved" || input.status === "ignored") {
    patch.reviewed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("youtube_comments")
    .update(patch)
    .eq("id", input.commentId);

  if (error) {
    console.error("[youtube-comments][service:updateStatus] failed", {
      commentId: input.commentId,
      status: input.status,
      error: error.message,
    });
    throw error;
  }

  console.log("[youtube-comments][service:updateStatus] completed", {
    commentId: input.commentId,
    status: input.status,
  });
}
