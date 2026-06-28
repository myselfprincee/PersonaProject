import fs from "node:fs/promises";
import {
  createPipelineTaskIfAbsent,
  updatePipelineTask,
} from "@/repositories/pipeline-task.repository";
import { updateVideoProcessingState } from "@/repositories/video-processing.repository";
import { uploadTranscriptFileToStorage } from "@/services/storage/transcript-storage.service";
import type { PipelineTaskRecord } from "@/types/ingestion";
import type { WorkerTaskResult } from "@/workers/shared/task-result";

export async function runTranscriptUploadTask(
  task: PipelineTaskRecord,
): Promise<WorkerTaskResult> {
  try {
    const localPath =
      typeof task.payload?.localPath === "string"
        ? task.payload.localPath
        : null;

    if (!localPath || !task.video_processing_state_id || !task.video_id) {
      return {
        ok: false,
        retryable: false,
        code: "invalid_transcript_upload_payload",
        message: "Transcript upload task payload is incomplete.",
      };
    }

    const upload = await uploadTranscriptFileToStorage({
      filePath: localPath,
      videoId: task.video_id,
    });

    const youtubeVideoId =
      typeof task.payload?.youtubeVideoId === "string"
        ? task.payload.youtubeVideoId
        : null;

    await updateVideoProcessingState(task.video_processing_state_id, {
      status: "queued",
      stage: "collecting_video_details",
      transcript_uploaded_at: new Date().toISOString(),
    });

    await createPipelineTaskIfAbsent({
      ingestionRunId: task.ingestion_run_id,
      videoProcessingStateId: task.video_processing_state_id,
      videoId: task.video_id,
      taskType: "collect_video_details",
      priority: 70,
      maxAttempts: 3,
      payload: {
        storagePath: upload.storagePath,
        checksumSha256: upload.checksumSha256,
        youtubeVideoId,
      },
    });

    await fs.unlink(localPath).catch(() => undefined);

    await updatePipelineTask(task.id, {
      status: "completed",
      lease_expires_at: null,
      result: {
        storagePath: upload.storagePath,
        checksumSha256: upload.checksumSha256,
      },
    });

    return {
      ok: true,
      result: {
        storagePath: upload.storagePath,
        youtubeVideoId,
      },
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      code: "transcript_upload_failed",
      message:
        error instanceof Error ? error.message : "Transcript upload failed.",
    };
  }
}
