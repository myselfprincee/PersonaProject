import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { pauseIngestionRun } from "@/services/ingestion/ingestion-orchestrator";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const run = await pauseIngestionRun(runId, userId);

  if (!run) {
    return NextResponse.json({ error: "Ingestion run not found." }, { status: 404 });
  }

  return NextResponse.json({ run });
}
