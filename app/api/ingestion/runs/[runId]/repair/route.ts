import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getIngestionRunForUser,
  updateIngestionRunForUser,
} from "@/repositories/ingestion-run.repository";
import { repairMissingTasksForRun } from "@/services/ingestion/ingestion-orchestrator";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const run = await getIngestionRunForUser(runId, userId);

  if (!run) {
    return NextResponse.json(
      { error: "Ingestion run not found." },
      { status: 404 },
    );
  }

  if (run.status === "completed" || run.status === "cancelled") {
    return NextResponse.json({ run, repaired: 0, reused: true });
  }

  const repaired = await repairMissingTasksForRun(run.id);
  const updatedRun = await updateIngestionRunForUser(run.id, userId, {
    status: repaired > 0 ? "running" : run.status,
    pause_requested_at: null,
    error_summary:
      repaired > 0
        ? null
        : {
            code: "repair_no_missing_tasks_found",
            message:
              "No missing tasks were reconstructed for this run. It may already be terminal or require manual investigation.",
          },
  });

  return NextResponse.json({ run: updatedRun, repaired, reused: false });
}
