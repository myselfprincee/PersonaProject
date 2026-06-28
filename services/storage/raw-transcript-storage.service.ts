import crypto from "node:crypto";
import path from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/db/supabase-admin";

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

export async function uploadTranscriptBufferToStorage(input: {
  videoId: string;
  filePath: string;
  buffer: Buffer;
}) {
  const supabase = createAdminClient();
  const storagePath = createStorageKey(input.filePath);
  const checksumSha256 = crypto
    .createHash("sha256")
    .update(input.buffer)
    .digest("hex");

  await s3Client.send(
    new PutObjectCommand({
      Bucket: requiredEnv("SUPABASE_BUCKET_NAME"),
      Key: storagePath,
      Body: input.buffer,
      ContentType: "application/json",
    }),
  );

  const { error: transcriptError } = await supabase.from("transcripts").upsert(
    {
      video_id: input.videoId,
      storage_path: storagePath,
    },
    {
      onConflict: "video_id",
    },
  );

  if (transcriptError) {
    throw transcriptError;
  }

  const { error: videoError } = await supabase
    .from("videos")
    .update({
      transcript_stored: true,
    })
    .eq("id", input.videoId);

  if (videoError) {
    throw videoError;
  }

  return {
    storagePath,
    checksumSha256,
  };
}

export async function readTranscriptJsonFromStorage(storagePath: string) {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: requiredEnv("SUPABASE_BUCKET_NAME"),
      Key: storagePath,
    }),
  );

  const body = await response.Body?.transformToString();

  if (!body) {
    throw new Error(`Transcript file at ${storagePath} is empty.`);
  }

  return JSON.parse(body) as unknown;
}
