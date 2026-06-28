import { createAdminClient } from "@/lib/db/supabase-admin";
import type {
  PipelineTaskRecord,
  PipelineTaskStatus,
  PipelineTaskType,
} from "@/types/ingestion";

export type CreatePipelineTaskInput = {
  ingestionRunId: string;
  videoProcessingStateId?: string | null;
  videoId?: string | null;
  taskType: PipelineTaskType;
  status?: PipelineTaskStatus;
  priority?: number;
  maxAttempts?: number;
  payload?: Record<string, unknown> | null;
};

function isUniqueViolation(error: {
  code?: string | null;
  message?: string | null;
}) {
  return (
    error.code === "23505" ||
    error.message?.toLowerCase().includes("duplicate key") ||
    false
  );
}

async function findExistingOpenTask(
  input: CreatePipelineTaskInput,
  dedupeStatuses: PipelineTaskStatus[] = [
    "queued",
    "leased",
    "running",
    "failed_retryable",
  ],
) {
  const supabase = createAdminClient();

  const query = supabase
    .from("pipeline_tasks")
    .select("*")
    .eq("ingestion_run_id", input.ingestionRunId)
    .eq("task_type", input.taskType)
    .in("status", dedupeStatuses)
    .limit(1);

  const scopedQuery = input.videoId
    ? query.eq("video_id", input.videoId)
    : query.is("video_id", null);

  const existingResult = await scopedQuery.maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  return (existingResult.data as PipelineTaskRecord | null) ?? null;
}

export async function createPipelineTask(input: CreatePipelineTaskInput) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("pipeline_tasks")
    .insert({
      ingestion_run_id: input.ingestionRunId,
      video_processing_state_id: input.videoProcessingStateId ?? null,
      video_id: input.videoId ?? null,
      task_type: input.taskType,
      status: input.status ?? "queued",
      priority: input.priority ?? 100,
      max_attempts: input.maxAttempts ?? 3,
      payload: input.payload ?? {},
    })
    .select("*")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const existingTask = await findExistingOpenTask(input);

      if (existingTask) {
        return existingTask;
      }
    }

    throw error;
  }

  return data as PipelineTaskRecord;
}

export async function createPipelineTaskIfAbsent(
  input: CreatePipelineTaskInput,
  dedupeStatuses: PipelineTaskStatus[] = [
    "queued",
    "leased",
    "running",
    "failed_retryable",
  ],
) {
  const existingTask = await findExistingOpenTask(input, dedupeStatuses);

  if (existingTask) {
    return existingTask;
  }

  return createPipelineTask(input);
}

export async function createManyPipelineTasks(
  inputs: CreatePipelineTaskInput[],
) {
  if (inputs.length === 0) {
    return [] as PipelineTaskRecord[];
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("pipeline_tasks")
    .insert(
      inputs.map((input) => ({
        ingestion_run_id: input.ingestionRunId,
        video_processing_state_id: input.videoProcessingStateId ?? null,
        video_id: input.videoId ?? null,
        task_type: input.taskType,
        status: input.status ?? "queued",
        priority: input.priority ?? 100,
        max_attempts: input.maxAttempts ?? 3,
        payload: input.payload ?? {},
      })),
    )
    .select("*");

  if (error) {
    throw error;
  }

  return (data ?? []) as PipelineTaskRecord[];
}

export async function createManyPipelineTasksIfAbsent(
  inputs: CreatePipelineTaskInput[],
  dedupeStatuses: PipelineTaskStatus[] = [
    "queued",
    "leased",
    "running",
    "failed_retryable",
  ],
) {
  const created: PipelineTaskRecord[] = [];

  for (const input of inputs) {
    created.push(await createPipelineTaskIfAbsent(input, dedupeStatuses));
  }

  return created;
}

export async function leaseNextPipelineTask(
  workerId: string,
  taskTypes?: PipelineTaskType[],
  ingestionRunId?: string,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("lease_pipeline_task", {
    p_worker_id: workerId,
    p_task_types: taskTypes ?? null,
    p_ingestion_run_id: ingestionRunId ?? null,
  });

  if (error) {
    throw error;
  }

  const tasks = (data ?? []) as PipelineTaskRecord[];
  return tasks[0] ?? null;
}

export async function updatePipelineTask(
  taskId: string,
  patch: Partial<{
    status: PipelineTaskStatus;
    attempt_count: number;
    lease_expires_at: string | null;
    available_at: string;
    worker_id: string | null;
    result: Record<string, unknown> | null;
    last_error: Record<string, unknown> | null;
  }>,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("pipeline_tasks")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PipelineTaskRecord;
}

export async function listOpenTasksForRun(runId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("pipeline_tasks")
    .select("*")
    .eq("ingestion_run_id", runId)
    .in("status", ["queued", "leased", "running", "failed_retryable"])
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PipelineTaskRecord[];
}

export async function cancelQueuedTasksForRun(runId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("pipeline_tasks")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("ingestion_run_id", runId)
    .eq("status", "queued");

  if (error) {
    throw error;
  }
}

export async function cancelOpenTasksForRun(runId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("pipeline_tasks")
    .update({
      status: "cancelled",
      worker_id: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("ingestion_run_id", runId)
    .in("status", ["queued", "leased", "running", "failed_retryable"]);

  if (error) {
    throw error;
  }
}

export async function pauseOpenTasksForRun(runId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("pipeline_tasks")
    .update({
      status: "queued",
      worker_id: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("ingestion_run_id", runId)
    .in("status", ["queued", "leased", "running", "failed_retryable"]);

  if (error) {
    throw error;
  }
}
