import { NextRequest, NextResponse } from "next/server";
import { generateReply } from "@/app/querying/generateReply";
import {
  type ConversationContext,
  fetchHybridScopedMatches,
} from "@/app/querying/fetchHybridScopedMatches";
import { getPublicPersonaBySlug } from "@/services/public-persona/public-persona.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const publicPersona = await getPublicPersonaBySlug(slug);

  if (!publicPersona) {
    return NextResponse.json(
      { error: "Public persona not found." },
      { status: 404 },
    );
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

  try {
    const { matches, matchCount, retrievalQuery } =
      await fetchHybridScopedMatches({
        youtubeConnectionId: publicPersona.youtubeConnectionId,
        question,
        conversationContext,
      });

    const answer = await generateReply(question, matches, conversationContext);

    return NextResponse.json({
      answer,
      matches,
      persona: {
        channelName: publicPersona.channelName,
        slug: publicPersona.publicSlug,
      },
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
            : "Public persona search failed.",
      },
      { status: 500 },
    );
  }
}
