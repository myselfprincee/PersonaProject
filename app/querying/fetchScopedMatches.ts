import { createAdminClient } from "@/lib/db/supabase-admin";
import { embedQuery } from "@/app/querying/embedQuery";
import { getDynamicMatchCount } from "@/app/querying/getDynamicMatchCount";
import { buildFollowUpAwareRetrievalQuery } from "@/app/querying/buildFollowUpQuery";

const SCOPED_MATCH_RPC_MIGRATION_ERROR =
  "Creator-scoped retrieval is not available yet. Run the Supabase migration that creates match_video_chunks_for_connection.";

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

type FallbackMatchRow = {
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

export type ConversationContext = {
  previousQuestion: string;
  previousAnswer: string;
};

export type ScopedMatch = {
  video_id: string;
  video_title?: string | null;
  chunk_text: string;
  start_ms: number;
  end_ms: number;
  similarity?: number | null;
};

function isMissingScopedMatchFunctionError(error: PostgrestLikeError | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42883" ||
    error.message?.includes("match_video_chunks_for_connection") ||
    false
  );
}

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

async function fetchScopedMatchesFallback(input: {
  youtubeConnectionId: string;
  embedding: number[];
  matchCount: number;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("video_chunks")
    .select(
      "video_id, chunk_text, start_ms, end_ms, embedding, videos!inner(title, youtube_connection_id)",
    )
    .eq("videos.youtube_connection_id", input.youtubeConnectionId);

  if (error) {
    throw new Error(SCOPED_MATCH_RPC_MIGRATION_ERROR);
  }

  const rankedMatches = ((data ?? []) as FallbackMatchRow[])
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
          ? cosineSimilarity(parsedEmbedding, input.embedding)
          : null,
      } satisfies ScopedMatch;
    })
    .sort((left, right) => (right.similarity ?? -1) - (left.similarity ?? -1))
    .slice(0, Math.max(input.matchCount, 1));

  return rankedMatches;
}

export async function fetchScopedMatches(input: {
  youtubeConnectionId: string;
  question: string;
  conversationContext?: ConversationContext | null;
}) {
  const retrievalQuery = buildFollowUpAwareRetrievalQuery(
    input.question,
    input.conversationContext ?? null,
  );
  const embedding = await embedQuery(retrievalQuery);
  const matchCount = getDynamicMatchCount(retrievalQuery);
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc(
    "match_video_chunks_for_connection",
    {
      p_youtube_connection_id: input.youtubeConnectionId,
      query_embedding: embedding,
      match_count: matchCount,
    },
  );

  if (error) {
    if (isMissingScopedMatchFunctionError(error)) {
      const matches = await fetchScopedMatchesFallback({
        youtubeConnectionId: input.youtubeConnectionId,
        embedding,
        matchCount,
      });

      return {
        matches,
        matchCount,
        retrievalQuery,
      };
    }

    throw error;
  }

  return {
    matches: (data ?? []) as ScopedMatch[],
    matchCount,
    retrievalQuery,
  };
}
