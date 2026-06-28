import { buildChunks, parseJson3Transcript } from "@/chunking/transcriptChunker";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { generateEmbeddingsForTexts } from "@/services/embeddings/embedding.service";

const INSERT_BATCH_SIZE = 200;
const EMBEDDING_BATCH_SIZE = 48;

export async function processTranscriptForVideo(input: {
  videoId: string;
  transcriptJson: unknown;
  replaceExisting?: boolean;
}) {
  const supabase = createAdminClient();
  const segments = parseJson3Transcript(input.transcriptJson);

  if (segments.length === 0) {
    throw new Error("Transcript has no parseable segments.");
  }

  const chunks = buildChunks(segments);

  if (chunks.length === 0) {
    throw new Error("Transcript produced no chunks.");
  }

  if (input.replaceExisting ?? true) {
    const { error: deleteError } = await supabase
      .from("video_chunks")
      .delete()
      .eq("video_id", input.videoId);

    if (deleteError) {
      throw deleteError;
    }
  }

  const embeddings = await generateEmbeddingsForTexts(
    chunks.map((chunk) => chunk.chunkText),
    EMBEDDING_BATCH_SIZE,
  );

  const rows = chunks.map((chunk, index) => ({
    video_id: input.videoId,
    chunk_index: chunk.chunkIndex,
    chunk_text: chunk.chunkText,
    start_ms: chunk.startMs,
    end_ms: chunk.endMs,
    word_count: chunk.wordCount,
    embedding: embeddings[index],
  }));

  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE);
    const { error } = await supabase.from("video_chunks").insert(batch);

    if (error) {
      throw error;
    }
  }

  return {
    segmentCount: segments.length,
    chunkCount: chunks.length,
  };
}
