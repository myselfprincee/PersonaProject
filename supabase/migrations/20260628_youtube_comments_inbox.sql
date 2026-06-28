create table if not exists public.youtube_comments (
  id uuid primary key default gen_random_uuid(),
  youtube_connection_id uuid not null references public.youtube_connections(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  youtube_video_id text not null,
  youtube_comment_id text not null unique,
  youtube_parent_comment_id text null,
  youtube_reply_comment_id text null,
  author_name text null,
  author_channel_id text null,
  author_channel_url text null,
  author_avatar_url text null,
  author_is_uploader boolean not null default false,
  author_is_verified boolean not null default false,
  comment_text text not null,
  like_count integer not null default 0,
  published_at timestamptz null,
  comment_updated_at timestamptz null,
  status text not null default 'needs_reply',
  intent text null,
  sentiment text null,
  priority text null,
  confidence double precision null,
  ai_reply text null,
  ai_reply_model text null,
  reviewed_at timestamptz null,
  posted_at timestamptz null,
  reply_error text null,
  raw_payload jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint youtube_comments_status_check check (
    status in (
      'needs_reply',
      'ai_ready',
      'waiting_review',
      'approved',
      'posted',
      'ignored'
    )
  ),
  constraint youtube_comments_priority_check check (
    priority is null or priority in ('low', 'medium', 'high')
  ),
  constraint youtube_comments_sentiment_check check (
    sentiment is null or sentiment in ('positive', 'neutral', 'negative', 'mixed')
  )
);

create index if not exists youtube_comments_connection_status_idx
  on public.youtube_comments (youtube_connection_id, status, published_at desc);

create index if not exists youtube_comments_video_idx
  on public.youtube_comments (video_id, published_at desc);

create index if not exists youtube_comments_parent_idx
  on public.youtube_comments (youtube_parent_comment_id);

create or replace function public.set_youtube_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_youtube_comments_updated_at on public.youtube_comments;
create trigger trg_youtube_comments_updated_at
before update on public.youtube_comments
for each row
execute function public.set_youtube_comments_updated_at();
