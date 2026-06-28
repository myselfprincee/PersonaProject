import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { buildChunks, parseJson3Transcript } from "@/chunking/transcriptChunker";
import { embedChunks } from "@/chunking/embedChunks";
import { createClient } from "@/lib/supabase/server";


export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const s3 = new S3Client({
    forcePathStyle: true,
    region: process.env.SUPABASE_BUCKET_REGION,
    endpoint: process.env.SUPABASE_BUCKET_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.SUPABASE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SUPABASE_SECRET_ACCESS_KEY!,
    },
  });

  const path = request.nextUrl.searchParams.get("path");

  
  
  if (!path) {
    throw new Error("path is empty");
  }

  
  const { data: transcriptRow, error } = await supabase
  .from("transcripts")
  .select("video_id")
  .eq("storage_path", path)
  .single();
  
  if (!transcriptRow?.video_id) {
    throw new Error("video_id is empty");
  }
  const command = new GetObjectCommand({
    Bucket: "replyai", // your bucket name
    Key: path,
  });

  const { Body } = await s3.send(command);

  const transcriptString = await Body!.transformToString();

const transcript = JSON.parse(transcriptString);

const segments = parseJson3Transcript(transcript);
const chunks = buildChunks(segments);

// console.log(chunks);

const embedding = await embedChunks(chunks, transcriptRow?.video_id);
console.log(embedding);

  return NextResponse.json({
    transcript,
  });
}
