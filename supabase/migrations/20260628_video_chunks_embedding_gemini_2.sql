create extension if not exists vector;

-- Old transcript chunk embeddings were generated with a different model and
-- dimension. Do not preserve them; replace the column with Gemini Embedding 2
-- dimensionality.
alter table public.video_chunks
  drop column if exists embedding;

alter table public.video_chunks
  add column embedding vector(3072) null;

create or replace function public.match_video_chunks_for_connection(
  p_youtube_connection_id uuid,
  query_embedding vector(3072),
  match_count integer default 5
)
returns table (
  video_id uuid,
  video_title text,
  chunk_text text,
  start_ms integer,
  end_ms integer,
  similarity double precision
)
language sql
as $$
  select
    vc.video_id,
    v.title as video_title,
    vc.chunk_text,
    vc.start_ms,
    vc.end_ms,
    1 - (vc.embedding <=> query_embedding) as similarity
  from public.video_chunks vc
  join public.videos v on v.id = vc.video_id
  where v.youtube_connection_id = p_youtube_connection_id
    and vc.embedding is not null
  order by vc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
