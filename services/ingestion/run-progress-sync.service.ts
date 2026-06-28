import { createAdminClient } from "@/lib/db/supabase-admin";
import { updateIngestionRun } from "@/repositories/ingestion-run.repository";
import { listOpenTasksForRun } from "@/repositories/pipeline-task.repository";
import { repairMissingTasksForRun } from "@/services/ingestion/ingestion-orchestrator";
import { upsertRunStageCounter } from "@/repositories/run-stage-counter.repository";
import { sendIngestionCompletedEmail } from "@/services/notifications/ingestion-email.service";
import {
  VIDEO_PROCESSING_STAGES,
  type VideoProcessingStage,
  type VideoProcessingStatus,
} from "@/types/ingestion";

const STAGE_ORDER: VideoProcessingStage[] = [
  "pending",
  "catalog_imported",
  "downloading_transcript",
  "uploading_transcript",
  "parsing_transcript",
  "chunking_transcript",
  "generating_embeddings",
  "collecting_video_details",
  "generating_video_insights",
  "completed",
  "failed",
  "cancelled",
];

function stageRank(stage: VideoProcessingStage) {
  return STAGE_ORDER.indexOf(stage);
}

export async function syncIngestionRunProgress(ingestionRunId: string) {
  const supabase = createAdminClient();
  const previousRunResult = await supabase
    .from("ingestion_runs")
    .select("*")
    .eq("id", ingestionRunId)
    .maybeSingle();

  if (previousRunResult.error) {
    throw previousRunResult.error;
  }

  const previousRun = previousRunResult.data as {
    status?: string | null;
  } | null;

  const openTasks = await listOpenTasksForRun(ingestionRunId);

  const { data, error } = await supabase
    .from("video_processing_states")
    .select("stage, status")
    .eq("ingestion_run_id", ingestionRunId);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{
    stage: VideoProcessingStage;
    status: VideoProcessingStatus;
  }>;

  const totalVideos = rows.length;
  const processedVideos = rows.filter(
    (row) => row.status === "completed",
  ).length;
  const failedVideos = rows.filter(
    (row) => row.status === "failed_terminal",
  ).length;
  const activeVideos = rows.filter(
    (row) =>
      row.status === "queued" ||
      row.status === "running" ||
      row.status === "failed_retryable" ||
      row.status === "paused",
  ).length;

  for (const stage of VIDEO_PROCESSING_STAGES) {
    const stageRows = rows.filter((row) => row.stage === stage);

    await upsertRunStageCounter({
      ingestionRunId,
      stage,
      queuedCount: stageRows.filter((row) => row.status === "queued").length,
      runningCount: stageRows.filter((row) => row.status === "running").length,
      completedCount: stageRows.filter((row) => row.status === "completed")
        .length,
      failedCount: stageRows.filter(
        (row) =>
          row.status === "failed_retryable" || row.status === "failed_terminal",
      ).length,
      totalCount: stageRows.length,
    });
  }

  if (totalVideos === 0) {
    return updateIngestionRun(ingestionRunId, {
      status: previousRun?.status === "paused" ? "paused" : "queued",
      stage: "pending",
      total_videos: 0,
      processed_videos: 0,
      failed_videos: 0,
      active_videos: 0,
      progress_percent: 0,
    });
  }

  const hasOpenTasks = openTasks.length > 0;

  const terminalVideos = processedVideos + failedVideos;
  const progressPercent = Number(
    ((processedVideos / totalVideos) * 100).toFixed(2),
  );

  if (previousRun?.status === "paused") {
    return updateIngestionRun(ingestionRunId, {
      status: "paused",
      total_videos: totalVideos,
      processed_videos: processedVideos,
      failed_videos: failedVideos,
      active_videos: activeVideos,
      progress_percent: progressPercent,
      finished_at: null,
    });
  }

  if (terminalVideos >= totalVideos) {
    const didFail = failedVideos > 0;
    const shouldMarkCompleted = !didFail && processedVideos === totalVideos;

    const updatedRun = await updateIngestionRun(ingestionRunId, {
      status: didFail ? "failed" : "completed",
      stage: didFail ? "failed" : "completed",
      total_videos: totalVideos,
      processed_videos: processedVideos,
      failed_videos: failedVideos,
      active_videos: 0,
      progress_percent: shouldMarkCompleted
        ? Number(((processedVideos / totalVideos) * 100).toFixed(2))
        : progressPercent,
      finished_at: new Date().toISOString(),
      error_summary: null,
    });

    if (shouldMarkCompleted && previousRun?.status !== "completed") {
      await sendIngestionCompletedEmail(updatedRun).catch(
        (notificationError) => {
          console.error("[run-progress] failed to send completion email", {
            ingestionRunId,
            error:
              notificationError instanceof Error
                ? notificationError.message
                : notificationError,
          });
        },
      );
    }

    return updatedRun;
  }

  if (!hasOpenTasks) {
    const repaired = await repairMissingTasksForRun(ingestionRunId);

    if (repaired > 0) {
      console.warn(
        "[run-progress] repaired missing tasks before marking stalled",
        {
          ingestionRunId,
          repaired,
          totalVideos,
          processedVideos,
          failedVideos,
          activeVideos,
        },
      );

      return updateIngestionRun(ingestionRunId, {
        status: previousRun?.status === "paused" ? "paused" : "running",
        total_videos: totalVideos,
        processed_videos: processedVideos,
        failed_videos: failedVideos,
        active_videos: activeVideos,
        progress_percent: progressPercent,
        finished_at: null,
        error_summary: null,
      });
    }

    return updateIngestionRun(ingestionRunId, {
      status: "failed",
      stage: "failed",
      total_videos: totalVideos,
      processed_videos: processedVideos,
      failed_videos: failedVideos,
      active_videos: 0,
      progress_percent: progressPercent,
      finished_at: new Date().toISOString(),
      error_summary: {
        code: "pipeline_stalled_no_open_tasks",
        message:
          "This run has no open tasks remaining, but not all videos reached a terminal state.",
      },
    });
  }

  const currentStage = rows
    .filter((row) => row.status !== "completed")
    .sort(
      (left, right) => stageRank(left.stage) - stageRank(right.stage),
    )[0]?.stage;

  console.log("[run-progress] synced", {
    ingestionRunId,
    totalVideos,
    processedVideos,
    failedVideos,
    activeVideos,
    progressPercent,
    currentStage: currentStage ?? "pending",
  });

  return updateIngestionRun(ingestionRunId, {
    status: "running",
    stage: currentStage ?? "pending",
    total_videos: totalVideos,
    processed_videos: processedVideos,
    failed_videos: failedVideos,
    active_videos: activeVideos,
    progress_percent: progressPercent,
    finished_at: null,
  });
}
