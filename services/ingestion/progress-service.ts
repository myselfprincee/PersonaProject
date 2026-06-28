import { getIngestionRunForUser, listIngestionRunsForUser } from "@/repositories/ingestion-run.repository";
import { listRunStageCounters } from "@/repositories/run-stage-counter.repository";
import { listRecentFailuresForRun, listVideoProcessingStatesForRun } from "@/repositories/video-processing.repository";
import type { IngestionRunProgress } from "@/types/ingestion";

export async function getIngestionRunProgress(runId: string, clerkUserId: string): Promise<IngestionRunProgress | null> {
  const run = await getIngestionRunForUser(runId, clerkUserId);

  if (!run) {
    return null;
  }

  const [stages, failures] = await Promise.all([
    listRunStageCounters(run.id),
    listRecentFailuresForRun(run.id, 10),
  ]);

  return {
    run,
    stages,
    recentFailures: failures.map((failure) => ({
      videoProcessingStateId: failure.id,
      videoId: failure.video_id,
      stage: failure.stage,
      message: failure.last_error_message,
      code: failure.last_error_code,
      youtubeVideoId: failure.videos?.video_id ?? null,
      title: failure.videos?.title ?? null,
    })),
    etaSeconds: null,
  };
}

export async function listUserIngestionRuns(clerkUserId: string, limit = 20) {
  return listIngestionRunsForUser(clerkUserId, limit);
}

export async function listIngestionRunVideos(input: {
  runId: string;
  clerkUserId: string;
  status?: string;
  stage?: string;
  page: number;
  limit: number;
}) {
  const run = await getIngestionRunForUser(input.runId, input.clerkUserId);

  if (!run) {
    return null;
  }

  const result = await listVideoProcessingStatesForRun({
    ingestionRunId: input.runId,
    status: input.status as never,
    stage: input.stage as never,
    page: input.page,
    limit: input.limit,
  });

  return {
    run,
    ...result,
  };
}
