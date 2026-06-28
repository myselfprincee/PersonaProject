import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@/lib/supabase/server";

if (
  !process.env.SUPABASE_BUCKET_ENDPOINT ||
  !process.env.SUPABASE_ACCESS_KEY_ID ||
  !process.env.SUPABASE_SECRET_ACCESS_KEY ||
  !process.env.SUPABASE_BUCKET_NAME
) {
  throw new Error("Missing Supabase S3 environment variables.");
}

const client = new S3Client({
  forcePathStyle: true,
  region: process.env.SUPABASE_BUCKET_REGION,
  endpoint: process.env.SUPABASE_BUCKET_ENDPOINT,
  credentials: {
    accessKeyId: process.env.SUPABASE_ACCESS_KEY_ID,
    secretAccessKey: process.env.SUPABASE_SECRET_ACCESS_KEY,
  },
});

export async function saveToS3(
  filePath: string,
  videoDbId: string, // videos.id (UUID)
) {
  const supabase = await createClient();

  const fileBuffer = await fs.readFile(filePath);

  const relativePath = path.relative(path.join(process.cwd(), "tmp"), filePath);
  const segments = relativePath.split(path.sep).filter(Boolean);
  const fileName = segments.at(-1);

  if (!fileName) {
    throw new Error(
      `Could not derive transcript storage key from path: ${filePath}`,
    );
  }

  const key =
    segments.length >= 2
      ? [segments[0], "transcripts", fileName].join("/")
      : fileName;

  // Upload to Supabase Storage (S3)
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.SUPABASE_BUCKET_NAME!,
      Key: key,
      Body: fileBuffer,
      ContentType: "application/json",
    }),
  );

  // Save transcript metadata
  const { error: transcriptError } = await supabase.from("transcripts").upsert(
    {
      video_id: videoDbId,
      storage_path: key,
    },
    {
      onConflict: "video_id",
    },
  );

  if (transcriptError) {
    throw transcriptError;
  }

  // Mark transcript as stored
  const { error: videoError } = await supabase
    .from("videos")
    .update({
      transcript_stored: true,
    })
    .eq("id", videoDbId);

  if (videoError) {
    throw videoError;
  }

  return {
    storagePath: key,
  };
}
