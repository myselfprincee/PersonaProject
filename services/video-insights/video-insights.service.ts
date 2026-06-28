import { GoogleGenAI } from "@google/genai";
import { parseJson3Transcript } from "@/chunking/transcriptChunker";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getVideoForInsights } from "@/repositories/videos.repository";
import { readTranscriptJsonFromStorage } from "@/services/storage/raw-transcript-storage.service";

const MODEL = "gemini-2.5-flash-lite";
const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-2";
const MIN_GEMINI_REQUEST_INTERVAL_MS = 4_500;
const DEFAULT_DAILY_GEMINI_REQUEST_LIMIT = 20;
const DEFAULT_DAILY_GEMINI_EMBEDDING_REQUEST_LIMIT = 50;
const GEMINI_API_KEY_ENV_NAMES = [
  "GEMINI_API_KEY1",
  "GEMINI_API_KEY2",
  "GEMINI_API_KEY3",
  "GEMINI_API_KEY4",
] as const;

let geminiRequestChain: Promise<unknown> = Promise.resolve();
let geminiEmbeddingRequestChain: Promise<unknown> = Promise.resolve();
let lastGeminiRequestAt = 0;
let lastGeminiEmbeddingRequestAt = 0;
let nextGeminiApiKeyIndex = 0;
let nextGeminiEmbeddingApiKeyIndex = 0;
const geminiRequestUsageByDay = new Map<string, number>();
const geminiRequestUsageByDayAndKey = new Map<string, number>();
const geminiEmbeddingRequestUsageByDay = new Map<string, number>();
const geminiEmbeddingRequestUsageByDayAndKey = new Map<string, number>();

export class VideoInsightsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoInsightsInputError";
  }
}

export class GeminiDailyLimitError extends Error {
  retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "GeminiDailyLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type GenerateVideoInsightsInput = {
  videoId: string;
  title: string;
  description: string;
  transcript?: string | null;
  thumbnailUrl?: string | null;
};

export type VideoInsights = {
  video_id: string;
  summary: string;
  hook: string;
  thumbnail_description: string;
  topics: string[];
  keywords: string[];
  embedding?: number[] | null;
};

type StoredVideoInsights = VideoInsights & {
  created_at?: string | null;
  updated_at?: string | null;
};

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeminiDailyRequestLimit() {
  const parsed = Number(process.env.GEMINI_DAILY_REQUEST_LIMIT ?? "");

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_DAILY_GEMINI_REQUEST_LIMIT;
}

function getGeminiEmbeddingDailyRequestLimit() {
  const parsed = Number(process.env.GEMINI_EMBEDDING_DAILY_REQUEST_LIMIT ?? "");

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_DAILY_GEMINI_EMBEDDING_REQUEST_LIMIT;
}

function getCurrentUtcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getConfiguredGeminiApiKeys() {
  const configured = GEMINI_API_KEY_ENV_NAMES.flatMap((name) => {
    const value = process.env[name]?.trim();

    if (!value) {
      return [] as Array<{ name: string; value: string }>;
    }

    return [{ name, value }];
  });

  if (configured.length > 0) {
    return configured;
  }

  return [{ name: "GEMINI_API_KEY", value: requiredEnv("GEMINI_API_KEY") }];
}

function getGeminiPerKeyUsageForToday(keyName: string) {
  const dayKey = getCurrentUtcDayKey();
  const usageKey = `${dayKey}:${keyName}`;

  return {
    dayKey,
    usageKey,
    used: geminiRequestUsageByDayAndKey.get(usageKey) ?? 0,
    limit: getGeminiDailyRequestLimit(),
  };
}

function getGeminiEmbeddingPerKeyUsageForToday(keyName: string) {
  const dayKey = getCurrentUtcDayKey();
  const usageKey = `${dayKey}:${keyName}`;

  return {
    dayKey,
    usageKey,
    used: geminiEmbeddingRequestUsageByDayAndKey.get(usageKey) ?? 0,
    limit: getGeminiEmbeddingDailyRequestLimit(),
  };
}

function getGeminiUsageForToday() {
  const configuredKeys = getConfiguredGeminiApiKeys();
  const dayKey = getCurrentUtcDayKey();
  const perKey = configuredKeys.map((key) => {
    const usage = getGeminiPerKeyUsageForToday(key.name);

    return {
      name: key.name,
      used: usage.used,
      limit: usage.limit,
    };
  });

  return {
    dayKey,
    used: geminiRequestUsageByDay.get(dayKey) ?? 0,
    limit: perKey.reduce((sum, key) => sum + key.limit, 0),
    configuredKeys: perKey.length,
    perKey,
  };
}

