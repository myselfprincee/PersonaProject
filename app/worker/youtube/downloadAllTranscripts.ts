import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { saveToS3 } from "./saveToS3";

export const downloadAllTranscripts = async (
  youtubeVideoId: string,
  channel_id: string,
  videoDbId: string
) => {
  const tmpDir = path.join(process.cwd(), "tmp", channel_id);

  await fs.mkdir(tmpDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const ytDlpProcess = spawn("C:\\yt-dlp.exe", [
      "--skip-download",
      "--write-auto-sub",
      "--write-sub",
      "--sub-langs",
      "en,en-US",
      "--sub-format",
      "json3",

      "-o",
      path.join(tmpDir, "%(id)s.%(ext)s"),

      `https://youtu.be/${youtubeVideoId}`,
    ]);

    let errorOutput = "";

    ytDlpProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    ytDlpProcess.on("close", async (code) => {
      if (code !== 0) {
        return reject(console.log(errorOutput));
      }

      const fullTranscriptPath = path.join(tmpDir, `${youtubeVideoId}.en.json3`);

      const uploaded = await saveToS3(fullTranscriptPath, videoDbId);
      await fs.unlink(fullTranscriptPath);

      resolve(uploaded);
    });

    ytDlpProcess.on("error", reject);
  });
};
