import { spawn } from "node:child_process";

export async function downloadProfilePicture(
  youtubeChannelId: string,
  channelDbId: string,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("yt-dlp", [
      "--write-thumbnail",
      "--skip-download",
      "--playlist-items",
      "0",
      `https://www.youtube.com/channel/${youtubeChannelId}`,
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
      if (stderr) console.error(stderr);
      if (stdout) console.log(stdout);

      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }

      resolve(stdout);
    });

    child.on("error", reject);
  });
}