alter table public.youtube_connections
  add column if not exists public_persona_enabled boolean not null default false,
  add column if not exists public_slug text null;

create unique index if not exists idx_youtube_connections_public_slug_unique
  on public.youtube_connections (public_slug)
  where public_slug is not null;

create or replace function public.match_video_chunks_for_connection(
  p_youtube_connection_id uuid,
  query_embedding vector,
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
  order by vc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