function getGeminiEmbeddingUsageForToday() {
  const configuredKeys = getConfiguredGeminiApiKeys();
  const dayKey = getCurrentUtcDayKey();
  const perKey = configuredKeys.map((key) => {
    const usage = getGeminiEmbeddingPerKeyUsageForToday(key.name);

    return {
      name: key.name,
      used: usage.used,
      limit: usage.limit,
    };
  });

  return {
    dayKey,
    used: geminiEmbeddingRequestUsageByDay.get(dayKey) ?? 0,
    limit: perKey.reduce((sum, key) => sum + key.limit, 0),
    configuredKeys: perKey.length,
    perKey,
  };
}

export function getGeminiDailyUsageSnapshot() {
  return {
    analysis: getGeminiUsageForToday(),
    embeddings: getGeminiEmbeddingUsageForToday(),
  };
}

function reserveGeminiRequestSlotForKey(keyName: string) {
  const aggregateUsage = getGeminiUsageForToday();
  const perKeyUsage = getGeminiPerKeyUsageForToday(keyName);

  if (perKeyUsage.used >= perKeyUsage.limit) {
    throw new GeminiDailyLimitError(
      `Gemini daily request limit reached for ${keyName} on ${perKeyUsage.dayKey}. Used ${perKeyUsage.used}/${perKeyUsage.limit} requests for this key.`,
    );
  }

  const nextAggregateUsed = aggregateUsage.used + 1;
  const nextPerKeyUsed = perKeyUsage.used + 1;

  geminiRequestUsageByDay.set(perKeyUsage.dayKey, nextAggregateUsed);
  geminiRequestUsageByDayAndKey.set(perKeyUsage.usageKey, nextPerKeyUsed);

  console.log("[video-insights] reserved Gemini daily request slot", {
    kind: "analysis",
    dayKey: perKeyUsage.dayKey,
    keyName,
    aggregateUsed: nextAggregateUsed,
    aggregateLimit: aggregateUsage.limit,
    keyUsed: nextPerKeyUsed,
    keyLimit: perKeyUsage.limit,
  });

  return {
    dayKey: perKeyUsage.dayKey,
    aggregateUsed: nextAggregateUsed,
    aggregateLimit: aggregateUsage.limit,
    keyName,
    keyUsed: nextPerKeyUsed,
    keyLimit: perKeyUsage.limit,
  };
}

function reserveGeminiEmbeddingRequestSlotForKey(keyName: string) {
  const aggregateUsage = getGeminiEmbeddingUsageForToday();
  const perKeyUsage = getGeminiEmbeddingPerKeyUsageForToday(keyName);

  if (perKeyUsage.used >= perKeyUsage.limit) {
    throw new GeminiDailyLimitError(
      `Gemini embedding daily request limit reached for ${keyName} on ${perKeyUsage.dayKey}. Used ${perKeyUsage.used}/${perKeyUsage.limit} requests for this key.`,
    );
  }

  const nextAggregateUsed = aggregateUsage.used + 1;
  const nextPerKeyUsed = perKeyUsage.used + 1;

  geminiEmbeddingRequestUsageByDay.set(perKeyUsage.dayKey, nextAggregateUsed);
  geminiEmbeddingRequestUsageByDayAndKey.set(
    perKeyUsage.usageKey,
    nextPerKeyUsed,
  );

  console.log("[video-insights] reserved Gemini daily request slot", {
    kind: "embedding",
    dayKey: perKeyUsage.dayKey,
    keyName,
    aggregateUsed: nextAggregateUsed,
    aggregateLimit: aggregateUsage.limit,
    keyUsed: nextPerKeyUsed,
    keyLimit: perKeyUsage.limit,
  });

  return {
    dayKey: perKeyUsage.dayKey,
    aggregateUsed: nextAggregateUsed,
    aggregateLimit: aggregateUsage.limit,
    keyName,
    keyUsed: nextPerKeyUsed,
    keyLimit: perKeyUsage.limit,
  };
}

