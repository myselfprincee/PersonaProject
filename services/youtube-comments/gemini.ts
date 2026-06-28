import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY_ENV_NAMES = [
  "GEMINI_API_KEY1",
  "GEMINI_API_KEY2",
  "GEMINI_API_KEY3",
  "GEMINI_API_KEY4",
] as const;

let geminiApiKeyIndex = 0;

export function getGeminiApiKeys() {
  const keys = GEMINI_API_KEY_ENV_NAMES.map((name) =>
    process.env[name]?.trim(),
  ).filter((value): value is string => Boolean(value));

  if (keys.length > 0) {
    return keys;
  }

  const fallback = process.env.GEMINI_API_KEY?.trim();

  if (!fallback) {
    throw new Error("Missing Gemini API key.");
  }

  return [fallback];
}

export function getGeminiApiKey() {
  const keys = getGeminiApiKeys();
  const apiKey = keys[geminiApiKeyIndex % keys.length];
  geminiApiKeyIndex = (geminiApiKeyIndex + 1) % keys.length;
  return apiKey;
}

export function createGeminiClient() {
  return new GoogleGenAI({ apiKey: getGeminiApiKey() });
}
