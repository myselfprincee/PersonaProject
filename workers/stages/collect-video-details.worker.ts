import {
  createPipelineTaskIfAbsent,
  updatePipelineTask,
} from "@/repositories/pipeline-task.repository";
import { updateVideoMetadataByYoutubeVideoId } from "@/repositories/videos.repository";
import { updateVideoProcessingState } from "@/repositories/video-processing.repository";
import { fetchYoutubeVideoDetails } from "@/services/youtube/youtube-video-details.service";
import type { PipelineTaskRecord } from "@/types/ingestion";
import type { WorkerTaskResult } from "@/workers/shared/task-result";

export async function runCollectVideoDetailsTask(
  task: PipelineTaskRecord,
): Promise<WorkerTaskResult> {
  try {
    const youtubeVideoId =
      typeof task.payload?.youtubeVideoId === "string"
        ? task.payload.youtubeVideoId
        : null;

    if (!youtubeVideoId || !task.video_processing_state_id || !task.video_id) {
      return {
        ok: false,
        retryable: false,
        code: "invalid_collect_video_details_payload",
        message: "Video details task payload is incomplete.",
      };
    }

    console.log("[collect-video-details] fetching metadata", {
      taskId: task.id,
      ingestionRunId: task.ingestion_run_id,
      videoId: task.video_id,
      youtubeVideoId,
    });

    const metadata = await fetchYoutubeVideoDetails(youtubeVideoId);
    const updatedVideo = await updateVideoMetadataByYoutubeVideoId(metadata);

    await updateVideoProcessingState(task.video_processing_state_id, {
      status: "queued",
      stage: "generating_video_insights",
      details_collected_at: new Date().toISOString(),
    });

    await createPipelineTaskIfAbsent({
      ingestionRunId: task.ingestion_run_id,
      videoProcessingStateId: task.video_processing_state_id,
      videoId: task.video_id,
      taskType: "generate_video_insights",
      priority: 60,
      maxAttempts: 3,
      payload: {
        youtubeVideoId,
        title: updatedVideo.title,
      },
    });

    await updatePipelineTask(task.id, {
      status: "completed",
      lease_expires_at: null,
      result: {
        youtubeVideoId,
        title: updatedVideo.title,
        thumbnailUrl: updatedVideo.thumbnail_url,
      },
    });

    console.log(
      "[collect-video-details] metadata stored and next task queued",
      {
        taskId: task.id,
        ingestionRunId: task.ingestion_run_id,
        videoId: task.video_id,
        youtubeVideoId,
        title: updatedVideo.title,
        thumbnailUrl: updatedVideo.thumbnail_url,
      },
    );

    return {
      ok: true,
      result: {
        youtubeVideoId,
        title: updatedVideo.title,
      },
    };
  } catch (error) {
    console.error("[collect-video-details] failed", {
      taskId: task.id,
      ingestionRunId: task.ingestion_run_id,
      videoId: task.video_id,
      error: error instanceof Error ? error.message : error,
    });

    return {
      ok: false,
      retryable: true,
      code: "collect_video_details_failed",
      message:
        error instanceof Error
          ? error.message
          : "Collecting video details failed.",
    };
  }
}
