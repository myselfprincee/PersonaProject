export const INGESTION_RUN_STATUSES = [
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;

export const VIDEO_PROCESSING_STAGES = [
  "pending",
  "catalog_imported",
  "downloading_transcript",
  "uploading_transcript",
  "parsing_transcript",
  "chunking_transcript",
  "generating_embeddings",
  "collecting_video_details",
  "generating_video_insights",
  "completed",
  "failed",
  "cancelled",
] as const;

export const VIDEO_PROCESSING_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed_retryable",
  "failed_terminal",
  "paused",
  "cancelled",
] as const;

export const PIPELINE_TASK_TYPES = [
  "catalog_import",
  "download_transcript",
  "upload_transcript",
  "parse_transcript",
  "chunk_transcript",
  "generate_embeddings",
  "collect_video_details",
  "generate_video_insights",
] as const;

export const PIPELINE_TASK_STATUSES = [
  "queued",
  "leased",
  "running",
  "completed",
  "failed_retryable",
  "failed_terminal",
  "cancelled",
] as const;

export type IngestionRunStatus = (typeof INGESTION_RUN_STATUSES)[number];
export type VideoProcessingStage = (typeof VIDEO_PROCESSING_STAGES)[number];
export type VideoProcessingStatus = (typeof VIDEO_PROCESSING_STATUSES)[number];
export type PipelineTaskType = (typeof PIPELINE_TASK_TYPES)[number];
export type PipelineTaskStatus = (typeof PIPELINE_TASK_STATUSES)[number];

export type TriggerSource = "manual" | "scheduled" | "retry_failed" | "refresh";

export type IngestionRunRecord = {
  id: string;
  clerk_user_id: string;
  youtube_connection_id: string;
  status: IngestionRunStatus;
  requested_by: string;
  trigger_source: TriggerSource;
  total_videos: number;
  processed_videos: number;
  failed_videos: number;
  active_videos: number;
  stage: VideoProcessingStage;
  progress_percent: number;
  started_at: string | null;
  finished_at: string | null;
  cancel_requested_at: string | null;
  pause_requested_at: string | null;
  error_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RunStageCounterRecord = {
  id: string;
  ingestion_run_id: string;
  stage: VideoProcessingStage;
  queued_count: number;
  running_count: number;
  completed_count: number;
  failed_count: number;
  total_count: number;
  updated_at: string;
};

export type VideoProcessingStateRecord = {
  id: string;
  ingestion_run_id: string;
  video_id: string;
  status: VideoProcessingStatus;
  stage: VideoProcessingStage;
  retry_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  transcript_downloaded_at: string | null;
  transcript_uploaded_at: string | null;
  parsed_at: string | null;
  chunked_at: string | null;
  embedded_at: string | null;
  details_collected_at: string | null;
  insights_generated_at: string | null;
  completed_at: string | null;
  started_at: string | null;
  updated_at: string;
};

export type PipelineTaskRecord = {
  id: string;
  ingestion_run_id: string;
  video_processing_state_id: string | null;
  video_id: string | null;
  task_type: PipelineTaskType;
  status: PipelineTaskStatus;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  lease_expires_at: string | null;
  available_at: string;
  worker_id: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  last_error: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type IngestionRunProgress = {
  run: IngestionRunRecord;
  stages: RunStageCounterRecord[];
  recentFailures: Array<{
    videoProcessingStateId: string;
    videoId: string;
    stage: VideoProcessingStage;
    message: string | null;
    code: string | null;
    youtubeVideoId: string | null;
    title: string | null;
  }>;
  etaSeconds: number | null;
};

export function stageToTaskType(
  stage: VideoProcessingStage,
): PipelineTaskType | null {
  switch (stage) {
    case "catalog_imported":
    case "downloading_transcript":
      return "download_transcript";
    case "uploading_transcript":
      return "upload_transcript";
    case "parsing_transcript":
      return "parse_transcript";
    case "chunking_transcript":
      return "chunk_transcript";
    case "generating_embeddings":
      return "generate_embeddings";
    case "collecting_video_details":
      return "collect_video_details";
    case "generating_video_insights":
      return "generate_video_insights";
    default:
      return null;
  }
}
