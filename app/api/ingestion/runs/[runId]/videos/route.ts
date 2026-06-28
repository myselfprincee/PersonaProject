import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listIngestionRunVideos } from "@/services/ingestion/progress-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const page = Math.max(Number(request.nextUrl.searchParams.get("page") ?? "1") || 1, 1);
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit") ?? "20") || 20, 1),
    100,
  );
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const stage = request.nextUrl.searchParams.get("stage") ?? undefined;

  const result = await listIngestionRunVideos({
    runId,
    clerkUserId: userId,
    status,
    stage,
    page,
    limit,
  });

  if (!result) {
    return NextResponse.json({ error: "Ingestion run not found." }, { status: 404 });
  }

  return NextResponse.json({
    run: result.run,
    rows: result.rows,
    count: result.count,
    page,
    limit,
  });
}
