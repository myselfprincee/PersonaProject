import { updatePipelineTask } from "@/repositories/pipeline-task.repository";
import { getVideoForInsights } from "@/repositories/videos.repository";
import { updateVideoProcessingState } from "@/repositories/video-processing.repository";
import {
  generateAndStoreVideoInsights,
  GeminiDailyLimitError,
} from "@/services/video-insights/video-insights.service";
import type { PipelineTaskRecord } from "@/types/ingestion";
import type { WorkerTaskResult } from "@/workers/shared/task-result";

export async function runGenerateVideoInsightsTask(
  task: PipelineTaskRecord,
): Promise<WorkerTaskResult> {
  try {
    if (!task.video_processing_state_id || !task.video_id) {
      return {
        ok: false,
        retryable: false,
        code: "invalid_generate_video_insights_payload",
        message: "Generate video insights task payload is incomplete.",
      };
    }

    console.log("[generate-video-insights] starting", {
      taskId: task.id,
      ingestionRunId: task.ingestion_run_id,
      videoId: task.video_id,
    });

    const video = await getVideoForInsights(task.video_id);
    const insights = await generateAndStoreVideoInsights({
      videoId: video.id,
      title: video.title,
      description: video.description ?? "",
      thumbnailUrl: video.thumbnail_url,
    });

    if (!insights) {
      throw new Error("Video insights generation returned no result.");
    }

    await updateVideoProcessingState(task.video_processing_state_id, {
      status: "completed",
      stage: "completed",
      insights_generated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null,
    });

    await updatePipelineTask(task.id, {
      status: "completed",
      lease_expires_at: null,
      result: {
        summary: insights.summary,
        hook: insights.hook,
      },
    });

    console.log("[generate-video-insights] completed", {
      taskId: task.id,
      ingestionRunId: task.ingestion_run_id,
      videoId: task.video_id,
      summaryLength: insights.summary.length,
      hookLength: insights.hook.length,
    });

    return {
      ok: true,
      result: {
        summary: insights.summary,
        hook: insights.hook,
      },
    };
  } catch (error) {
    console.error("[generate-video-insights] failed", {
      taskId: task.id,
      ingestionRunId: task.ingestion_run_id,
      videoId: task.video_id,
      error: error instanceof Error ? error.message : error,
    });

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof GeminiDailyLimitError) {
      return {
        ok: false,
        retryable: false,
        code: "gemini_daily_limit_reached",
        message: error.retryAfterSeconds
          ? `${errorMessage} Retry after approximately ${error.retryAfterSeconds}s.`
          : errorMessage,
        details: {
          retryAfterSeconds: error.retryAfterSeconds,
        },
      };
    }

    const retryable =
      errorMessage.includes("503") ||
      errorMessage.includes("UNAVAILABLE") ||
      errorMessage.includes("high demand");

    return {
      ok: false,
      retryable,
      code: "generate_video_insights_failed",
      message: errorMessage,
    };
  }
}
