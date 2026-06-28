create or replace function public.match_video_insights_for_connection(
  p_youtube_connection_id uuid,
  query_embedding vector(3072),
  match_count integer default 15
)
returns table (
  video_id uuid,
  youtube_video_id text,
  video_title text,
  video_description text,
  thumbnail_url text,
  upload_date date,
  duration integer,
  summary text,
  hook text,
  thumbnail_description text,
  topics text[],
  keywords text[],
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  tags jsonb,
  categories jsonb,
  language text,
  chapters jsonb,
  heatmap jsonb,
  similarity double precision
)
language sql
as $$
  select
    vi.video_id,
    v.video_id as youtube_video_id,
    v.title as video_title,
    v.description as video_description,
    v.thumbnail_url,
    v.upload_date,
    v.duration,
    vi.summary,
    vi.hook,
    vi.thumbnail_description,
    vi.topics,
    vi.keywords,
    v.view_count,
    v.like_count,
    v.comment_count,
    v.tags,
    v.categories,
    v.language,
    v.chapters,
    v.heatmap,
    1 - (vi.embedding <=> query_embedding) as similarity
  from public.video_insights vi
  join public.videos v on v.id = vi.video_id
  where v.youtube_connection_id = p_youtube_connection_id
    and vi.embedding is not null
  order by vi.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
