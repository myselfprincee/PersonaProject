import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  markVideoTranscriptStored,
  upsertTranscriptRecord,
} from "@/repositories/transcripts.repository";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const s3Client = new S3Client({
  forcePathStyle: true,
  region: process.env.SUPABASE_BUCKET_REGION,
  endpoint: requiredEnv("SUPABASE_BUCKET_ENDPOINT"),
  credentials: {
    accessKeyId: requiredEnv("SUPABASE_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("SUPABASE_SECRET_ACCESS_KEY"),
  },
});

function createStorageKey(filePath: string) {
  const relativePath = path.relative(path.join(process.cwd(), "tmp"), filePath);
  const segments = relativePath.split(path.sep).filter(Boolean);
  const fileName = segments.at(-1);

  if (!fileName) {
    throw new Error(
      `Could not derive transcript storage key from path: ${filePath}`,
    );
  }

  if (segments.length >= 3 && segments[1] === "transcripts") {
    return [segments[0], "transcripts", fileName].join("/");
  }

  if (segments.length >= 3 && segments[0] === "ingestion") {
    return [segments[1], "transcripts", fileName].join("/");
  }

  if (segments.length >= 2) {
    return [segments[0], "transcripts", fileName].join("/");
  }

  return fileName;
}

export async function uploadTranscriptFileToStorage(input: {
  filePath: string;
  videoId: string;
}) {
  const fileBuffer = await fs.readFile(input.filePath);
  const storageKey = createStorageKey(input.filePath);
  const checksumSha256 = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex");

  await s3Client.send(
    new PutObjectCommand({
      Bucket: requiredEnv("SUPABASE_BUCKET_NAME"),
      Key: storageKey,
      Body: fileBuffer,
      ContentType: "application/json",
    }),
  );

  await upsertTranscriptRecord({
    videoId: input.videoId,
    storagePath: storageKey,
    checksumSha256,
  });
  await markVideoTranscriptStored(input.videoId);

  return {
    storagePath: storageKey,
    checksumSha256,
  };
}
