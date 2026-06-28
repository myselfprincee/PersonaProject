export type CommentInboxStatus =
  | "needs_reply"
  | "ai_ready"
  | "waiting_review"
  | "approved"
  | "posted"
  | "ignored";

export type CommentPriority = "low" | "medium" | "high";
export type CommentSentiment = "positive" | "neutral" | "negative" | "mixed";

export type YoutubeCommentRecord = {
  id: string;
  youtubeConnectionId: string;
  videoId: string;
  youtubeVideoId: string;
  youtubeCommentId: string;
  youtubeParentCommentId: string | null;
  youtubeReplyCommentId: string | null;
  authorName: string | null;
  authorChannelId: string | null;
  authorChannelUrl: string | null;
  authorAvatarUrl: string | null;
  authorIsUploader: boolean;
  authorIsVerified: boolean;
  commentText: string;
  likeCount: number;
  publishedAt: string | null;
  commentUpdatedAt: string | null;
  status: CommentInboxStatus;
  intent: string | null;
  sentiment: CommentSentiment | null;
  priority: CommentPriority | null;
  confidence: number | null;
  aiReply: string | null;
  aiReplyModel: string | null;
  reviewedAt: string | null;
  postedAt: string | null;
  replyError: string | null;
  createdAt: string;
  updatedAt: string;
  rawPayload: unknown;
  video: {
    id: string;
    title: string;
    videoId: string;
    thumbnailUrl: string | null;
  };
};

export type YoutubeCommentAnalysis = {
  intent: string;
  sentiment: CommentSentiment;
  priority: CommentPriority;
  confidence: number;
  shouldReply: boolean;
  suggestedStatus: CommentInboxStatus;
  reply: string;
  rationale: string;
};
