import { createAdminClient } from "@/lib/db/supabase-admin";
import { embedTextWithGemini } from "@/services/embeddings/embedding.service";

const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-2";

export type ContentIdeaInsightMatch = {
  videoId: string;
  youtubeVideoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  uploadDate: string | null;
  duration: number | null;
  summary: string;
  hook: string;
  thumbnailDescription: string;
  topics: string[];
  keywords: string[];
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  tags: string[];
  categories: string[];
  language: string | null;
  chapters: unknown;
  heatmap: unknown;
  similarity: number;
};

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

type RpcInsightRow = {
  video_id: string;
  youtube_video_id: string;
  video_title: string;
  video_description: string | null;
  thumbnail_url: string | null;
  upload_date: string | null;
  duration: number | null;
  summary: string;
  hook: string;
  thumbnail_description: string;
  topics: string[] | null;
  keywords: string[] | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  tags: unknown;
  categories: unknown;
  language: string | null;
  chapters: unknown;
  heatmap: unknown;
  similarity: number | null;
};

type FallbackInsightRow = {
  video_id: string;
  summary: string;
  hook: string;
  thumbnail_description: string;
  topics: string[] | null;
  keywords: string[] | null;
  embedding: number[] | string | null;
  videos:
    | {
        video_id?: string | null;
        title?: string | null;
        description?: string | null;
        thumbnail_url?: string | null;
        upload_date?: string | null;
        duration?: number | null;
        youtube_connection_id?: string | null;
        view_count?: number | null;
        like_count?: number | null;
        comment_count?: number | null;
        tags?: string[] | null;
        categories?: string[] | null;
        language?: string | null;
        chapters?: unknown;
        heatmap?: unknown;
      }
    | Array<{
        video_id?: string | null;
        title?: string | null;
        description?: string | null;
        thumbnail_url?: string | null;
        upload_date?: string | null;
        duration?: number | null;
        youtube_connection_id?: string | null;
        view_count?: number | null;
        like_count?: number | null;
        comment_count?: number | null;
        tags?: string[] | null;
        categories?: string[] | null;
        language?: string | null;
        chapters?: unknown;
        heatmap?: unknown;
      }>;
};

function parseEmbedding(value: number[] | string | null) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  const parsed = trimmed
    .slice(1, -1)
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));

  return parsed.length > 0 ? parsed : null;
}

function cosineSimilarity(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);

  if (size === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function isMissingMatchFunctionError(error: PostgrestLikeError | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42883" ||
    error.message?.includes("match_video_insights_for_connection") ||
    false
  );
}

function normalizeInsightMatch(row: RpcInsightRow): ContentIdeaInsightMatch {
  return {
    videoId: row.video_id,
    youtubeVideoId: row.youtube_video_id,
    title: row.video_title,
    description: row.video_description ?? "",
    thumbnailUrl: row.thumbnail_url,
    uploadDate: row.upload_date,
    duration: typeof row.duration === "number" ? row.duration : null,
    summary: row.summary,
    hook: row.hook,
    thumbnailDescription: row.thumbnail_description,
    topics: Array.isArray(row.topics) ? row.topics : [],
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    viewCount: typeof row.view_count === "number" ? row.view_count : null,
    likeCount: typeof row.like_count === "number" ? row.like_count : null,
    commentCount:
      typeof row.comment_count === "number" ? row.comment_count : null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    categories: Array.isArray(row.categories) ? row.categories : [],
    language: row.language ?? null,
    chapters: row.chapters ?? null,
    heatmap: row.heatmap ?? null,
    similarity: typeof row.similarity === "number" ? row.similarity : 0,
  };
}

export async function embedContentIdeaQuery(query: string) {
  return embedTextWithGemini(query);
}

async function fetchFallbackInsightMatches(input: {
  youtubeConnectionId: string;
  embedding: number[];
  limit: number;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("video_insights")
    .select(
      "video_id, summary, hook, thumbnail_description, topics, keywords, embedding, videos!inner(video_id, title, description, thumbnail_url, upload_date, duration, youtube_connection_id, view_count, like_count, comment_count, tags, categories, language, chapters, heatmap)",
    )
    .eq("videos.youtube_connection_id", input.youtubeConnectionId)
    .not("embedding", "is", null);

  if (error) {
    throw error;
  }

  return ((data ?? []) as FallbackInsightRow[])
    .map((row) => {
      const parsedEmbedding = parseEmbedding(row.embedding);
      const video = Array.isArray(row.videos) ? row.videos[0] : row.videos;

      return {
        videoId: row.video_id,
        youtubeVideoId: video?.video_id ?? "",
        title: video?.title ?? "Untitled",
        description: video?.description ?? "",
        thumbnailUrl: video?.thumbnail_url ?? null,
        uploadDate: video?.upload_date ?? null,
        duration: typeof video?.duration === "number" ? video.duration : null,
        summary: row.summary,
        hook: row.hook,
        thumbnailDescription: row.thumbnail_description,
        topics: Array.isArray(row.topics) ? row.topics : [],
        keywords: Array.isArray(row.keywords) ? row.keywords : [],
        viewCount:
          typeof video?.view_count === "number" ? video.view_count : null,
        likeCount:
          typeof video?.like_count === "number" ? video.like_count : null,
        commentCount:
          typeof video?.comment_count === "number" ? video.comment_count : null,
        tags: Array.isArray(video?.tags) ? video.tags : [],
        categories: Array.isArray(video?.categories) ? video.categories : [],
        language: video?.language ?? null,
        chapters: video?.chapters ?? null,
        heatmap: video?.heatmap ?? null,
        similarity: parsedEmbedding
          ? cosineSimilarity(parsedEmbedding, input.embedding)
          : -1,
      } satisfies ContentIdeaInsightMatch;
    })
    .filter((row) => row.similarity >= 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, Math.max(input.limit, 1));
}

export async function searchVideoInsightsForContentIdeas(input: {
  youtubeConnectionId: string;
  query: string;
  limit?: number;
}) {
  const embedding = await embedContentIdeaQuery(input.query);
  const limit = Math.min(Math.max(input.limit ?? 15, 1), 25);
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc(
    "match_video_insights_for_connection",
    {
      p_youtube_connection_id: input.youtubeConnectionId,
      query_embedding: `[${embedding.join(",")}]`,
      match_count: limit,
    },
  );

  if (error) {
    if (isMissingMatchFunctionError(error)) {
      const matches = await fetchFallbackInsightMatches({
        youtubeConnectionId: input.youtubeConnectionId,
        embedding,
        limit,
      });

      return {
        query: input.query,
        model: EMBEDDING_MODEL,
        dimensions: embedding.length,
        matches,
      };
    }

    throw error;
  }

  return {
    query: input.query,
    model: EMBEDDING_MODEL,
    dimensions: embedding.length,
    matches: ((data ?? []) as RpcInsightRow[]).map(normalizeInsightMatch),
  };
}
