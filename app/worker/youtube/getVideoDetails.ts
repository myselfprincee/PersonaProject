import { spawn } from "node:child_process";
import { createClient } from "@/lib/supabase/server";

export async function getVideoDetails(videoId: string) {
  const supabase = await createClient();

  return new Promise<string>((resolve, reject) => {
    const child = spawn("yt-dlp", [
      "--dump-single-json",
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", async (code) => {
      if (stderr) console.error(stderr);
      // if (stdout) console.log(stdout);

      const metadata = JSON.parse(stdout);

      // const video = {
      //   video_id: metadata.id,
      //   title: metadata.title,
      //   description: metadata.description,
      //   upload_date: metadata.upload_date
      //     ? `${metadata.upload_date.slice(0, 4)}-${metadata.upload_date.slice(4, 6)}-${metadata.upload_date.slice(6, 8)}`
      //     : null,

      //   duration: metadata.duration,

      //   view_count: metadata.view_count,
      //   like_count: metadata.like_count,
      //   comment_count: metadata.comment_count,

      //   thumbnail_url: metadata.thumbnail,

      //   tags: metadata.tags ?? [],
      //   categories: metadata.categories ?? [],

      //   language: metadata.language,

      //   chapters: metadata.chapters ?? null,
      //   heatmap: metadata.heatmap ?? null,
      // };

      const { error } = await supabase
        .from("videos")
        .update({
          description: metadata.description,
          upload_date: metadata.upload_date
            ? `${metadata.upload_date.slice(0, 4)}-${metadata.upload_date.slice(4, 6)}-${metadata.upload_date.slice(6, 8)}`
            : null,
          duration: metadata.duration,
          view_count: metadata.view_count,
          like_count: metadata.like_count,
          comment_count: metadata.comment_count,
          thumbnail_url: metadata.thumbnail,
          tags: metadata.tags ?? [],
          categories: metadata.categories ?? [],
          language: metadata.language,
          chapters: metadata.chapters ?? null,
          heatmap: metadata.heatmap ?? null,
        })
        .eq("video_id", metadata.id);

      if (error) throw error;

      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }

      resolve(stdout);
    });

    child.on("error", reject);
  });
}
