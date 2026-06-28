import { embedTextWithGemini } from "@/services/embeddings/embedding.service";

export async function embedQuery(question: string) {
  return embedTextWithGemini(`search_query: ${question}`);
}