function pickNextGeminiApiKey() {
  const configuredKeys = getConfiguredGeminiApiKeys();

  if (configuredKeys.length === 0) {
    throw new GeminiDailyLimitError("No Gemini API keys are configured.");
  }

  for (let offset = 0; offset < configuredKeys.length; offset += 1) {
    const index = (nextGeminiApiKeyIndex + offset) % configuredKeys.length;
    const candidate = configuredKeys[index];
    const usage = getGeminiPerKeyUsageForToday(candidate.name);

    if (usage.used < usage.limit) {
      nextGeminiApiKeyIndex = (index + 1) % configuredKeys.length;
      return candidate;
    }
  }

  const snapshot = getGeminiUsageForToday();
  throw new GeminiDailyLimitError(
    `Gemini daily request limit reached for all configured keys on ${snapshot.dayKey}. Used ${snapshot.used}/${snapshot.limit} total requests across ${snapshot.configuredKeys} key(s).`,
  );
}

function pickNextGeminiEmbeddingApiKey() {
  const configuredKeys = getConfiguredGeminiApiKeys();

  if (configuredKeys.length === 0) {
    throw new GeminiDailyLimitError("No Gemini API keys are configured.");
  }

  for (let offset = 0; offset < configuredKeys.length; offset += 1) {
    const index =
      (nextGeminiEmbeddingApiKeyIndex + offset) % configuredKeys.length;
    const candidate = configuredKeys[index];
    const usage = getGeminiEmbeddingPerKeyUsageForToday(candidate.name);

    if (usage.used < usage.limit) {
      nextGeminiEmbeddingApiKeyIndex = (index + 1) % configuredKeys.length;
      return candidate;
    }
  }

  const snapshot = getGeminiEmbeddingUsageForToday();
  throw new GeminiDailyLimitError(
    `Gemini embedding daily request limit reached for all configured keys on ${snapshot.dayKey}. Used ${snapshot.used}/${snapshot.limit} total requests across ${snapshot.configuredKeys} key(s).`,
  );
}

async function withGeminiRateLimit<T>(
  task: (selectedKey: { name: string; value: string }) => Promise<T>,
) {
  const runTask = async () => {
    const configuredKeys = getConfiguredGeminiApiKeys();
    let latestQuotaError: GeminiDailyLimitError | null = null;

    for (let attempt = 0; attempt < configuredKeys.length; attempt += 1) {
      const waitMs = Math.max(
        0,
        lastGeminiRequestAt + MIN_GEMINI_REQUEST_INTERVAL_MS - Date.now(),
      );

      if (waitMs > 0) {
        console.log("[video-insights] waiting for Gemini rate limit", {
          waitMs,
        });
        await sleep(waitMs);
      }

      const selectedKey = pickNextGeminiApiKey();
      const usage = reserveGeminiRequestSlotForKey(selectedKey.name);

      lastGeminiRequestAt = Date.now();
      console.log("[video-insights] sending Gemini request", {
        sentAt: new Date(lastGeminiRequestAt).toISOString(),
        keyName: selectedKey.name,
        dailyUsed: usage.aggregateUsed,
        dailyLimit: usage.aggregateLimit,
        keyUsed: usage.keyUsed,
        keyLimit: usage.keyLimit,
      });

      try {
        return await task(selectedKey);
      } catch (error) {
        if (error instanceof GeminiDailyLimitError) {
          latestQuotaError = error;
          console.warn(
            "[video-insights] trying next Gemini key after quota hit",
            {
              keyName: selectedKey.name,
              attempt: attempt + 1,
              totalKeys: configuredKeys.length,
            },
          );
          continue;
        }

        throw error;
      }
    }

    throw (
      latestQuotaError ??
      new GeminiDailyLimitError(
        "Gemini daily request limit reached for all configured keys.",
      )
    );
  };

  const runPromise = geminiRequestChain.then(runTask, runTask);
  geminiRequestChain = runPromise.catch(() => undefined);

  return runPromise;
}

