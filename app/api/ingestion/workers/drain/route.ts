import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  listIngestionRunsForUser,
  updateIngestionRunForUser,
} from "@/repositories/ingestion-run.repository";
import { repairMissingTasksForRun } from "@/services/ingestion/ingestion-orchestrator";
import { syncIngestionRunProgress } from "@/services/ingestion/run-progress-sync.service";
import { runOneIngestionTask } from "@/workers/runner";

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

function pickActiveRun(
  runs: Awaited<ReturnType<typeof listIngestionRunsForUser>>,
) {
  return (
    runs.find((run) => ["queued", "running", "paused"].includes(run.status)) ??
    null
  );
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const parsedLimit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.floor(body.limit)
        : DEFAULT_LIMIT;
    const limit = Math.min(Math.max(parsedLimit, 1), MAX_LIMIT);

    console.log("[worker-drain] request received", {
      userId,
      requestedLimit: body.limit ?? null,
      limit,
    });

    const runs = await listIngestionRunsForUser(userId, 10);
    let activeRun = pickActiveRun(runs);
    let repaired = 0;

    if (!activeRun || activeRun.status === "paused") {
      console.log("[worker-drain] request completed", {
        userId,
        limit,
        processed: 0,
        activeRunId: activeRun?.id ?? null,
        activeRunStatus: activeRun?.status ?? null,
        repaired,
      });

      return NextResponse.json({
        processed: 0,
        results: [],
        activeRun,
        repaired,
      });
    }

    const results = [] as Array<
      Awaited<ReturnType<typeof runOneIngestionTask>>
    >;

    for (let index = 0; index < limit; index += 1) {
      const workerId = `web-${userId}-${Date.now()}-${index}`;
      const result = await runOneIngestionTask(workerId, activeRun.id);

      console.log("[worker-drain] task iteration finished", {
        userId,
        workerId,
        index,
        foundTask: Boolean(result),
        taskId: result?.taskId ?? null,
        taskType: result?.taskType ?? null,
        status: result?.status ?? null,
      });

      if (!result) {
        break;
      }

      results.push(result);
    }

    if (results.length === 0) {
      if (activeRun) {
        const syncedRun = await syncIngestionRunProgress(activeRun.id);

        if (
          syncedRun.error_summary &&
          syncedRun.error_summary.code === "pipeline_stalled_no_open_tasks"
        ) {
          repaired = await repairMissingTasksForRun(syncedRun.id);

          if (repaired > 0) {
            activeRun = await updateIngestionRunForUser(syncedRun.id, userId, {
              status: "running",
              pause_requested_at: null,
              finished_at: null,
              error_summary: null,
            });

            const repairWorkerId = `web-${userId}-${Date.now()}-repair`;
            const repairResult = await runOneIngestionTask(
              repairWorkerId,
              syncedRun.id,
            );

            if (repairResult) {
              results.push(repairResult);
            }
          } else {
            activeRun = syncedRun;
          }
        } else {
          activeRun = syncedRun;
        }
      }
    }

    console.log("[worker-drain] request completed", {
      userId,
      limit,
      processed: results.length,
      activeRunId: activeRun?.id ?? null,
      activeRunStatus: activeRun?.status ?? null,
      repaired,
    });

    return NextResponse.json({
      processed: results.length,
      results,
      activeRun,
      repaired,
    });
  } catch (error) {
    console.error("[worker-drain] request failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process ingestion tasks.",
      },
      { status: 500 },
    );
  }
}
