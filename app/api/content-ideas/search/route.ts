import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import { searchVideoInsightsForContentIdeas } from "@/services/content-ideas/content-ideas-search.service";

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      query?: string;
      limit?: number;
    };
    const query = body.query?.trim() ?? "";

    if (!query) {
      return NextResponse.json(
        { error: "Query is required." },
        { status: 400 },
      );
    }

    const connection = await getYoutubeConnectionForUser(userId);

    if (!connection) {
      return NextResponse.json(
        { error: "Connect YouTube before searching content ideas." },
        { status: 404 },
      );
    }

    const result = await searchVideoInsightsForContentIdeas({
      youtubeConnectionId: connection.id,
      query,
      limit:
        typeof body.limit === "number" && Number.isFinite(body.limit)
          ? body.limit
          : 15,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to search content idea memory.",
      },
      { status: 500 },
    );
  }
}
