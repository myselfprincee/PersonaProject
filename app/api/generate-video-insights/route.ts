import { NextRequest, NextResponse } from "next/server";
import {
  generateAndStoreVideoInsights,
  type GenerateVideoInsightsInput,
  VideoInsightsInputError,
} from "@/services/video-insights/video-insights.service";

function parseRequestBody(body: unknown): GenerateVideoInsightsInput {
  if (!body || typeof body !== "object") {
    throw new VideoInsightsInputError("Request body must be a JSON object.");
  }

  const candidate = body as Partial<GenerateVideoInsightsInput>;
  const videoId = candidate.videoId?.trim();
  const title = candidate.title?.trim();
  const description = candidate.description?.trim() ?? "";
  const transcript = candidate.transcript?.trim() ?? null;
  const thumbnailUrl = candidate.thumbnailUrl?.trim() ?? null;

  if (!videoId) {
    throw new VideoInsightsInputError("videoId is required.");
  }

  if (!title) {
    throw new VideoInsightsInputError("title is required.");
  }

  return {
    videoId,
    title,
    description,
    transcript,
    thumbnailUrl,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    const input = parseRequestBody(body);
    const insights = await generateAndStoreVideoInsights(input);

    return NextResponse.json(insights);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate video insights.",
      },
      { status: error instanceof VideoInsightsInputError ? 400 : 500 },
    );
  }
}
