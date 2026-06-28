create extension if not exists pgcrypto;

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  youtube_connection_id uuid not null references public.youtube_connections(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  requested_by text not null,
  trigger_source text not null default 'manual' check (trigger_source in ('manual', 'scheduled', 'retry_failed', 'refresh')),
  total_videos integer not null default 0,
  processed_videos integer not null default 0,
  failed_videos integer not null default 0,
  active_videos integer not null default 0,
  stage text not null default 'pending' check (stage in ('pending', 'catalog_imported', 'downloading_transcript', 'uploading_transcript', 'parsing_transcript', 'chunking_transcript', 'generating_embeddings', 'completed', 'failed', 'cancelled')),
  progress_percent numeric(5,2) not null default 0,
  started_at timestamptz null,
  finished_at timestamptz null,
  cancel_requested_at timestamptz null,
  pause_requested_at timestamptz null,
  error_summary jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_processing_states (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid not null references public.ingestion_runs(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed_retryable', 'failed_terminal', 'paused', 'cancelled')),
  stage text not null default 'pending' check (stage in ('pending', 'catalog_imported', 'downloading_transcript', 'uploading_transcript', 'parsing_transcript', 'chunking_transcript', 'generating_embeddings', 'completed', 'failed', 'cancelled')),
  retry_count integer not null default 0,
  last_error_code text null,
  last_error_message text null,
  transcript_downloaded_at timestamptz null,
  transcript_uploaded_at timestamptz null,
  parsed_at timestamptz null,
  chunked_at timestamptz null,
  embedded_at timestamptz null,
  completed_at timestamptz null,
  started_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingestion_run_id, video_id)
);

create table if not exists public.pipeline_tasks (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid not null references public.ingestion_runs(id) on delete cascade,
  video_processing_state_id uuid null references public.video_processing_states(id) on delete cascade,
  video_id uuid null references public.videos(id) on delete cascade,
  task_type text not null check (task_type in ('catalog_import', 'download_transcript', 'upload_transcript', 'parse_transcript', 'chunk_transcript', 'generate_embeddings')),
  status text not null default 'queued' check (status in ('queued', 'leased', 'running', 'completed', 'failed_retryable', 'failed_terminal', 'cancelled')),
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  lease_expires_at timestamptz null,
  available_at timestamptz not null default now(),
  worker_id text null,
  payload jsonb null,
  result jsonb null,
  last_error jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_task_attempts (
  id uuid primary key default gen_random_uuid(),
  pipeline_task_id uuid not null references public.pipeline_tasks(id) on delete cascade,
  attempt_number integer not null,
  worker_id text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null,
  error_code text null,
  error_message text null,
  metrics jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists public.run_stage_counters (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid not null references public.ingestion_runs(id) on delete cascade,
  stage text not null check (stage in ('pending', 'catalog_imported', 'downloading_transcript', 'uploading_transcript', 'parsing_transcript', 'chunking_transcript', 'generating_embeddings', 'completed', 'failed', 'cancelled')),
  queued_count integer not null default 0,
  running_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  total_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (ingestion_run_id, stage)
);

create index if not exists idx_ingestion_runs_user_created_at
  on public.ingestion_runs (clerk_user_id, created_at desc);

create index if not exists idx_ingestion_runs_status
  on public.ingestion_runs (status, updated_at desc);

create index if not exists idx_video_processing_states_run_stage_status
  on public.video_processing_states (ingestion_run_id, stage, status);

create index if not exists idx_video_processing_states_video_id
  on public.video_processing_states (video_id);

create index if not exists idx_pipeline_tasks_status_available_priority
  on public.pipeline_tasks (status, available_at, priority desc);

create index if not exists idx_pipeline_tasks_run_status
  on public.pipeline_tasks (ingestion_run_id, status);

create index if not exists idx_pipeline_tasks_video_task_type
  on public.pipeline_tasks (video_id, task_type);

create index if not exists idx_pipeline_task_attempts_task_id
  on public.pipeline_task_attempts (pipeline_task_id, attempt_number desc);

create index if not exists idx_run_stage_counters_run_id
  on public.run_stage_counters (ingestion_run_id);

create or replace function public.lease_pipeline_task(
  p_worker_id text,
  p_task_types text[] default null
)
returns setof public.pipeline_tasks
language sql
as $$
  with candidate as (
    select pt.id
    from public.pipeline_tasks pt
    join public.ingestion_runs ir on ir.id = pt.ingestion_run_id
    where pt.available_at <= now()
      and (
        pt.status = 'queued'
        or (pt.status = 'leased' and pt.lease_expires_at is not null and pt.lease_expires_at < now())
      )
      and (p_task_types is null or pt.task_type = any (p_task_types))
      and ir.status in ('queued', 'running')
      and ir.pause_requested_at is null
      and ir.cancel_requested_at is null
    order by pt.priority desc, pt.created_at asc
    for update skip locked
    limit 1
  )
  update public.pipeline_tasks pt
  set status = 'leased',
      worker_id = p_worker_id,
      lease_expires_at = now() + interval '5 minutes',
      updated_at = now()
  from candidate
  where pt.id = candidate.id
  returning pt.*;
$$;
