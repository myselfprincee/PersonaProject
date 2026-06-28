with ranked_open_tasks as (
  select
    id,
    row_number() over (
      partition by ingestion_run_id, task_type, coalesce(video_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by created_at asc, id asc
    ) as row_rank
  from public.pipeline_tasks
  where status in ('queued', 'leased', 'running', 'paused')
)
update public.pipeline_tasks pt
set status = 'cancelled',
    worker_id = null,
    lease_expires_at = null,
    updated_at = now(),
    last_error = coalesce(pt.last_error, '{}'::jsonb) || jsonb_build_object(
      'code', 'deduped_by_open_task_uniqueness_migration',
      'message', 'Cancelled duplicate open pipeline task during uniqueness migration.'
    )
from ranked_open_tasks rot
where pt.id = rot.id
  and rot.row_rank > 1;

create unique index if not exists idx_pipeline_tasks_open_unique_per_video
  on public.pipeline_tasks (ingestion_run_id, task_type, video_id)
  where video_id is not null
    and status in ('queued', 'leased', 'running', 'paused');

create unique index if not exists idx_pipeline_tasks_open_unique_run_level
  on public.pipeline_tasks (ingestion_run_id, task_type)
  where video_id is null
    and status in ('queued', 'leased', 'running', 'paused');
