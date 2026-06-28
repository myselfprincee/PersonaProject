import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-2";
const DEFAULT_BATCH_SIZE = 48;
const GEMINI_API_KEY_ENV_NAMES = [
  "GEMINI_API_KEY1",
  "GEMINI_API_KEY2",
  "GEMINI_API_KEY3",
  "GEMINI_API_KEY4",
] as const;
const DEFAULT_DAILY_GEMINI_EMBEDDING_REQUEST_LIMIT = 1000;
const MIN_GEMINI_EMBEDDING_REQUEST_INTERVAL_MS = 600;

let geminiEmbeddingRequestChain: Promise<unknown> = Promise.resolve();
let lastGeminiEmbeddingRequestAt = 0;
let nextGeminiEmbeddingApiKeyIndex = 0;
const geminiEmbeddingRequestUsageByDay = new Map<string, number>();
const geminiEmbeddingRequestUsageByDayAndKey = new Map<string, number>();

export class GeminiEmbeddingDailyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiEmbeddingDailyLimitError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getGeminiEmbeddingDailyRequestLimit() {
  const parsed = Number(process.env.GEMINI_EMBEDDING_DAILY_REQUEST_LIMIT ?? "");

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_DAILY_GEMINI_EMBEDDING_REQUEST_LIMIT;
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

function reserveGeminiEmbeddingRequestSlotForKey(keyName: string) {
  const aggregateUsage = getGeminiEmbeddingUsageForToday();
  const perKeyUsage = getGeminiEmbeddingPerKeyUsageForToday(keyName);

  if (perKeyUsage.used >= perKeyUsage.limit) {
    throw new GeminiEmbeddingDailyLimitError(
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

  return {
    aggregateUsed: nextAggregateUsed,
    aggregateLimit: aggregateUsage.limit,
    keyUsed: nextPerKeyUsed,
    keyLimit: perKeyUsage.limit,
  };
}

function pickNextGeminiEmbeddingApiKey() {
  const configuredKeys = getConfiguredGeminiApiKeys();

  if (configuredKeys.length === 0) {
    throw new GeminiEmbeddingDailyLimitError(
      "No Gemini API keys are configured.",
    );
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
  throw new GeminiEmbeddingDailyLimitError(
    `Gemini embedding daily request limit reached for all configured keys on ${snapshot.dayKey}. Used ${snapshot.used}/${snapshot.limit} total requests across ${snapshot.configuredKeys} key(s).`,
  );
}

async function withGeminiEmbeddingRateLimit<T>(
  task: (selectedKey: { name: string; value: string }) => Promise<T>,
) {
  const runTask = async () => {
    const configuredKeys = getConfiguredGeminiApiKeys();
    let latestQuotaError: GeminiEmbeddingDailyLimitError | null = null;

    for (let attempt = 0; attempt < configuredKeys.length; attempt += 1) {
      const waitMs = Math.max(
        0,
        lastGeminiEmbeddingRequestAt +
          MIN_GEMINI_EMBEDDING_REQUEST_INTERVAL_MS -
          Date.now(),
      );

      if (waitMs > 0) {
        await sleep(waitMs);
      }

      const selectedKey = pickNextGeminiEmbeddingApiKey();
      reserveGeminiEmbeddingRequestSlotForKey(selectedKey.name);
      lastGeminiEmbeddingRequestAt = Date.now();

      try {
        return await task(selectedKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (
          error instanceof GeminiEmbeddingDailyLimitError ||
          message.includes("429") ||
          message.includes("RESOURCE_EXHAUSTED") ||
          message.includes("quota")
        ) {
          latestQuotaError =
            error instanceof GeminiEmbeddingDailyLimitError
              ? error
              : new GeminiEmbeddingDailyLimitError(message);
          continue;
        }

        throw error;
      }
    }

    throw (
      latestQuotaError ??
      new GeminiEmbeddingDailyLimitError(
        "Gemini embedding daily request limit reached for all configured keys.",
      )
    );
  };

  const runPromise = geminiEmbeddingRequestChain.then(runTask, runTask);
  geminiEmbeddingRequestChain = runPromise.catch(() => undefined);

  return runPromise;
}

export async function embedTextWithGemini(text: string) {
  return withGeminiEmbeddingRateLimit(async (selectedKey) => {
    const ai = new GoogleGenAI({
      apiKey: selectedKey.value,
    });
    const response = await ai.models.embedContent({
      model: DEFAULT_MODEL,
      contents: text,
    });
    const values = response.embeddings?.[0]?.values;

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("Embedding request returned no values.");
    }

    return values;
  });
}

export async function generateEmbeddingsForTexts(
  texts: string[],
  batchSize = DEFAULT_BATCH_SIZE,
) {
  const batches: number[][][] = [];

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const embeddings = await Promise.all(
      batch.map((text) => embedTextWithGemini(`search_document: ${text}`)),
    );

    if (embeddings.length !== batch.length) {
      throw new Error(
        `Expected ${batch.length} embeddings but received ${embeddings.length}.`,
      );
    }

    batches.push(embeddings);
  }

  return batches.flat();
}
