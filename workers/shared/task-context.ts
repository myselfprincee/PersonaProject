import type { PipelineTaskRecord } from "@/types/ingestion";

export type WorkerContext = {
  workerId: string;
  task: PipelineTaskRecord;
};
