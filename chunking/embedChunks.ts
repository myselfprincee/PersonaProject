import { type Chunk } from "@/chunking/transcriptChunker";
import { createClient } from "@/lib/supabase/server";
import { generateEmbeddingsForTexts } from "@/services/embeddings/embedding.service";

export async function embedChunks(chunks: Chunk[], videoId: string) {
  const supabase = await createClient();
  const embeddings = await generateEmbeddingsForTexts(
    chunks.map((chunk) => chunk.chunkText),
  );

  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Expected ${chunks.length} embeddings but received ${embeddings.length}`,
    );
  }

  const embeddedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));

  const { error } = await supabase.from("video_chunks").insert(
    embeddedChunks.map((chunk) => ({
      video_id: videoId,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.chunkText,
      start_ms: chunk.startMs,
      end_ms: chunk.endMs,
      word_count: chunk.wordCount,
      embedding: chunk.embedding,
    })),
  );

  if (error) {
    throw error;
  }

  return embeddedChunks;
}
