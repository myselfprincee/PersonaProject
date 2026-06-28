import { createAdminClient } from "@/lib/db/supabase-admin";
import { VIDEO_PROCESSING_STAGES, type RunStageCounterRecord, type VideoProcessingStage } from "@/types/ingestion";

export async function createInitialRunStageCounters(ingestionRunId: string) {
  const supabase = createAdminClient();

  const rows = VIDEO_PROCESSING_STAGES.map((stage) => ({
    ingestion_run_id: ingestionRunId,
    stage,
    queued_count: 0,
    running_count: 0,
    completed_count: 0,
    failed_count: 0,
    total_count: 0,
  }));

  const { error } = await supabase.from("run_stage_counters").insert(rows);

  if (error) {
    throw error;
  }
}

export async function listRunStageCounters(ingestionRunId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("run_stage_counters")
    .select("*")
    .eq("ingestion_run_id", ingestionRunId)
    .order("stage", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as RunStageCounterRecord[];
}

export async function upsertRunStageCounter(input: {
  ingestionRunId: string;
  stage: VideoProcessingStage;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("run_stage_counters").upsert(
    {
      ingestion_run_id: input.ingestionRunId,
      stage: input.stage,
      queued_count: input.queuedCount,
      running_count: input.runningCount,
      completed_count: input.completedCount,
      failed_count: input.failedCount,
      total_count: input.totalCount,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "ingestion_run_id,stage",
    },
  );

  if (error) {
    throw error;
  }
}
