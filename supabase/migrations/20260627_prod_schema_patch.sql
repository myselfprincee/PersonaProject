alter table public.video_insights
  add column if not exists updated_at timestamptz not null default now();

alter table public.video_insights
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists video_insights_video_id_key
  on public.video_insights (video_id);

create or replace function public.set_video_insights_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_video_insights_updated_at on public.video_insights;
create trigger trg_video_insights_updated_at
before update on public.video_insights
for each row
execute function public.set_video_insights_updated_at();

alter table public.transcripts
  add column if not exists source text null,
  add column if not exists checksum_sha256 text null,
  add column if not exists status text null;

create unique index if not exists transcripts_video_id_key
  on public.transcripts (video_id);
