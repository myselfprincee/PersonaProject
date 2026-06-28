import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  type ConversationContext,
  fetchHybridScopedMatches,
} from "@/app/querying/fetchHybridScopedMatches";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

async function generateCreatorMemoryReply(input: {
  question: string;
  matches: Array<{
    chunk_text: string;
    start_ms: number;
    end_ms: number;
    video_title?: string | null;
    videoContext?: {
      summary: string;
      hook: string;
      thumbnailDescription: string;
      viewCount: number | null;
      likeCount: number | null;
      commentCount: number | null;
      uploadDate: string | null;
      duration: number | null;
      topics: string[];
      keywords: string[];
    } | null;
  }>;
  conversationContext?: ConversationContext | null;
}) {
  const context = input.matches
    .map((chunk, index) => {
      const videoContext = chunk.videoContext
        ? `Summary: ${chunk.videoContext.summary}\nHook: ${chunk.videoContext.hook}\nThumbnail: ${chunk.videoContext.thumbnailDescription}\nViews: ${chunk.videoContext.viewCount ?? "Unknown"}\nLikes: ${chunk.videoContext.likeCount ?? "Unknown"}\nComments: ${chunk.videoContext.commentCount ?? "Unknown"}\nUpload Date: ${chunk.videoContext.uploadDate ?? "Unknown"}\nDuration Seconds: ${chunk.videoContext.duration ?? "Unknown"}\nTopics: ${chunk.videoContext.topics.join(", ") || "None"}\nKeywords: ${chunk.videoContext.keywords.join(", ") || "None"}\n`
        : "";

      return `
Chunk ${index + 1}
${chunk.video_title ? `Video Title: ${chunk.video_title}\n` : ""}${videoContext}Timestamp: ${Math.floor(chunk.start_ms / 1000)}s - ${Math.floor(chunk.end_ms / 1000)}s

${chunk.chunk_text}
`;
    })
    .join("\n\n------------------------\n\n");

  const previousExchange = input.conversationContext
    ? `
Previous Conversation:

User asked:
${input.conversationContext.previousQuestion}

Assistant replied:
${input.conversationContext.previousAnswer}
`
    : "";

  const completion = await openai.chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0.2,
    max_tokens: 4096,
    stream: true,
    messages: [
      {
        role: "system",
        content: `
You are PersonaAI acting as an internal creator memory assistant.

You are helping the creator remember what they already said publicly in their own videos.

Rules:
- Do not answer as a fan-facing creator persona.
- Answer directly to the creator in a clear, useful way.
- Prioritize recall: mention video titles and timestamps whenever helpful.
- If the information is not in the transcript context, say: "I couldn't find that information in the creator's videos."
- If the question is a follow-up, use the previous exchange only to resolve references. Transcript context remains the source of truth.
- Keep answers concise and practical.
`,
      },
      {
        role: "user",
        content: `
Transcript Context:

${context}

----------------------------------------
${previousExchange}
----------------------------------------

Current Question:

${input.question}

Answer as an internal creator memory lookup. Prefer direct recall, titles, and timestamps over fan-facing polish.
`,
      },
    ],
  });

  let answer = "";

  for await (const chunk of completion) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    answer += token;
  }

  return answer;
}

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
    const { matches, matchCount, retrievalQuery } =
      await fetchHybridScopedMatches({
        youtubeConnectionId: connection.id,
        question,
        conversationContext,
      });

    const answer = await generateCreatorMemoryReply({
      question,
      matches,
      conversationContext,
    });

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
            : "Creator memory search failed.",
      },
      { status: 500 },
    );
  }
}
