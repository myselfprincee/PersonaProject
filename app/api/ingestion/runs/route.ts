import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createIngestionRunWithCatalogTask } from "@/services/ingestion/ingestion-orchestrator";
import { listUserIngestionRuns } from "@/services/ingestion/progress-service";

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam ?? "10") || 10, 1), 50);

  const runs = await listUserIngestionRuns(userId, limit);

  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const youtubeConnectionId = typeof body.youtubeConnectionId === "string"
      ? body.youtubeConnectionId
      : null;

    if (!youtubeConnectionId) {
      return NextResponse.json(
        { error: "youtubeConnectionId is required." },
        { status: 400 },
      );
    }

    const run = await createIngestionRunWithCatalogTask({
      clerkUserId: userId,
      youtubeConnectionId,
      triggerSource: "manual",
    });

    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create ingestion run.",
      },
      { status: 500 },
    );
  }
}
