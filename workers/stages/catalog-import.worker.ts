import { findAllVideoIds } from "@/app/worker/youtube/findAllVideosWithTitles";
import { updateIngestionRun } from "@/repositories/ingestion-run.repository";
import {
  createManyPipelineTasksIfAbsent,
  updatePipelineTask,
} from "@/repositories/pipeline-task.repository";
import { upsertRunStageCounter } from "@/repositories/run-stage-counter.repository";
import { getTranscriptStoragePathsByVideoIds } from "@/repositories/transcripts.repository";
import { upsertVideoProcessingStates } from "@/repositories/video-processing.repository";
import {
  listVideoIdsWithInsights,
  upsertCatalogVideos,
} from "@/repositories/videos.repository";
import type { PipelineTaskRecord } from "@/types/ingestion";
import type { WorkerTaskResult } from "@/workers/shared/task-result";

export async function runCatalogImportTask(
  task: PipelineTaskRecord,
): Promise<WorkerTaskResult> {
  try {
    const channelId =
      typeof task.payload?.channelId === "string"
        ? task.payload.channelId
        : null;
    const youtubeConnectionId =
      typeof task.payload?.youtubeConnectionId === "string"
        ? task.payload.youtubeConnectionId
        : null;

    if (!channelId || !youtubeConnectionId) {
      return {
        ok: false,
        retryable: false,
        code: "invalid_catalog_import_payload",
        message:
          "Catalog import task payload is missing channelId or youtubeConnectionId.",
      };
    }

    const discoveredVideos = await findAllVideoIds(channelId);

    const savedVideos = await upsertCatalogVideos(
      discoveredVideos.map((video) => ({
        youtubeConnectionId,
        youtubeVideoId: video.id,
        title: video.title,
      })),
    );

    const transcriptMap = await getTranscriptStoragePathsByVideoIds(
      savedVideos.map((video) => video.id),
    );
    const videoIdsWithInsights = await listVideoIdsWithInsights(
      savedVideos.map((video) => video.id),
    );

    const videosNeedingAnalysis = savedVideos.filter(
      (video) => !videoIdsWithInsights.has(video.id),
    );
    const videosAlreadyAnalyzed = savedVideos.filter((video) =>
      videoIdsWithInsights.has(video.id),
    );

    const processingStates = await upsertVideoProcessingStates(
      videosNeedingAnalysis.map((video) => ({
        ingestionRunId: task.ingestion_run_id,
        videoId: video.id,
        status: "queued",
        stage: transcriptMap.has(video.id)
          ? "collecting_video_details"
          : "downloading_transcript",
      })),
    );

    const stateByVideoId = new Map(
      processingStates.map((state) => [state.video_id, state]),
    );

    const videosWithStoredTranscripts = videosNeedingAnalysis.filter((video) =>
      transcriptMap.has(video.id),
    );
    const videosNeedingTranscriptDownload = videosNeedingAnalysis.filter(
      (video) => !transcriptMap.has(video.id),
    );

    await createManyPipelineTasksIfAbsent([
      ...videosWithStoredTranscripts.map((video) => ({
        ingestionRunId: task.ingestion_run_id,
        videoProcessingStateId: stateByVideoId.get(video.id)?.id ?? null,
        videoId: video.id,
        taskType: "collect_video_details" as const,
        priority: 70,
        maxAttempts: 3,
        payload: {
          youtubeVideoId: video.video_id,
          title: video.title,
          transcriptSource: "storage",
          storagePath: transcriptMap.get(video.id) ?? null,
        },
      })),
      ...videosNeedingTranscriptDownload.map((video) => ({
        ingestionRunId: task.ingestion_run_id,
        videoProcessingStateId: stateByVideoId.get(video.id)?.id ?? null,
        videoId: video.id,
        taskType: "download_transcript" as const,
        priority: 90,
        maxAttempts: 4,
        payload: {
          youtubeVideoId: video.video_id,
          title: video.title,
          channelId,
        },
      })),
    ]);

    await upsertRunStageCounter({
      ingestionRunId: task.ingestion_run_id,
      stage: "downloading_transcript",
      queuedCount: videosNeedingTranscriptDownload.length,
      runningCount: 0,
      completedCount: 0,
      failedCount: 0,
      totalCount: videosNeedingAnalysis.length,
    });

    await upsertRunStageCounter({
      ingestionRunId: task.ingestion_run_id,
      stage: "collecting_video_details",
      queuedCount: videosWithStoredTranscripts.length,
      runningCount: 0,
      completedCount: 0,
      failedCount: 0,
      totalCount: videosNeedingAnalysis.length,
    });

    console.log("[catalog-import] transcript reuse decision", {
      ingestionRunId: task.ingestion_run_id,
      totalVideos: savedVideos.length,
      queuedForAnalysis: videosNeedingAnalysis.length,
      skippedAlreadyAnalyzed: videosAlreadyAnalyzed.length,
      reusedStoredTranscripts: videosWithStoredTranscripts.length,
      queuedTranscriptDownloads: videosNeedingTranscriptDownload.length,
    });

    await updateIngestionRun(task.ingestion_run_id, {
      status: videosNeedingAnalysis.length > 0 ? "running" : "completed",
      stage:
        videosNeedingAnalysis.length === 0
          ? "completed"
          : videosWithStoredTranscripts.length > 0
            ? "collecting_video_details"
            : "downloading_transcript",
      total_videos: videosNeedingAnalysis.length,
      processed_videos: 0,
      active_videos: 0,
      progress_percent: videosNeedingAnalysis.length === 0 ? 100 : 0,
      started_at: new Date().toISOString(),
      finished_at:
        videosNeedingAnalysis.length === 0 ? new Date().toISOString() : null,
      error_summary: null,
    });

    await updatePipelineTask(task.id, {
      status: "completed",
      lease_expires_at: null,
      result: {
        discoveredVideos: discoveredVideos.length,
        queuedForAnalysis: videosNeedingAnalysis.length,
        skippedAlreadyAnalyzed: videosAlreadyAnalyzed.length,
        queuedTranscriptDownloads: videosNeedingTranscriptDownload.length,
        reusedStoredTranscripts: videosWithStoredTranscripts.length,
      },
    });

    return {
      ok: true,
      result: {
        discoveredVideos: discoveredVideos.length,
        queuedForAnalysis: videosNeedingAnalysis.length,
        skippedAlreadyAnalyzed: videosAlreadyAnalyzed.length,
        queuedTranscriptDownloads: videosNeedingTranscriptDownload.length,
        reusedStoredTranscripts: videosWithStoredTranscripts.length,
      },
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      code: "catalog_import_failed",
      message:
        error instanceof Error ? error.message : "Catalog import failed.",
    };
  }
}
