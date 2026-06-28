import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateReply } from "@/app/querying/generateReply";
import {
  type ConversationContext,
  fetchScopedMatches,
} from "@/app/querying/fetchScopedMatches";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    question?: string;
    conversationContext?: ConversationContext | null;
  };

  const question = body.question?.trim();
  const conversationContext = body.conversationContext ?? null;

  if (!question) {
    return NextResponse.json(
      { error: "Question is required." },
      { status: 400 },
    );
  }

  const connection = await getYoutubeConnectionForUser(userId);

  if (!connection) {
    return NextResponse.json(
      { error: "No YouTube channel connected." },
      { status: 404 },
    );
  }

  try {
    const { matches, matchCount, retrievalQuery } = await fetchScopedMatches({
      youtubeConnectionId: connection.id,
      question,
      conversationContext,
    });

    const answer = await generateReply(question, matches, conversationContext);

    return NextResponse.json({
      answer,
      matches,
      retrieval: {
        matchCountUsed: matchCount,
        contextualizedQuery: retrievalQuery !== question,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Public persona preview failed.",
      },
      { status: 500 },
    );
  }
}