async function withGeminiEmbeddingRateLimit<T>(
  task: (selectedKey: { name: string; value: string }) => Promise<T>,
) {
  const runTask = async () => {
    const configuredKeys = getConfiguredGeminiApiKeys();
    let latestQuotaError: GeminiDailyLimitError | null = null;

    for (let attempt = 0; attempt < configuredKeys.length; attempt += 1) {
      const waitMs = Math.max(
        0,
        lastGeminiEmbeddingRequestAt +
          MIN_GEMINI_REQUEST_INTERVAL_MS -
          Date.now(),
      );

      if (waitMs > 0) {
        console.log("[video-insights] waiting for Gemini rate limit", {
          kind: "embedding",
          waitMs,
        });
        await sleep(waitMs);
      }

      const selectedKey = pickNextGeminiEmbeddingApiKey();
      const usage = reserveGeminiEmbeddingRequestSlotForKey(selectedKey.name);

      lastGeminiEmbeddingRequestAt = Date.now();
      console.log("[video-insights] sending Gemini request", {
        kind: "embedding",
        sentAt: new Date(lastGeminiEmbeddingRequestAt).toISOString(),
        keyName: selectedKey.name,
        dailyUsed: usage.aggregateUsed,
        dailyLimit: usage.aggregateLimit,
        keyUsed: usage.keyUsed,
        keyLimit: usage.keyLimit,
      });

      try {
        return await task(selectedKey);
      } catch (error) {
        if (error instanceof GeminiDailyLimitError) {
          latestQuotaError = error;
          console.warn(
            "[video-insights] trying next Gemini key after quota hit",
            {
              kind: "embedding",
              keyName: selectedKey.name,
              attempt: attempt + 1,
              totalKeys: configuredKeys.length,
            },
          );
          continue;
        }

        throw error;
      }
    }

    throw (
      latestQuotaError ??
      new GeminiDailyLimitError(
        "Gemini embedding daily request limit reached for all configured keys.",
      )
    );
  };

  const runPromise = geminiEmbeddingRequestChain.then(runTask, runTask);
  geminiEmbeddingRequestChain = runPromise.catch(() => undefined);

  return runPromise;
}

async function loadTranscriptForVideo(videoId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transcripts")
    .select("storage_path")
    .eq("video_id", videoId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.storage_path) {
    throw new Error(`No stored transcript found for video ${videoId}.`);
  }

  const transcriptJson = await readTranscriptJsonFromStorage(
    data.storage_path as string,
  );
  const segments = parseJson3Transcript(transcriptJson);

  if (segments.length === 0) {
    throw new Error(
      `Stored transcript for video ${videoId} has no parseable text.`,
    );
  }

  return segments.map((segment) => segment.text).join(" ");
}

async function resolveTranscript(input: GenerateVideoInsightsInput) {
  const directTranscript = input.transcript?.trim();

  if (directTranscript) {
    return directTranscript;
  }

  return loadTranscriptForVideo(input.videoId);
}

