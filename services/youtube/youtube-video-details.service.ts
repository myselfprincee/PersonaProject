import { spawn } from "node:child_process";

export type YoutubeVideoDetails = {
  youtubeVideoId: string;
  title: string;
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

function toIsoDate(uploadDate?: string | null) {
  if (!uploadDate || uploadDate.length !== 8) {
    return null;
  }

  return `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
}

export async function fetchYoutubeVideoDetails(
  youtubeVideoId: string,
): Promise<YoutubeVideoDetails> {
  return new Promise((resolve, reject) => {
    const child = spawn("C:\\yt-dlp.exe", [
      "--dump-single-json",
      `https://www.youtube.com/watch?v=${youtubeVideoId}`,
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const metadata = JSON.parse(stdout) as Record<string, unknown>;

        resolve({
          youtubeVideoId,
          title: typeof metadata.title === "string" ? metadata.title : youtubeVideoId,
          description:
            typeof metadata.description === "string" ? metadata.description : null,
          uploadDate: toIsoDate(
            typeof metadata.upload_date === "string" ? metadata.upload_date : null,
          ),
          duration:
            typeof metadata.duration === "number" ? metadata.duration : null,
          viewCount:
            typeof metadata.view_count === "number" ? metadata.view_count : null,
          likeCount:
            typeof metadata.like_count === "number" ? metadata.like_count : null,
          commentCount:
            typeof metadata.comment_count === "number" ? metadata.comment_count : null,
          thumbnailUrl:
            typeof metadata.thumbnail === "string" ? metadata.thumbnail : null,
          tags: Array.isArray(metadata.tags)
            ? metadata.tags.filter((tag): tag is string => typeof tag === "string")
            : [],
          categories: Array.isArray(metadata.categories)
            ? metadata.categories.filter(
                (category): category is string => typeof category === "string",
              )
            : [],
          language:
            typeof metadata.language === "string" ? metadata.language : null,
          chapters: metadata.chapters ?? null,
          heatmap: metadata.heatmap ?? null,
        });
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to parse yt-dlp video details output."),
        );
      }
    });

    child.on("error", reject);
  });
}
