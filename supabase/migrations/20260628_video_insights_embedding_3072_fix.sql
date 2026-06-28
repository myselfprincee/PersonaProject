create extension if not exists vector;

-- Gemini Embedding 2 returns 3072 dimensions in production logs.
-- Keep a fixed-dimension column so vectors are validated on write.
alter table public.video_insights
  alter column embedding type vector(3072)
  using embedding::vector(3072);

-- hnsw on some pgvector versions rejects dimensions > 2000.
-- Use ivfflat for 3072-dim embeddings instead.
drop index if exists public.video_insights_embedding_idx;

create index if not exists video_insights_embedding_idx
  on public.video_insights
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;
