import { createAdminClient } from "@/lib/db/supabase-admin";

export async function getTranscriptStoragePathsByVideoIds(videoIds: string[]) {
  if (videoIds.length === 0) {
    return new Map<string, string>();
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transcripts")
    .select("video_id, storage_path")
    .in("video_id", videoIds);

  if (error) {
    throw error;
  }

  const transcriptMap = new Map<string, string>();

  for (const row of data ?? []) {
    if (row.video_id && row.storage_path) {
      transcriptMap.set(row.video_id as string, row.storage_path as string);
    }
  }

  return transcriptMap;
}

export async function upsertTranscriptRecord(input: {
  videoId: string;
  storagePath: string;
  source?: string;
  language?: string;
  checksumSha256?: string | null;
}) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("transcripts")
    .upsert(
      {
        video_id: input.videoId,
        storage_path: input.storagePath,
        source: input.source ?? "youtube_auto",
        language: input.language ?? "en",
        checksum_sha256: input.checksumSha256 ?? null,
        status: "uploaded",
      },
      {
        onConflict: "video_id",
      },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function markVideoTranscriptStored(videoId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("videos")
    .update({
      transcript_stored: true,
    })
    .eq("id", videoId);

  if (error) {
    throw error;
  }
}
