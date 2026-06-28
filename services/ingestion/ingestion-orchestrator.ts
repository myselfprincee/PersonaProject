import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  createIngestionRun,
  getIngestionRunForUser,
  updateIngestionRunForUser,
} from "@/repositories/ingestion-run.repository";
import {
  cancelQueuedTasksForRun,
  createPipelineTask,
  createPipelineTaskIfAbsent,
  listOpenTasksForRun,
} from "@/repositories/pipeline-task.repository";
import { createInitialRunStageCounters } from "@/repositories/run-stage-counter.repository";
import {
  listFailedVideoProcessingStates,
  listPausedVideoProcessingStates,
  listVideoProcessingStatesForRun,
  updateVideoProcessingState,
} from "@/repositories/video-processing.repository";
import {
  stageToTaskType,
  type IngestionRunRecord,
  type TriggerSource,
} from "@/types/ingestion";

async function getOwnedYoutubeConnection(
  youtubeConnectionId: string,
  clerkUserId: string,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("youtube_connections")
    .select("id, channel_id, channel_name, clerk_user_id")
    .eq("id", youtubeConnectionId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function createIngestionRunWithCatalogTask(input: {
  clerkUserId: string;
  youtubeConnectionId: string;
  triggerSource?: TriggerSource;
}) {
  const connection = await getOwnedYoutubeConnection(
    input.youtubeConnectionId,
    input.clerkUserId,
  );

  if (!connection) {
    throw new Error("YouTube connection not found for this user.");
  }

  const run = await createIngestionRun({
    clerkUserId: input.clerkUserId,
    youtubeConnectionId: input.youtubeConnectionId,
    requestedBy: input.clerkUserId,
    triggerSource: input.triggerSource ?? "manual",
  });

  await createInitialRunStageCounters(run.id);

  await createPipelineTask({
    ingestionRunId: run.id,
    taskType: "catalog_import",
    maxAttempts: 3,
    priority: 100,
    payload: {
      youtubeConnectionId: connection.id,
      channelId: connection.channel_id,
      channelName: connection.channel_name,
    },
  });

  return run;
}

export async function pauseIngestionRun(runId: string, clerkUserId: string) {
  const run = await getIngestionRunForUser(runId, clerkUserId);

  if (!run) {
    return null;
  }

  if (run.status === "completed" || run.status === "cancelled") {
    return run;
  }

  return updateIngestionRunForUser(runId, clerkUserId, {
    status: "paused",
    pause_requested_at: new Date().toISOString(),
  });
}

export async function repairMissingTasksForRun(runId: string) {
  const openTasks = await listOpenTasksForRun(runId);
  const openTaskKeySet = new Set(
    openTasks.map((task) => `${task.video_id ?? "none"}:${task.task_type}`),
  );
  const statesResult = await listVideoProcessingStatesForRun({
    ingestionRunId: runId,
    page: 1,
    limit: 5000,
  });

  const repairableStates = statesResult.rows.filter(
    (state) =>
      state.status === "queued" ||
      state.status === "running" ||
      state.status === "paused" ||
      state.status === "failed_retryable",
  );

  let repaired = 0;

  for (const state of repairableStates) {
    const taskType = stageToTaskType(state.stage);

    if (!taskType) {
      continue;
    }

    const dedupeKey = `${state.video_id}:${taskType}`;

    if (openTaskKeySet.has(dedupeKey)) {
      continue;
    }

    await createPipelineTaskIfAbsent({
      ingestionRunId: runId,
      videoProcessingStateId: state.id,
      videoId: state.video_id,
      taskType,
      priority: 80,
      maxAttempts: 3,
      payload: {
        reason: "stalled_run_repair",
        repairedFromStage: state.stage,
      },
    });

    await updateVideoProcessingState(state.id, {
      status: "queued",
      last_error_code: null,
      last_error_message: null,
    });

    repaired += 1;
  }

  return repaired;
}

export async function resumeIngestionRun(runId: string, clerkUserId: string) {
  const run = await getIngestionRunForUser(runId, clerkUserId);

  if (!run) {
    return null;
  }

  if (run.status === "cancelled" || run.status === "completed") {
    return run;
  }

  const supabase = createAdminClient();
  const pausedStates = await listPausedVideoProcessingStates(run.id);
  const openTasks = await listOpenTasksForRun(run.id);
  const openTaskKeySet = new Set(
    openTasks.map((task) => `${task.video_id ?? "none"}:${task.task_type}`),
  );

  const needsInsightRepair = run.stage === "generating_video_insights";
  let repairStates = pausedStates;

  if (needsInsightRepair) {
    const { data, error } = await supabase
      .from("video_processing_states")
      .select("*")
      .eq("ingestion_run_id", run.id)
      .eq("stage", "generating_video_insights")
      .in("status", ["paused", "queued", "running", "failed_retryable"])
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    repairStates = (data ?? []) as typeof pausedStates;
  }

  const statesToRequeue = repairStates.filter((state) => {
    const taskType = stageToTaskType(state.stage);

    if (!taskType) {
      return false;
    }

    return !openTaskKeySet.has(`${state.video_id}:${taskType}`);
  });

  let requeued = 0;

  for (const state of statesToRequeue) {
    const taskType = stageToTaskType(state.stage);

    if (!taskType) {
      continue;
    }

    await createPipelineTaskIfAbsent({
      ingestionRunId: run.id,
      videoProcessingStateId: state.id,
      videoId: state.video_id,
      taskType,
      priority: 80,
      maxAttempts: 3,
      payload: {
        resumedFromStage: state.stage,
        reason: needsInsightRepair ? "quota_resume_repair" : "manual_resume",
      },
    });

    await updateVideoProcessingState(state.id, {
      status: "queued",
      last_error_code: null,
      last_error_message: null,
    });

    requeued += 1;
  }

  const repaired = await repairMissingTasksForRun(run.id);
  const updatedRun = await updateIngestionRunForUser(runId, clerkUserId, {
    status: "running",
    pause_requested_at: null,
    started_at: run.started_at ?? new Date().toISOString(),
    error_summary: requeued + repaired > 0 ? null : run.error_summary,
  });

  return {
    run: updatedRun,
    requeued: requeued + repaired,
  };
}

export async function cancelIngestionRun(runId: string, clerkUserId: string) {
  const run = await getIngestionRunForUser(runId, clerkUserId);

  if (!run) {
    return null;
  }

  await cancelQueuedTasksForRun(run.id);

  return updateIngestionRunForUser(runId, clerkUserId, {
    status: "cancelled",
    cancel_requested_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
}

export async function retryFailedIngestionRunTasks(
  runId: string,
  clerkUserId: string,
) {
  const run = await getIngestionRunForUser(runId, clerkUserId);

  if (!run) {
    return null;
  }

  const failedStates = await listFailedVideoProcessingStates(run.id);
  const openTasks = await listOpenTasksForRun(run.id);
  const openTaskKeySet = new Set(
    openTasks.map((task) => `${task.video_id ?? "none"}:${task.task_type}`),
  );

  let requeued = 0;

  for (const failedState of failedStates) {
    const taskType = stageToTaskType(failedState.stage);

    if (!taskType) {
      continue;
    }

    const dedupeKey = `${failedState.video_id}:${taskType}`;

    if (openTaskKeySet.has(dedupeKey)) {
      continue;
    }

    await createPipelineTaskIfAbsent({
      ingestionRunId: run.id,
      videoProcessingStateId: failedState.id,
      videoId: failedState.video_id,
      taskType,
      priority: 80,
      maxAttempts: 3,
      payload: {
        retriedFromStage: failedState.stage,
        reason: "manual_retry",
      },
    });

    await updateVideoProcessingState(failedState.id, {
      status: "queued",
      last_error_code: null,
      last_error_message: null,
    });

    requeued += 1;
  }

  const updatedRun: IngestionRunRecord = await updateIngestionRunForUser(
    run.id,
    clerkUserId,
    {
      status: "running",
      error_summary:
        requeued > 0
          ? null
          : {
              message: "No failed tasks were available to retry.",
            },
    },
  );

  return {
    run: updatedRun,
    requeued,
  };
}
