import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getIngestionRunProgress } from "@/services/ingestion/progress-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const progress = await getIngestionRunProgress(runId, userId);

  if (!progress) {
    return NextResponse.json({ error: "Ingestion run not found." }, { status: 404 });
  }

  return NextResponse.json(progress);
}
