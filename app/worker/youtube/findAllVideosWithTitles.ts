import { spawn } from "node:child_process";

type YouTubeVideo = {
  id: string;
  title: string;
};

export const findAllVideoIds = async (
  channelId: string
): Promise<YouTubeVideo[]> => {
  return new Promise((resolve, reject) => {
    const ytDlpProcess = spawn("C:\\yt-dlp.exe", [
      "--flat-playlist",
      `https://www.youtube.com/channel/${channelId}`,
      "--print",
      "%(id)s\t%(title)s",
    ]);

    let output = "";
    let errorOutput = "";

    ytDlpProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    ytDlpProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    ytDlpProcess.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`yt-dlp failed with code ${code}: ${errorOutput}`)
        );
      }

      const videos: YouTubeVideo[] = output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [id, ...titleParts] = line.split("\t");

          return {
            id: id.trim(),
            title: titleParts.join("\t").trim(),
          };
        });

      resolve(videos);
    });

    ytDlpProcess.on("error", reject);
  });
};