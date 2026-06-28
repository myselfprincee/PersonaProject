export type WorkerTaskSuccess = {
  ok: true;
  result?: Record<string, unknown>;
};

export type WorkerTaskFailure = {
  ok: false;
  retryable: boolean;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type WorkerTaskResult = WorkerTaskSuccess | WorkerTaskFailure;
