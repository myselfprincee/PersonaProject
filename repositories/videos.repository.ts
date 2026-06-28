import { createAdminClient } from "@/lib/db/supabase-admin";

export type CatalogVideoInput = {
  youtubeConnectionId: string;
  youtubeVideoId: string;
  title: string;
};

export type VideoMetadataUpdateInput = {
  youtubeVideoId: string;
  description: string | null;
  uploadDate: string | null;
  duration: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  thumbnailUrl: string | null;
  tags: string[];
  categories: string[];
  language: string | null;
  chapters: unknown;
  heatmap: unknown;
};

export async function upsertCatalogVideos(videos: CatalogVideoInput[]) {
  if (videos.length === 0) {
    return [] as Array<{ id: string; video_id: string; title: string }>;
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("videos")
    .upsert(
      videos.map((video) => ({
        youtube_connection_id: video.youtubeConnectionId,
        video_id: video.youtubeVideoId,
        title: video.title,
      })),
      {
        onConflict: "video_id",
      },
    )
    .select("id, video_id, title");

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ id: string; video_id: string; title: string }>;
}

export async function updateVideoMetadataByYoutubeVideoId(
  input: VideoMetadataUpdateInput,
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("videos")
    .update({
      description: input.description,
      upload_date: input.uploadDate,
      duration: input.duration,
      view_count: input.viewCount,
      like_count: input.likeCount,
      comment_count: input.commentCount,
      thumbnail_url: input.thumbnailUrl,
      tags: input.tags,
      categories: input.categories,
      language: input.language,
      chapters: input.chapters,
      heatmap: input.heatmap,
      updated_at: new Date().toISOString(),
    })
    .eq("video_id", input.youtubeVideoId)
    .select(
      "id, video_id, title, description, thumbnail_url, heatmap, chapters",
    )
    .single();

  if (error) {
    throw error;
  }

  return data as {
    id: string;
    video_id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    heatmap: unknown;
    chapters: unknown;
  };
}

export async function listVideoIdsWithInsights(videoIds: string[]) {
  if (videoIds.length === 0) {
    return new Set<string>();
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("video_insights")
    .select("video_id")
    .in("video_id", videoIds);

  if (error) {
    throw error;
  }

  return new Set<string>((data ?? []).map((row) => row.video_id as string));
}

export async function countVideosMissingInsights(youtubeConnectionId: string) {
  const supabase = createAdminClient();

  const { data: videos, error: videosError } = await supabase
    .from("videos")
    .select("id")
    .eq("youtube_connection_id", youtubeConnectionId);

  if (videosError) {
    throw videosError;
  }

  const videoIds = (videos ?? []).map((video) => video.id as string);

  if (videoIds.length === 0) {
    return {
      totalVideos: 0,
      videosWithInsights: 0,
      videosMissingInsights: 0,
    };
  }

  const videoIdsWithInsights = await listVideoIdsWithInsights(videoIds);

  return {
    totalVideos: videoIds.length,
    videosWithInsights: videoIdsWithInsights.size,
    videosMissingInsights: videoIds.length - videoIdsWithInsights.size,
  };
}

export async function getVideoForInsights(videoId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, video_id, title, description, thumbnail_url, upload_date, duration, view_count, like_count, comment_count, tags, categories, language, chapters, heatmap, updated_at",
    )
    .eq("id", videoId)
    .single();

  if (error) {
    throw error;
  }

  return data as {
    id: string;
    video_id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    upload_date: string | null;
    duration: number | null;
    view_count: number | null;
    like_count: number | null;
    comment_count: number | null;
    tags: string[] | null;
    categories: string[] | null;
    language: string | null;
    chapters: unknown;
    heatmap: unknown;
    updated_at: string | null;
  };
}
