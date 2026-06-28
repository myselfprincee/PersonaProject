import {
  leaseNextPipelineTask,
  pauseOpenTasksForRun,
  updatePipelineTask,
} from "@/repositories/pipeline-task.repository";
import { updateIngestionRun } from "@/repositories/ingestion-run.repository";
import { updateVideoProcessingState } from "@/repositories/video-processing.repository";
import { syncIngestionRunProgress } from "@/services/ingestion/run-progress-sync.service";
import type {
  PipelineTaskRecord,
  PipelineTaskType,
  VideoProcessingStage,
} from "@/types/ingestion";
import { exponentialBackoffSeconds } from "@/workers/shared/backoff";
import { runCatalogImportTask } from "@/workers/stages/catalog-import.worker";
import { runCollectVideoDetailsTask } from "@/workers/stages/collect-video-details.worker";
import { runGenerateVideoInsightsTask } from "@/workers/stages/generate-video-insights.worker";
import { runTranscriptDownloadTask } from "@/workers/stages/transcript-download.worker";
import { runTranscriptUploadTask } from "@/workers/stages/transcript-upload.worker";

function taskTypeToStage(
  taskType: PipelineTaskType,
): VideoProcessingStage | null {
  switch (taskType) {
    case "download_transcript":
      return "downloading_transcript";
    case "upload_transcript":
      return "uploading_transcript";
    case "parse_transcript":
      return "parsing_transcript";
    case "chunk_transcript":
      return "chunking_transcript";
    case "generate_embeddings":
      return "generating_embeddings";
    case "collect_video_details":
      return "collecting_video_details";
    case "generate_video_insights":
      return "generating_video_insights";
    default:
      return null;
  }
}

async function executeTask(task: PipelineTaskRecord) {
  switch (task.task_type) {
    case "catalog_import":
      return runCatalogImportTask(task);
    case "download_transcript":
      return runTranscriptDownloadTask(task);
    case "upload_transcript":
      return runTranscriptUploadTask(task);
    case "collect_video_details":
      return runCollectVideoDetailsTask(task);
    case "generate_video_insights":
      return runGenerateVideoInsightsTask(task);
    default:
      return {
        ok: false as const,
        retryable: false,
        code: "unsupported_task_type",
        message: `No worker is registered for task type: ${task.task_type}`,
      };
  }
}

export async function runOneIngestionTask(
  workerId: string,
  ingestionRunId?: string,
) {
  console.log("[worker] attempting to lease task", {
    workerId,
    ingestionRunId: ingestionRunId ?? null,
  });
  const task = await leaseNextPipelineTask(
    workerId,
    undefined,
    ingestionRunId,
  );

  if (!task) {
    console.log("[worker] no task available", { workerId });
    return null;
  }

  console.log("[worker] leased task", {
    workerId,
    taskId: task.id,
    taskType: task.task_type,
    ingestionRunId: task.ingestion_run_id,
    videoId: task.video_id,
    attemptCount: task.attempt_count,
  });

  const nextAttemptCount = task.attempt_count + 1;
  const taskStage = taskTypeToStage(task.task_type);

  await updatePipelineTask(task.id, {
    status: "running",
    attempt_count: nextAttemptCount,
    worker_id: workerId,
  });

  if (task.video_processing_state_id && taskStage) {
    await updateVideoProcessingState(task.video_processing_state_id, {
      status: "running",
      stage: taskStage,
      retry_count: nextAttemptCount - 1,
      last_error_code: null,
      last_error_message: null,
    });
  }

  const result = await executeTask({
    ...task,
    attempt_count: nextAttemptCount,
    status: "running",
    worker_id: workerId,
  });

  if (result.ok) {
    await updatePipelineTask(task.id, {
      status: "completed",
      lease_expires_at: null,
      worker_id: null,
      result: result.result ?? null,
      last_error: null,
    });

    console.log("[worker] task completed", {
      workerId,
      taskId: task.id,
      taskType: task.task_type,
      ingestionRunId: task.ingestion_run_id,
    });

    await syncIngestionRunProgress(task.ingestion_run_id);

    return {
      taskId: task.id,
      taskType: task.task_type,
      status: "completed",
      result: result.result ?? null,
    };
  }

  const shouldRetry = result.retryable && nextAttemptCount < task.max_attempts;
  const stage = taskStage;
  const isGeminiQuotaExhausted = result.code === "gemini_daily_limit_reached";

  await updatePipelineTask(task.id, {
    status: isGeminiQuotaExhausted
      ? "queued"
      : shouldRetry
        ? "failed_retryable"
        : "failed_terminal",
    lease_expires_at: null,
    worker_id: null,
    available_at: new Date(
      Date.now() + exponentialBackoffSeconds(nextAttemptCount) * 1000,
    ).toISOString(),
    last_error: {
      code: result.code,
      message: result.message,
      retryable: result.retryable,
      details: result.details ?? null,
    },
  });

  if (task.video_processing_state_id && stage) {
    await updateVideoProcessingState(task.video_processing_state_id, {
      status: isGeminiQuotaExhausted
        ? "paused"
        : shouldRetry
          ? "failed_retryable"
          : "failed_terminal",
      stage,
      retry_count: nextAttemptCount,
      last_error_code: result.code,
      last_error_message: result.message,
    });
  }

  if (isGeminiQuotaExhausted) {
    await pauseOpenTasksForRun(task.ingestion_run_id);
    await updateIngestionRun(task.ingestion_run_id, {
      status: "paused",
      stage: "generating_video_insights",
      error_summary: {
        code: result.code,
        message: result.message,
        retryAfterSeconds:
          typeof result.details?.retryAfterSeconds === "number"
            ? result.details.retryAfterSeconds
            : null,
      },
      finished_at: null,
    });

    console.warn("[worker] run paused due to Gemini daily quota", {
      workerId,
      taskId: task.id,
      ingestionRunId: task.ingestion_run_id,
      retryAfterSeconds:
        typeof result.details?.retryAfterSeconds === "number"
          ? result.details.retryAfterSeconds
          : null,
    });
  }

  console.error("[worker] task failed", {
    workerId,
    taskId: task.id,
    taskType: task.task_type,
    ingestionRunId: task.ingestion_run_id,
    shouldRetry,
    isGeminiQuotaExhausted,
    code: result.code,
    message: result.message,
  });

  if (!isGeminiQuotaExhausted) {
    await syncIngestionRunProgress(task.ingestion_run_id);
  }

  return {
    taskId: task.id,
    taskType: task.task_type,
    status: isGeminiQuotaExhausted
      ? "paused"
      : shouldRetry
        ? "failed_retryable"
        : "failed_terminal",
    error: result,
  };
}
