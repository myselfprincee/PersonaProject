alter table public.videos
  add column if not exists description text null,
  add column if not exists upload_date date null,
  add column if not exists duration integer null,
  add column if not exists view_count bigint null,
  add column if not exists like_count bigint null,
  add column if not exists comment_count bigint null,
  add column if not exists thumbnail_url text null,
  add column if not exists tags text[] not null default '{}',
  add column if not exists categories text[] not null default '{}',
  add column if not exists language text null,
  add column if not exists chapters jsonb null,
  add column if not exists heatmap jsonb null;

create table if not exists public.video_insights (
  video_id uuid primary key references public.videos(id) on delete cascade,
  summary text not null,
  hook text not null,
  thumbnail_description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.video_processing_states
  add column if not exists details_collected_at timestamptz null,
  add column if not exists insights_generated_at timestamptz null;

alter table public.ingestion_runs
  drop constraint if exists ingestion_runs_stage_check;
alter table public.video_processing_states
  drop constraint if exists video_processing_states_stage_check;
alter table public.pipeline_tasks
  drop constraint if exists pipeline_tasks_task_type_check;
alter table public.run_stage_counters
  drop constraint if exists run_stage_counters_stage_check;

alter table public.ingestion_runs
  add constraint ingestion_runs_stage_check
  check (
    stage in (
      'pending',
      'catalog_imported',
      'downloading_transcript',
      'uploading_transcript',
      'parsing_transcript',
      'chunking_transcript',
      'generating_embeddings',
      'collecting_video_details',
      'generating_video_insights',
      'completed',
      'failed',
      'cancelled'
    )
  );

alter table public.video_processing_states
  add constraint video_processing_states_stage_check
  check (
    stage in (
      'pending',
      'catalog_imported',
      'downloading_transcript',
      'uploading_transcript',
      'parsing_transcript',
      'chunking_transcript',
      'generating_embeddings',
      'collecting_video_details',
      'generating_video_insights',
      'completed',
      'failed',
      'cancelled'
    )
  );

alter table public.pipeline_tasks
  add constraint pipeline_tasks_task_type_check
  check (
    task_type in (
      'catalog_import',
      'download_transcript',
      'upload_transcript',
      'parse_transcript',
      'chunk_transcript',
      'generate_embeddings',
      'collect_video_details',
      'generate_video_insights'
    )
  );

alter table public.run_stage_counters
  add constraint run_stage_counters_stage_check
  check (
    stage in (
      'pending',
      'catalog_imported',
      'downloading_transcript',
      'uploading_transcript',
      'parsing_transcript',
      'chunking_transcript',
      'generating_embeddings',
      'collecting_video_details',
      'generating_video_insights',
      'completed',
      'failed',
      'cancelled'
    )
  );

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
