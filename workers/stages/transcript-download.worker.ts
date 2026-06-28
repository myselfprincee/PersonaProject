import {
  createPipelineTaskIfAbsent,
  updatePipelineTask,
} from "@/repositories/pipeline-task.repository";
import { updateVideoProcessingState } from "@/repositories/video-processing.repository";
import { downloadTranscriptToTempFile } from "@/services/youtube/youtube-transcript.service";
import type { PipelineTaskRecord } from "@/types/ingestion";
import type { WorkerTaskResult } from "@/workers/shared/task-result";

export async function runTranscriptDownloadTask(
  task: PipelineTaskRecord,
): Promise<WorkerTaskResult> {
  try {
    const youtubeVideoId =
      typeof task.payload?.youtubeVideoId === "string"
        ? task.payload.youtubeVideoId
        : null;
    const channelId =
      typeof task.payload?.channelId === "string"
        ? task.payload.channelId
        : null;

    if (
      !youtubeVideoId ||
      !channelId ||
      !task.video_processing_state_id ||
      !task.video_id
    ) {
      return {
        ok: false,
        retryable: false,
        code: "invalid_transcript_download_payload",
        message: "Transcript download task payload is incomplete.",
      };
    }

    const { localPath } = await downloadTranscriptToTempFile({
      youtubeVideoId,
      channelId,
    });

    await updateVideoProcessingState(task.video_processing_state_id, {
      status: "queued",
      stage: "uploading_transcript",
      transcript_downloaded_at: new Date().toISOString(),
    });

    await createPipelineTaskIfAbsent({
      ingestionRunId: task.ingestion_run_id,
      videoProcessingStateId: task.video_processing_state_id,
      videoId: task.video_id,
      taskType: "upload_transcript",
      priority: 80,
      maxAttempts: 4,
      payload: {
        youtubeVideoId,
        channelId,
        localPath,
      },
    });

    await updatePipelineTask(task.id, {
      status: "completed",
      lease_expires_at: null,
      result: {
        youtubeVideoId,
        localPath,
      },
    });

    return {
      ok: true,
      result: {
        youtubeVideoId,
        localPath,
      },
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      code: "transcript_download_failed",
      message:
        error instanceof Error ? error.message : "Transcript download failed.",
    };
  }
}
