import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import { backfillMissingVideoInsightEmbeddings } from "@/services/video-insights/video-insights.service";

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      failOnError?: boolean;
    };
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.min(Math.max(Math.floor(body.limit), 1), 50)
        : 10;

    const connection = await getYoutubeConnectionForUser(userId);

    if (!connection) {
      return NextResponse.json(
        { error: "Connect YouTube before backfilling embeddings." },
        { status: 404 },
      );
    }

    const result = await backfillMissingVideoInsightEmbeddings({
      youtubeConnectionId: connection.id,
      limit,
      failOnError: body.failOnError === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to backfill missing video insight embeddings.",
      },
      { status: 500 },
    );
  }
}
