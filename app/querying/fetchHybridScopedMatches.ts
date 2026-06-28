import { createAdminClient } from "@/lib/db/supabase-admin";
import { embedQuery } from "@/app/querying/embedQuery";
import { getDynamicMatchCount } from "@/app/querying/getDynamicMatchCount";
import { buildFollowUpAwareRetrievalQuery } from "@/app/querying/buildFollowUpQuery";
import {
  searchVideoInsightsForContentIdeas,
  type ContentIdeaInsightMatch,
} from "@/services/content-ideas/content-ideas-search.service";

export type ConversationContext = {
  previousQuestion: string;
  previousAnswer: string;
};

export type HybridScopedMatch = {
  video_id: string;
  video_title?: string | null;
  chunk_text: string;
  start_ms: number;
  end_ms: number;
  similarity?: number | null;
  videoContext?: ContentIdeaInsightMatch | null;
};

type ChunkRow = {
  id: string;
  video_id: string;
  chunk_text: string;
  start_ms: number;
  end_ms: number;
  embedding: number[] | string | null;
  videos:
    | {
        title?: string | null;
        youtube_connection_id?: string | null;
      }
    | Array<{
        title?: string | null;
        youtube_connection_id?: string | null;
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

export async function fetchHybridScopedMatches(input: {
  youtubeConnectionId: string;
  question: string;
  conversationContext?: ConversationContext | null;
}) {
  const retrievalQuery = buildFollowUpAwareRetrievalQuery(
    input.question,
    input.conversationContext ?? null,
  );
  const chunkEmbedding = await embedQuery(retrievalQuery);
  const chunkMatchCount = Math.max(getDynamicMatchCount(retrievalQuery) * 3, 12);
  const videoMatches = await searchVideoInsightsForContentIdeas({
    youtubeConnectionId: input.youtubeConnectionId,
    query: retrievalQuery,
    limit: 8,
  });
  const videoIds = videoMatches.matches.map((match) => match.videoId);

  if (videoIds.length === 0) {
    return {
      matches: [] as HybridScopedMatch[],
      matchCount: chunkMatchCount,
      retrievalQuery,
      videoMatches: [] as ContentIdeaInsightMatch[],
    };
  }

  const videoContextById = new Map(
    videoMatches.matches.map((match) => [match.videoId, match] as const),
  );
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("video_chunks")
    .select(
      "id, video_id, chunk_text, start_ms, end_ms, embedding, videos!inner(title, youtube_connection_id)",
    )
    .eq("videos.youtube_connection_id", input.youtubeConnectionId)
    .in("video_id", videoIds)
    .not("embedding", "is", null)
    .order("start_ms", { ascending: true });

  if (error) {
    throw error;
  }

  const rankedMatches = ((data ?? []) as ChunkRow[])
    .map((row) => {
      const parsedEmbedding = parseEmbedding(row.embedding);
      const video = Array.isArray(row.videos) ? row.videos[0] : row.videos;

      return {
        video_id: row.video_id,
        video_title: video?.title ?? null,
        chunk_text: row.chunk_text,
        start_ms: row.start_ms,
        end_ms: row.end_ms,
        similarity: parsedEmbedding
          ? cosineSimilarity(parsedEmbedding, chunkEmbedding)
          : null,
        videoContext: videoContextById.get(row.video_id) ?? null,
      } satisfies HybridScopedMatch;
    })
    .sort((left, right) => (right.similarity ?? -1) - (left.similarity ?? -1))
    .slice(0, chunkMatchCount);

  return {
    matches: rankedMatches,
    matchCount: chunkMatchCount,
    retrievalQuery,
    videoMatches: videoMatches.matches,
  };
}