function stringifyJsonBlock(value: unknown) {
  if (value == null) {
    return "null";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeHeatmap(heatmap: unknown) {
  if (!Array.isArray(heatmap)) {
    return null;
  }

  const candidates = heatmap
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const scoreCandidates = [
        record.value,
        record.score,
        record.heat,
        record.intensity,
      ];
      const startCandidates = [
        record.start_time,
        record.start,
        record.time,
        record.timestamp,
      ];
      const endCandidates = [record.end_time, record.end];
      const score = scoreCandidates.find((value) => typeof value === "number");
      const start = startCandidates.find((value) => typeof value === "number");
      const end = endCandidates.find((value) => typeof value === "number");

      if (typeof score !== "number" || typeof start !== "number") {
        return null;
      }

      return {
        start,
        end: typeof end === "number" ? end : null,
        score,
      };
    })
    .filter(
      (entry): entry is { start: number; end: number | null; score: number } =>
        Boolean(entry),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  return candidates.length > 0 ? candidates : null;
}

function summarizeChapters(chapters: unknown) {
  if (!Array.isArray(chapters)) {
    return null;
  }

  const summarized = chapters
    .map((chapter) => {
      if (!chapter || typeof chapter !== "object") {
        return null;
      }

      const record = chapter as Record<string, unknown>;
      return {
        title: typeof record.title === "string" ? record.title : null,
        start_time:
          typeof record.start_time === "number" ? record.start_time : null,
        end_time: typeof record.end_time === "number" ? record.end_time : null,
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  return summarized.length > 0 ? summarized : null;
}

async function loadVideoContext(input: GenerateVideoInsightsInput) {
  try {
    const video = await getVideoForInsights(input.videoId);

    return {
      youtubeVideoId: video.video_id,
      title: input.title || video.title,
      description: input.description || video.description || "",
      thumbnailUrl: input.thumbnailUrl ?? video.thumbnail_url,
      uploadDate: video.upload_date,
      duration: video.duration,
      viewCount: video.view_count,
      likeCount: video.like_count,
      commentCount: video.comment_count,
      tags: video.tags ?? [],
      categories: video.categories ?? [],
      language: video.language,
      chapters: summarizeChapters(video.chapters),
      heatmap: summarizeHeatmap(video.heatmap),
      updatedAt: video.updated_at,
    };
  } catch {
    return {
      youtubeVideoId: null,
      title: input.title,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl ?? null,
      uploadDate: null,
      duration: null,
      viewCount: null,
      likeCount: null,
      commentCount: null,
      tags: [],
      categories: [],
      language: null,
      chapters: null,
      heatmap: null,
      updatedAt: null,
    };
  }
}

function buildPrompt(
  input: GenerateVideoInsightsInput & {
    transcript: string;
    youtubeVideoId: string | null;
    uploadDate: string | null;
    duration: number | null;
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
    tags: string[];
    categories: string[];
    language: string | null;
    chapters: unknown;
    heatmap: unknown;
    updatedAt: string | null;
  },
) {
  return `
You are an expert YouTube content analyst.

Analyze this video.

INTERNAL VIDEO ID:
${input.videoId}

YOUTUBE VIDEO ID:
${input.youtubeVideoId ?? "Unknown"}

TITLE:
${input.title}

DESCRIPTION:
${input.description || "No description provided."}

UPLOAD DATE:
${input.uploadDate ?? "Unknown"}

DURATION (SECONDS):
${input.duration ?? "Unknown"}

VIEW COUNT:
${input.viewCount ?? "Unknown"}

LIKE COUNT:
${input.likeCount ?? "Unknown"}

COMMENT COUNT:
${input.commentCount ?? "Unknown"}

LANGUAGE:
${input.language ?? "Unknown"}

TAGS:
${stringifyJsonBlock(input.tags)}

CATEGORIES:
${stringifyJsonBlock(input.categories)}

CHAPTERS:
${stringifyJsonBlock(input.chapters)}

HEATMAP:
${stringifyJsonBlock(input.heatmap)}

TRANSCRIPT:
${input.transcript}

Tasks:

1. Write a concise summary (100-150 words).
2. Extract the opening hook or first attention-grabbing idea. Use the early transcript, chapter structure, and heatmap signals when they help.
3. Describe the thumbnail objectively.

Return ONLY valid JSON.

Schema:
{
  "video_id": "",
  "summary": "",
  "hook": "",
  "thumbnail_description": "",
  "topics": [""],
  "keywords": [""]
}
`;
}

function inferMimeTypeFromUrl(url: string) {
  const normalized = url.toLowerCase();

  if (normalized.includes(".png")) {
    return "image/png";
  }

  if (normalized.includes(".webp")) {
    return "image/webp";
  }

  if (normalized.includes(".gif")) {
    return "image/gif";
  }

  return "image/jpeg";
}

async function fetchThumbnailInlinePart(thumbnailUrl?: string | null) {
  if (!thumbnailUrl) {
    return null;
  }

  const response = await fetch(thumbnailUrl);

  if (!response.ok) {
    throw new Error(
      `Thumbnail fetch failed with status ${response.status} for ${thumbnailUrl}.`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType =
    response.headers.get("content-type") || inferMimeTypeFromUrl(thumbnailUrl);

  return {
    inlineData: {
      mimeType,
      data: Buffer.from(arrayBuffer).toString("base64"),
    },
  };
}

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

function isMissingColumnsError(
  error: PostgrestLikeError | null,
  columns: string[],
) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42703" ||
    columns.some((column) => error.message?.includes(column)) ||
    false
  );
}

async function getStoredVideoInsights(videoId: string) {
  const supabase = createAdminClient();
  const preferredResult = await supabase
    .from("video_insights")
    .select(
      "video_id, summary, hook, thumbnail_description, topics, keywords, embedding, updated_at, created_at",
    )
    .eq("video_id", videoId)
    .maybeSingle();

  if (!preferredResult.error) {
    return (preferredResult.data as StoredVideoInsights | null) ?? null;
  }

  if (
    !isMissingColumnsError(preferredResult.error, [
      "topics",
      "keywords",
      "embedding",
      "updated_at",
    ])
  ) {
    throw preferredResult.error;
  }

  const fallbackResult = await supabase
    .from("video_insights")
    .select("video_id, summary, hook, thumbnail_description, created_at")
    .eq("video_id", videoId)
    .maybeSingle();

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  const fallbackData =
    (fallbackResult.data as StoredVideoInsights | null) ?? null;

  if (!fallbackData) {
    return null;
  }

  return {
    ...fallbackData,
    topics: [],
    keywords: [],
    embedding: null,
  };
}

function shouldReuseStoredInsights(input: {
  videoUpdatedAt: string | null;
  storedInsights: StoredVideoInsights | null;
}) {
  if (!input.storedInsights) {
    return false;
  }

  if (!input.videoUpdatedAt) {
    return true;
  }

  const insightsTimestamp =
    input.storedInsights.updated_at ?? input.storedInsights.created_at ?? null;

  if (!insightsTimestamp) {
    return true;
  }

  return insightsTimestamp >= input.videoUpdatedAt;
}

function parseInsightsPayload(
  payload: string,
  expectedVideoId: string,
): VideoInsights {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Model returned invalid JSON for video insights.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model returned an invalid video insights payload.");
  }

  const candidate = parsed as Partial<VideoInsights> & {
    topics?: unknown;
    keywords?: unknown;
  };
  const summary = candidate.summary?.trim();
  const hook = candidate.hook?.trim();
  const thumbnailDescription = candidate.thumbnail_description?.trim();
  const topics = Array.isArray(candidate.topics)
    ? candidate.topics
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const keywords = Array.isArray(candidate.keywords)
    ? candidate.keywords
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  if (!summary || !hook || !thumbnailDescription) {
    throw new Error(
      "Model response was missing one or more required insight fields.",
    );
  }

  return {
    video_id: expectedVideoId,
    summary,
    hook,
    thumbnail_description: thumbnailDescription,
    topics,
    keywords,
    embedding: null,
  };
}

function buildVideoInsightsEmbeddingText(input: {
  title: string;
  summary: string;
  hook: string;
  thumbnailDescription: string;
  topics: string[];
  keywords: string[];
}) {
  return [
    `Title:\n${input.title}`,
    `Summary:\n${input.summary}`,
    `Hook:\n${input.hook}`,
    `Thumbnail:\n${input.thumbnailDescription}`,
    `Topics:\n${input.topics.join(", ") || "None"}`,
    `Keywords:\n${input.keywords.join(", ") || "None"}`,
  ].join("\n\n");
}

function formatEmbeddingVector(values: number[] | null) {
  if (!values || values.length === 0) {
    return null;
  }

  return `[${values.join(",")}]`;
}

function isEmbeddingColumnError(error: PostgrestLikeError | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    message.includes("embedding") ||
    message.includes("vector") ||
    message.includes("dimension") ||
    false
  );
}

async function generateVideoInsightsEmbedding(
  text: string,
  options?: { allowFailure?: boolean; debugLabel?: string },
) {
  try {
    const values = await withGeminiEmbeddingRateLimit(async (selectedKey) => {
      const ai = new GoogleGenAI({
        apiKey: selectedKey.value,
      });

      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
      });

      const resultValues = response.embeddings?.[0]?.values;

      if (!Array.isArray(resultValues) || resultValues.length === 0) {
        throw new Error("Embedding model returned no values.");
      }

      return resultValues;
    });

    console.log("[video-insights] embedding generated", {
      model: EMBEDDING_MODEL,
      debugLabel: options?.debugLabel ?? null,
      dimensions: values.length,
    });

    return values;
  } catch (error) {
    if (options?.allowFailure === false) {
      throw error;
    }

    console.warn("[video-insights] embedding generation skipped", {
      model: EMBEDDING_MODEL,
      debugLabel: options?.debugLabel ?? null,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

export async function generateVideoInsights(
  input: GenerateVideoInsightsInput,
): Promise<VideoInsights> {
  const transcript = await resolveTranscript(input);
  const videoContext = await loadVideoContext(input);
  const thumbnailPart = await fetchThumbnailInlinePart(
    videoContext.thumbnailUrl,
  ).catch(() => null);

  let response;

  try {
    response = await withGeminiRateLimit(async (selectedKey) => {
      const ai = new GoogleGenAI({
        apiKey: selectedKey.value,
      });

      try {
        return await ai.models.generateContent({
          model: MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPrompt({
                    ...input,
                    ...videoContext,
                    transcript,
                  }),
                },
                ...(thumbnailPart ? [thumbnailPart] : []),
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryDelayMatch = message.match(
          /retry in\s+([0-9]+(?:\.[0-9]+)?)s/i,
        );
        const retryAfterSeconds = retryDelayMatch
          ? Math.ceil(Number(retryDelayMatch[1]))
          : null;

        if (
          message.includes("429") ||
          message.includes("RESOURCE_EXHAUSTED") ||
          message.includes("quota") ||
          message.includes("limit: 20")
        ) {
          console.warn("[video-insights] Gemini key exhausted", {
            videoId: input.videoId,
            keyName: selectedKey.name,
            retryAfterSeconds,
          });
          throw new GeminiDailyLimitError(message, retryAfterSeconds);
        }

        throw error;
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryDelayMatch = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
    const retryAfterSeconds = retryDelayMatch
      ? Math.ceil(Number(retryDelayMatch[1]))
      : null;

    if (
      message.includes("429") ||
      message.includes("RESOURCE_EXHAUSTED") ||
      message.includes("quota") ||
      message.includes("limit: 20")
    ) {
      throw new GeminiDailyLimitError(message, retryAfterSeconds);
    }

    throw error;
  }

  try {
    return parseInsightsPayload(response.text ?? "", input.videoId);
  } catch (error) {
    console.error("[video-insights] failed to parse Gemini response", {
      videoId: input.videoId,
      responseText: response.text ?? null,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export async function storeVideoInsights(insights: VideoInsights) {
  const supabase = createAdminClient();
  const fullPayload = {
    summary: insights.summary,
    hook: insights.hook,
    thumbnail_description: insights.thumbnail_description,
    topics: insights.topics,
    keywords: insights.keywords,
    embedding: formatEmbeddingVector(insights.embedding ?? null),
  };
  const fallbackPayload = {
    summary: insights.summary,
    hook: insights.hook,
    thumbnail_description: insights.thumbnail_description,
  };

  const updateResult = await supabase
    .from("video_insights")
    .update(fullPayload)
    .eq("video_id", insights.video_id)
    .select("video_id")
    .maybeSingle();

  if (updateResult.error) {
    if (isEmbeddingColumnError(updateResult.error)) {
      console.error("[video-insights] failed to update embedding payload", {
        videoId: insights.video_id,
        dimensions: insights.embedding?.length ?? null,
        error: updateResult.error.message,
      });
    }

    if (
      !isMissingColumnsError(updateResult.error, [
        "topics",
        "keywords",
        "embedding",
      ])
    ) {
      throw updateResult.error;
    }

    const fallbackUpdateResult = await supabase
      .from("video_insights")
      .update(fallbackPayload)
      .eq("video_id", insights.video_id)
      .select("video_id")
      .maybeSingle();

    if (fallbackUpdateResult.error) {
      throw fallbackUpdateResult.error;
    }

    if (fallbackUpdateResult.data) {
      return insights;
    }
  } else if (updateResult.data) {
    return insights;
  }

  const insertResult = await supabase.from("video_insights").insert({
    video_id: insights.video_id,
    ...fullPayload,
  });

  if (insertResult.error) {
    if (isEmbeddingColumnError(insertResult.error)) {
      console.error("[video-insights] failed to insert embedding payload", {
        videoId: insights.video_id,
        dimensions: insights.embedding?.length ?? null,
        error: insertResult.error.message,
      });
    }

    if (
      !isMissingColumnsError(insertResult.error, [
        "topics",
        "keywords",
        "embedding",
      ])
    ) {
      throw insertResult.error;
    }

    const fallbackInsertResult = await supabase.from("video_insights").insert({
      video_id: insights.video_id,
      ...fallbackPayload,
    });

    if (fallbackInsertResult.error) {
      throw fallbackInsertResult.error;
    }

    return insights;
  }

  return insights;
}

export async function backfillMissingVideoInsightEmbeddings(input: {
  youtubeConnectionId: string;
  limit?: number;
  failOnError?: boolean;
}) {
  const supabase = createAdminClient();
  const effectiveLimit = Math.min(Math.max(input.limit ?? 10, 1), 50);

  const fullResult = await supabase
    .from("video_insights")
    .select(
      "video_id, summary, hook, thumbnail_description, topics, keywords, videos!inner(id, title, youtube_connection_id)",
    )
    .eq("videos.youtube_connection_id", input.youtubeConnectionId)
    .is("embedding", null)
    .limit(effectiveLimit);

  let rows = fullResult.data as Array<Record<string, unknown>> | null;

  if (fullResult.error) {
    if (
      !isMissingColumnsError(fullResult.error, [
        "topics",
        "keywords",
        "embedding",
      ])
    ) {
      throw fullResult.error;
    }

    const fallbackResult = await supabase
      .from("video_insights")
      .select(
        "video_id, summary, hook, thumbnail_description, videos!inner(id, title, youtube_connection_id)",
      )
      .eq("videos.youtube_connection_id", input.youtubeConnectionId)
      .limit(effectiveLimit);

    if (fallbackResult.error) {
      throw fallbackResult.error;
    }

    rows = (fallbackResult.data as Array<Record<string, unknown>> | null) ?? [];
  }

  const candidates = (rows ?? []).filter((row) => {
    const summary = (row.summary as string | null)?.trim() ?? "";
    const hook = (row.hook as string | null)?.trim() ?? "";
    const thumbnailDescription =
      (row.thumbnail_description as string | null)?.trim() ?? "";

    return Boolean(summary && hook && thumbnailDescription);
  });

  let processed = 0;
  const errors: Array<{
    videoId: string;
    stage: "embed" | "store";
    message: string;
  }> = [];
  const debug: Array<{
    videoId: string;
    title: string;
    embeddingDimensions: number | null;
    stored: boolean;
    topicsCount: number;
    keywordsCount: number;
  }> = [];

  for (const row of candidates) {
    const videoId = row.video_id as string;
    const summary = (row.summary as string | null)?.trim() ?? "";
    const hook = (row.hook as string | null)?.trim() ?? "";
    const thumbnailDescription =
      (row.thumbnail_description as string | null)?.trim() ?? "";
    const topics = Array.isArray(row.topics)
      ? row.topics.filter((value): value is string => typeof value === "string")
      : [];
    const keywords = Array.isArray(row.keywords)
      ? row.keywords.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const title = Array.isArray(row.videos)
      ? ((row.videos[0] as { title?: string | null } | undefined)?.title ??
        "Untitled")
      : ((row.videos as { title?: string | null } | null)?.title ?? "Untitled");

    if (!summary || !hook || !thumbnailDescription) {
      continue;
    }

    const embeddingText = buildVideoInsightsEmbeddingText({
      title,
      summary,
      hook,
      thumbnailDescription,
      topics,
      keywords,
    });
    let embedding: number[] | null = null;

    try {
      embedding = await generateVideoInsightsEmbedding(embeddingText, {
        allowFailure: false,
        debugLabel: `backfill:${videoId}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        videoId,
        stage: "embed",
        message,
      });

      if (input.failOnError) {
        throw error;
      }

      continue;
    }

    if (!embedding || embedding.length === 0) {
      const message = "Embedding generation returned no vector values.";
      errors.push({
        videoId,
        stage: "embed",
        message,
      });

      if (input.failOnError) {
        throw new Error(message);
      }

      continue;
    }

    try {
      await storeVideoInsights({
        video_id: videoId,
        summary,
        hook,
        thumbnail_description: thumbnailDescription,
        topics,
        keywords,
        embedding,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        videoId,
        stage: "store",
        message,
      });

      console.error("[video-insights] failed to store backfilled embedding", {
        videoId,
        dimensions: embedding.length,
        message,
      });

      if (input.failOnError) {
        throw error;
      }

      continue;
    }

    debug.push({
      videoId,
      title,
      embeddingDimensions: embedding.length,
      stored: true,
      topicsCount: topics.length,
      keywordsCount: keywords.length,
    });

    processed += 1;
  }

  return {
    requested: effectiveLimit,
    found: candidates.length,
    processed,
    model: EMBEDDING_MODEL,
    errors,
    debug,
  };
}

export async function generateAndStoreVideoInsights(
  input: GenerateVideoInsightsInput,
) {
  const videoContext = await loadVideoContext(input);
  const storedInsights = await getStoredVideoInsights(input.videoId);

  if (
    shouldReuseStoredInsights({
      videoUpdatedAt: videoContext.updatedAt,
      storedInsights,
    })
  ) {
    console.log("[video-insights] reusing stored insights", {
      videoId: input.videoId,
      hasUpdatedAt: Boolean(storedInsights?.updated_at),
      hasCreatedAt: Boolean(storedInsights?.created_at),
      videoUpdatedAt: videoContext.updatedAt,
    });
    return storedInsights;
  }

  console.log("[video-insights] generating new insights", {
    videoId: input.videoId,
    title: input.title,
  });

  const insights = await generateVideoInsights(input);
  const embeddingText = buildVideoInsightsEmbeddingText({
    title: videoContext.title,
    summary: insights.summary,
    hook: insights.hook,
    thumbnailDescription: insights.thumbnail_description,
    topics: insights.topics,
    keywords: insights.keywords,
  });
  const embedding = await generateVideoInsightsEmbedding(embeddingText, {
    debugLabel: `pipeline:${input.videoId}`,
  });
  await storeVideoInsights({
    ...insights,
    embedding,
  });

  console.log("[video-insights] stored insights", {
    videoId: input.videoId,
    summaryLength: insights.summary.length,
    hookLength: insights.hook.length,
    thumbnailDescriptionLength: insights.thumbnail_description.length,
    topicsCount: insights.topics.length,
    keywordsCount: insights.keywords.length,
    hasEmbedding: Boolean(embedding),
  });

  return {
    ...insights,
    embedding,
  };
}
