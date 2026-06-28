import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

async function findDownloadedTranscriptFile(directory: string, youtubeVideoId: string) {
  const files = await fs.readdir(directory);
  const transcriptFile = files.find(
    (file) => file.startsWith(`${youtubeVideoId}.`) && file.endsWith(".json3"),
  );

  if (!transcriptFile) {
    throw new Error(`No transcript file was downloaded for video ${youtubeVideoId}.`);
  }

  return path.join(directory, transcriptFile);
}

export async function downloadTranscriptToTempFile(input: {
  youtubeVideoId: string;
  channelId: string;
}) {
  const tempDirectory = path.join(
    process.cwd(),
    "tmp",
    "ingestion",
    input.channelId,
  );

  await fs.mkdir(tempDirectory, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const processHandle = spawn("C:\\yt-dlp.exe", [
      "--skip-download",
      "--write-auto-sub",
      "--write-sub",
      "--sub-langs",
      "en,en-US",
      "--sub-format",
      "json3",
      "-o",
      path.join(tempDirectory, "%(id)s.%(ext)s"),
      `https://youtu.be/${input.youtubeVideoId}`,
    ]);

    let errorOutput = "";

    processHandle.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });

    processHandle.on("error", reject);
    processHandle.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed with code ${code}: ${errorOutput}`));
        return;
      }

      resolve();
    });
  });

  const localPath = await findDownloadedTranscriptFile(tempDirectory, input.youtubeVideoId);

  return {
    localPath,
    tempDirectory,
  };
}
