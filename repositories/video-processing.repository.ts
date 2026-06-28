import { createAdminClient } from "@/lib/db/supabase-admin";
import type {
  VideoProcessingStage,
  VideoProcessingStateRecord,
  VideoProcessingStatus,
} from "@/types/ingestion";

export async function upsertVideoProcessingStates(
  input: Array<{
    ingestionRunId: string;
    videoId: string;
    status: VideoProcessingStatus;
    stage: VideoProcessingStage;
  }>,
) {
  if (input.length === 0) {
    return [] as VideoProcessingStateRecord[];
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("video_processing_states")
    .upsert(
      input.map((row) => ({
        ingestion_run_id: row.ingestionRunId,
        video_id: row.videoId,
        status: row.status,
        stage: row.stage,
        started_at: new Date().toISOString(),
      })),
      {
        onConflict: "ingestion_run_id,video_id",
      },
    )
    .select("*");

  if (error) {
    throw error;
  }

  return (data ?? []) as VideoProcessingStateRecord[];
}

export async function listRecentFailuresForRun(
  ingestionRunId: string,
  limit = 10,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("video_processing_states")
    .select(
      "id, video_id, stage, last_error_code, last_error_message, videos(video_id, title)",
    )
    .eq("ingestion_run_id", ingestionRunId)
    .in("status", ["failed_retryable", "failed_terminal"])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    id: string;
    video_id: string;
    stage: VideoProcessingStage;
    last_error_code: string | null;
    last_error_message: string | null;
    videos?: { video_id?: string | null; title?: string | null } | null;
  }>;
}

export async function listVideoProcessingStatesForRun(input: {
  ingestionRunId: string;
  status?: VideoProcessingStatus;
  stage?: VideoProcessingStage;
  page: number;
  limit: number;
}) {
  const supabase = createAdminClient();
  const from = (input.page - 1) * input.limit;
  const to = from + input.limit - 1;

  let query = supabase
    .from("video_processing_states")
    .select(
      "id, ingestion_run_id, video_id, status, stage, retry_count, last_error_code, last_error_message, completed_at, updated_at, videos(video_id, title)",
      {
        count: "exact",
      },
    )
    .eq("ingestion_run_id", input.ingestionRunId)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (input.status) {
    query = query.eq("status", input.status);
  }

  if (input.stage) {
    query = query.eq("stage", input.stage);
  }

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  return {
    rows: (data ?? []) as Array<
      Pick<
        VideoProcessingStateRecord,
        | "id"
        | "ingestion_run_id"
        | "video_id"
        | "status"
        | "stage"
        | "retry_count"
        | "last_error_code"
        | "last_error_message"
        | "completed_at"
        | "updated_at"
      > & {
        videos?: { video_id?: string | null; title?: string | null } | null;
      }
    >,
    count: count ?? 0,
  };
}

export async function listFailedVideoProcessingStates(ingestionRunId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("video_processing_states")
    .select("*")
    .eq("ingestion_run_id", ingestionRunId)
    .in("status", ["failed_retryable", "failed_terminal"])
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as VideoProcessingStateRecord[];
}

export async function listPausedVideoProcessingStates(ingestionRunId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("video_processing_states")
    .select("*")
    .eq("ingestion_run_id", ingestionRunId)
    .eq("status", "paused")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as VideoProcessingStateRecord[];
}

export async function updateVideoProcessingState(
  id: string,
  patch: Partial<VideoProcessingStateRecord>,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("video_processing_states")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as VideoProcessingStateRecord;
}
