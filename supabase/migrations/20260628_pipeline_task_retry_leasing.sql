-- Retryable tasks remain part of the open queue until their backoff expires.
-- Running tasks also keep the lease acquired before execution, so an expired
-- running lease must be recoverable after a worker or request is interrupted.
drop function if exists public.lease_pipeline_task(text, text[]);

create function public.lease_pipeline_task(
  p_worker_id text,
  p_task_types text[] default null,
  p_ingestion_run_id uuid default null
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
        pt.status in ('queued', 'failed_retryable')
        or (
          pt.status in ('leased', 'running')
          and pt.lease_expires_at is not null
          and pt.lease_expires_at < now()
        )
      )
      and (p_task_types is null or pt.task_type = any (p_task_types))
      and (
        p_ingestion_run_id is null
        or pt.ingestion_run_id = p_ingestion_run_id
      )
      and ir.status in ('queued', 'running')
      and ir.pause_requested_at is null
      and ir.cancel_requested_at is null
    order by pt.priority desc, pt.available_at asc, pt.created_at asc
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
  returning pt.*
$$;

-- A retryable task is still open work. Include it in the uniqueness boundary
-- so concurrent repair/retry requests cannot create another task for the same
-- video and stage.
update public.pipeline_tasks
set status = 'queued',
    worker_id = null,
    lease_expires_at = null,
    updated_at = now()
where status = 'paused';

with ranked_open_tasks as (
  select
    id,
    row_number() over (
      partition by
        ingestion_run_id,
        task_type,
        coalesce(video_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by
        case status
          when 'running' then 1
          when 'leased' then 2
          when 'queued' then 3
          else 5
        end,
        created_at asc,
        id asc
    ) as row_rank
  from public.pipeline_tasks
  where status in (
    'queued',
    'leased',
    'running',
    'failed_retryable'
  )
)
update public.pipeline_tasks pt
set status = 'cancelled',
    worker_id = null,
    lease_expires_at = null,
    updated_at = now(),
    last_error = coalesce(pt.last_error, '{}'::jsonb) || jsonb_build_object(
      'code', 'deduped_by_retry_leasing_migration',
      'message', 'Cancelled duplicate open pipeline task before enabling retry leasing.'
    )
from ranked_open_tasks rot
where pt.id = rot.id
  and rot.row_rank > 1;

drop index if exists public.idx_pipeline_tasks_open_unique_per_video;
drop index if exists public.idx_pipeline_tasks_open_unique_run_level;

create unique index idx_pipeline_tasks_open_unique_per_video
  on public.pipeline_tasks (ingestion_run_id, task_type, video_id)
  where video_id is not null
    and status in ('queued', 'leased', 'running', 'failed_retryable');

create unique index idx_pipeline_tasks_open_unique_run_level
  on public.pipeline_tasks (ingestion_run_id, task_type)
  where video_id is null
    and status in ('queued', 'leased', 'running', 'failed_retryable');


