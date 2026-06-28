import { spawn } from "node:child_process";

export type YoutubeVideoPayload = {
  videoId: string;
  title?: string;
  uploader?: string;
  thumbnail?: string;
  comments: unknown[];
};

function getYtDlpCommand() {
  return process.env.YT_DLP_PATH?.trim() || "yt-dlp";
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

const YT_DLP_TIMEOUT_MS = 60_000;

export async function fetchYoutubeVideoPayloadWithComments(
  youtubeVideoId: string,
): Promise<YoutubeVideoPayload> {
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
  const args = [
    "--verbose",
    "--skip-download",
    "--write-comments",
    "--dump-single-json",
    "--extractor-args",
    "youtube:max_comments=10000",
    videoUrl,
  ];

  console.log("[youtube-comments][ytdlp] fetch started", {
    youtubeVideoId,
    videoUrl,
  });

  let stdout = "";
  let stderr = "";

  return await new Promise<YoutubeVideoPayload>((resolve, reject) => {
    const ytDlpCommand = getYtDlpCommand();
    console.log("[youtube-comments][ytdlp] spawning process", {
      youtubeVideoId,
      ytDlpCommand,
      args,
      timeoutMs: YT_DLP_TIMEOUT_MS,
    });

    const child = spawn(ytDlpCommand, args, {
      shell: process.platform === "win32",
    });

    const timer = setTimeout(() => {
      console.error("[youtube-comments][ytdlp] process timed out", {
        youtubeVideoId,
        timeoutMs: YT_DLP_TIMEOUT_MS,
      });
      child.kill("SIGKILL");
    }, YT_DLP_TIMEOUT_MS);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      console.log("[youtube-comments][ytdlp] process closed", {
        youtubeVideoId,
        code,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
      });

      if (stderr.trim()) {
        console.log("[youtube-comments][ytdlp] stderr output start");
        console.log(stderr);
        console.log("[youtube-comments][ytdlp] stderr output end");
      }

      if (code !== 0) {
        reject(
          new Error(
            `yt-dlp failed with code ${code}: ${stderr || stdout || "no output"}`,
          ),
        );
        return;
      }

      const candidateJson = extractJsonObject(stdout);

      console.log("[youtube-comments][ytdlp] extracted stdout candidate", {
        youtubeVideoId,
        hasCandidateJson: Boolean(candidateJson),
        stdoutPreview: stdout.slice(0, 400),
        stderrPreview: stderr.slice(0, 400),
      });

      if (!candidateJson) {
        reject(
          new Error(
            `yt-dlp returned no JSON. stdout: ${stdout.slice(0, 400)} stderr: ${stderr.slice(0, 400)}`,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(candidateJson) as {
          title?: unknown;
          uploader?: unknown;
          thumbnail?: unknown;
          comments?: unknown;
        };

        console.log("[youtube-comments][ytdlp] JSON keys", {
          youtubeVideoId,
          keys: Object.keys(parsed),
          hasCommentsArray: Array.isArray(parsed.comments),
          topLevelCommentsCount: Array.isArray(parsed.comments)
            ? parsed.comments.length
            : 0,
        });

        const comments = parsed.comments;
        if (comments != null && !Array.isArray(comments)) {
          reject(new Error("Invalid comments payload"));
          return;
        }

        const normalized: YoutubeVideoPayload = {
          videoId: youtubeVideoId,
          title: typeof parsed.title === "string" ? parsed.title : undefined,
          uploader:
            typeof parsed.uploader === "string" ? parsed.uploader : undefined,
          thumbnail:
            typeof parsed.thumbnail === "string" ? parsed.thumbnail : undefined,
          comments: comments ?? [],
        };

        console.log("[youtube-comments][ytdlp] parsed output", {
          youtubeVideoId,
          title: normalized.title,
          uploader: normalized.uploader,
          commentsCount: normalized.comments.length,
        });

        if (normalized.comments.length > 0) {
          const firstComment = normalized.comments[0] as Record<
            string,
            unknown
          >;
          console.log("[youtube-comments][ytdlp] first comment preview", {
            youtubeVideoId,
            id: firstComment.id,
            author: firstComment.author,
            text:
              typeof firstComment.text === "string"
                ? firstComment.text.slice(0, 120)
                : "(no text field)",
            parent: firstComment.parent,
            repliesCount: Array.isArray(firstComment.replies)
              ? firstComment.replies.length
              : 0,
          });
        }

        resolve(normalized);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse yt-dlp JSON output: ${error instanceof Error ? error.message : "Unknown parse error"}. stdout: ${stdout.slice(0, 400)} stderr: ${stderr.slice(0, 400)}`,
          ),
        );
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      console.error("[youtube-comments][ytdlp] process spawn failed", {
        youtubeVideoId,
        ytDlpCommand,
        error: error.message,
      });
      reject(
        new Error(
          `Failed to spawn yt-dlp for comments sync using "${ytDlpCommand}": ${error.message}`,
        ),
      );
    });
  });
}
