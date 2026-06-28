import { createAdminClient } from "@/lib/db/supabase-admin";
import type {
  IngestionRunRecord,
  IngestionRunStatus,
  TriggerSource,
  VideoProcessingStage,
} from "@/types/ingestion";

export async function createIngestionRun(input: {
  clerkUserId: string;
  youtubeConnectionId: string;
  requestedBy: string;
  triggerSource: TriggerSource;
}) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("ingestion_runs")
    .insert({
      clerk_user_id: input.clerkUserId,
      youtube_connection_id: input.youtubeConnectionId,
      requested_by: input.requestedBy,
      trigger_source: input.triggerSource,
      status: "queued",
      stage: "pending",
      total_videos: 0,
      processed_videos: 0,
      failed_videos: 0,
      active_videos: 0,
      progress_percent: 0,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as IngestionRunRecord;
}

export async function getIngestionRunForUser(
  runId: string,
  clerkUserId: string,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("ingestion_runs")
    .select("*")
    .eq("id", runId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as IngestionRunRecord | null) ?? null;
}

export async function listIngestionRunsForUser(
  clerkUserId: string,
  limit = 20,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("ingestion_runs")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as IngestionRunRecord[];
}

type IngestionRunPatch = Partial<{
  status: IngestionRunStatus;
  stage: VideoProcessingStage;
  pause_requested_at: string | null;
  cancel_requested_at: string | null;
  progress_percent: number;
  started_at: string | null;
  finished_at: string | null;
  total_videos: number;
  processed_videos: number;
  failed_videos: number;
  active_videos: number;
  error_summary: Record<string, unknown> | null;
}>;

export async function updateIngestionRunForUser(
  runId: string,
  clerkUserId: string,
  patch: IngestionRunPatch,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("ingestion_runs")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("clerk_user_id", clerkUserId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as IngestionRunRecord;
}

export async function updateIngestionRun(
  runId: string,
  patch: IngestionRunPatch,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("ingestion_runs")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as IngestionRunRecord;
}
