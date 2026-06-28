import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import { searchVideoInsightsForContentIdeas } from "@/services/content-ideas/content-ideas-search.service";

type ConversationContext = {
  previousQuestion: string;
  previousAnswer: string;
};

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_API_KEY_ENV_NAMES = [
  "GEMINI_API_KEY1",
  "GEMINI_API_KEY2",
  "GEMINI_API_KEY3",
  "GEMINI_API_KEY4",
] as const;

function getGeminiApiKey() {
  for (const name of GEMINI_API_KEY_ENV_NAMES) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  const fallback = process.env.GEMINI_API_KEY?.trim();

  if (!fallback) {
    throw new Error("Missing Gemini API key.");
  }

  return fallback;
}

type ContentIdeaMatches = Awaited<
  ReturnType<typeof searchVideoInsightsForContentIdeas>
>["matches"];

type ContentIdeaMatch = ContentIdeaMatches[number];

function buildContextBlock(matches: ContentIdeaMatches) {
  return matches
    .map((match: ContentIdeaMatch, index: number) => {
      const topics = match.topics.length > 0 ? match.topics.join(", ") : "None";
      const keywords =
        match.keywords.length > 0 ? match.keywords.join(", ") : "None";
      const tags = match.tags.length > 0 ? match.tags.join(", ") : "None";
      const categories =
        match.categories.length > 0 ? match.categories.join(", ") : "None";
      const chapters = match.chapters ? JSON.stringify(match.chapters) : "None";
      const heatmap = match.heatmap ? JSON.stringify(match.heatmap) : "None";

      return [
        `Match ${index + 1}`,
        `Title: ${match.title}`,
        `YouTube Video ID: ${match.youtubeVideoId}`,
        `Similarity: ${match.similarity.toFixed(4)}`,
        `Upload Date: ${match.uploadDate ?? "Unknown"}`,
        `Duration Seconds: ${match.duration ?? "Unknown"}`,
        `Views: ${match.viewCount ?? "Unknown"}`,
        `Likes: ${match.likeCount ?? "Unknown"}`,
        `Comments: ${match.commentCount ?? "Unknown"}`,
        `Language: ${match.language ?? "Unknown"}`,
        `Thumbnail URL: ${match.thumbnailUrl ?? "Unknown"}`,
        `Description: ${match.description || "None"}`,
        `Summary: ${match.summary}`,
        `Hook: ${match.hook}`,
        `Thumbnail: ${match.thumbnailDescription}`,
        `Topics: ${topics}`,
        `Keywords: ${keywords}`,
        `Tags: ${tags}`,
        `Categories: ${categories}`,
        `Chapters: ${chapters}`,
        `Heatmap: ${heatmap}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestBody = (await request.json().catch(() => ({}))) as {
      question?: string;
      conversationContext?: ConversationContext | null;
    };
    const question = requestBody.question?.trim() ?? "";
    const conversationContext = requestBody.conversationContext ?? null;

    if (!question) {
      return NextResponse.json(
        { error: "Query is required." },
        { status: 400 },
      );
    }

    const connection = await getYoutubeConnectionForUser(userId);

    if (!connection) {
      return NextResponse.json(
        { error: "Connect YouTube before using content ideas chat." },
        { status: 404 },
      );
    }

    const retrievalQuery = conversationContext
      ? [
          conversationContext.previousQuestion,
          conversationContext.previousAnswer,
          question,
        ].join("\n\n")
      : question;

    const retrieval = await searchVideoInsightsForContentIdeas({
      youtubeConnectionId: connection.id,
      query: retrievalQuery,
      limit: 8,
    });

    if (retrieval.matches.length === 0) {
      return NextResponse.json({
        answer:
          "I could not find enough relevant analyzed videos yet. Try a more specific prompt or analyze more videos first.",
        matches: [],
        retrieval: {
          matchCountUsed: 0,
          contextualizedQuery: retrievalQuery !== question,
        },
      });
    }

    const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    const prompt = [
      "You are Persona, a YouTube content strategist.",
      "Use only the retrieved creator video insights below.",
      "Help the user with content strategy questions grounded in their existing catalog.",
      "Use all retrieved signals when useful: title, description, summary, hook, thumbnail description, upload date, duration, views, likes, comments, tags, categories, language, chapters, and heatmap.",
      "If the user asks for factual performance data like views, likes, or comments, answer that directly from the retrieved context before giving strategic advice.",
      "When suggesting ideas, use the metadata to infer patterns in packaging, positioning, recency, audience response, and topic clusters.",
      "If the user asks for brainstorming or next-step strategy, return markdown with these sections:",
      "1. Short answer",
      "2. 3-5 specific video ideas",
      "3. Why these fit this creator",
      "4. What to avoid repeating",
      "5. Suggested title angles",
      "For factual lookup questions, do not force the brainstorming sections.",
      "Be concrete and reference recurring patterns from the retrieved videos.",
      "Do not invent facts outside the provided context.",
      conversationContext
        ? `Previous conversation:\nUser asked: ${conversationContext.previousQuestion}\nAssistant replied: ${conversationContext.previousAnswer}`
        : "",
      `User request: ${question}`,
      "",
      "Retrieved creator context:",
      buildContextBlock(retrieval.matches),
    ].join("\n");

    const stream = await ai.models.generateContentStream({
      model: CHAT_MODEL,
      contents: prompt,
    });

    const matches = retrieval.matches.map((match) => ({
      chunk_text: [
        `Title: ${match.title}`,
        match.uploadDate != null ? `Upload Date: ${match.uploadDate}` : null,
        match.duration != null ? `Duration Seconds: ${match.duration}` : null,
        match.viewCount != null ? `Views: ${match.viewCount}` : null,
        match.likeCount != null ? `Likes: ${match.likeCount}` : null,
        match.commentCount != null ? `Comments: ${match.commentCount}` : null,
        match.language ? `Language: ${match.language}` : null,
        match.thumbnailUrl ? `Thumbnail URL: ${match.thumbnailUrl}` : null,
        match.description ? `Description: ${match.description}` : null,
        `Summary: ${match.summary}`,
        `Hook: ${match.hook}`,
        `Thumbnail: ${match.thumbnailDescription}`,
        match.topics.length ? `Topics: ${match.topics.join(", ")}` : null,
        match.keywords.length ? `Keywords: ${match.keywords.join(", ")}` : null,
        match.tags.length ? `Tags: ${match.tags.join(", ")}` : null,
        match.categories.length
          ? `Categories: ${match.categories.join(", ")}`
          : null,
        match.chapters ? `Chapters: ${JSON.stringify(match.chapters)}` : null,
        match.heatmap ? `Heatmap: ${JSON.stringify(match.heatmap)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      start_ms: 0,
      end_ms: 0,
      video_title: match.title,
    }));

    const encoder = new TextEncoder();

    const streamBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        let answer = "";

        try {
          for await (const chunk of stream) {
            const token = chunk.text ?? "";

            if (!token) {
              continue;
            }

            answer += token;
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ type: "token", token })}\n`),
            );
          }

          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                type: "done",
                answer: answer.trim(),
                matches,
                retrieval: {
                  matchCountUsed: retrieval.matches.length,
                  contextualizedQuery: retrievalQuery !== question,
                },
              })}\n`,
            ),
          );
          controller.close();
        } catch (streamError) {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                type: "error",
                error:
                  streamError instanceof Error
                    ? streamError.message
                    : "Failed to generate content ideas response.",
              })}\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(streamBody, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate content ideas response.",
      },
      { status: 500 },
    );
  }
}
