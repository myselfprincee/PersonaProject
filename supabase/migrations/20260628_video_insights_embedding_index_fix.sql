create extension if not exists vector;

-- For Gemini Embedding 2 (3072 dims), use ivfflat instead of hnsw because
-- some pgvector builds reject hnsw indexes above 2000 dimensions.
drop index if exists public.video_insights_embedding_idx;

create index if not exists video_insights_embedding_idx
  on public.video_insights
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;
