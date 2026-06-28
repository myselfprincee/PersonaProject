import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import { analyzePendingYoutubeComments } from "@/services/youtube-comments/youtube-comments.service";

export async function POST(request: NextRequest) {
  console.log("[youtube-comments][analyze] request started");
  const { userId } = await auth();

  if (!userId) {
    console.warn("[youtube-comments][analyze] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getYoutubeConnectionForUser(userId);

  if (!connection) {
    console.warn("[youtube-comments][analyze] no youtube connection", {
      userId,
    });
    return NextResponse.json(
      { error: "No YouTube channel connected." },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    limit?: number;
  };

  try {
    console.log("[youtube-comments][analyze] starting", {
      youtubeConnectionId: connection.id,
      limit: body.limit,
    });
    const results = await analyzePendingYoutubeComments({
      youtubeConnectionId: connection.id,
      limit: body.limit,
    });

    console.log("[youtube-comments][analyze] completed", {
      youtubeConnectionId: connection.id,
      analyzedComments: results.length,
    });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("[youtube-comments][analyze] failed", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze comments.",
      },
      { status: 500 },
    );
  }
}
