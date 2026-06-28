import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";

type VideoRow = {
  id: string;
  video_id: string;
  title: string | null;
  thumbnail_url: string | null;
  upload_date: string | null;
  duration: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
};

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getYoutubeConnectionForUser(userId);

  if (!connection) {
    return NextResponse.json(
      { error: "No YouTube channel connected." },
      { status: 404 },
    );
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("videos")
      .select(
        "id, video_id, title, thumbnail_url, upload_date, duration, view_count, like_count, comment_count",
      )
      .eq("youtube_connection_id", connection.id)
      .order("upload_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    const videos = ((data ?? []) as VideoRow[]).map((video) => ({
      id: video.id as string,
      youtubeVideoId: video.video_id as string,
      title: (video.title as string | null) ?? "Untitled",
      thumbnailUrl: (video.thumbnail_url as string | null) ?? null,
      uploadDate: (video.upload_date as string | null) ?? null,
      duration: (video.duration as number | null) ?? null,
      viewCount: (video.view_count as number | null) ?? null,
      likeCount: (video.like_count as number | null) ?? null,
      commentCount: (video.comment_count as number | null) ?? null,
    }));

    return NextResponse.json({ videos });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load videos.",
      },
      { status: 500 },
    );
  }
}
