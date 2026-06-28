"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MessageSquareText,
  PlaySquare,
  RefreshCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/dashboard/status-badge";

type Status =
  | "all"
  | "needs_reply"
  | "ai_ready"
  | "waiting_review"
  | "approved"
  | "posted"
  | "ignored";

type VideoCard = {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  uploadDate: string | null;
  duration: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

type CommentRecord = {
  id: string;
  authorName: string | null;
  authorIsUploader: boolean;
  commentText: string;
  likeCount: number;
  publishedAt: string | null;
  status: Exclude<Status, "all">;
  intent: string | null;
  sentiment: string | null;
  priority: string | null;
  confidence: number | null;
  aiReply: string | null;
  video: {
    id: string;
    title: string;
    videoId: string;
    thumbnailUrl: string | null;
  };
};

type InboxResponse = {
  counts: Record<Status, number>;
  comments: CommentRecord[];
};

const statusTabs: Array<{ key: Status; label: string }> = [
  { key: "all", label: "Inbox" },
  { key: "needs_reply", label: "Needs Reply" },
  { key: "ai_ready", label: "AI Ready" },
  { key: "waiting_review", label: "Waiting Review" },
  { key: "approved", label: "Approved" },
  { key: "posted", label: "Replied" },
  { key: "ignored", label: "Ignored" },
];

function formatRelativeDate(value: string | null) {
  if (!value) {
    return "Unknown time";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatUploadDate(value: string | null) {
  if (!value) {
    return "Unknown upload date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown upload date";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function toneForStatus(status: Exclude<Status, "all">) {
  if (status === "approved" || status === "posted") {
    return "success" as const;
  }

  if (status === "needs_reply" || status === "waiting_review") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function formatCompactNumber(value: number | null) {
  if (value == null) {
    return "0";
  }

  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={["animate-pulse rounded bg-gray-100", className].join(" ")}
    />
  );
}

function VideoCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
      <SkeletonBlock className="aspect-video w-full rounded-none" />
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-4/5" />
          <SkeletonBlock className="h-5 w-3/5" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gray-50 px-4 py-3">
            <SkeletonBlock className="h-3 w-14" />
            <SkeletonBlock className="mt-3 h-7 w-16" />
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-3">
            <SkeletonBlock className="h-3 w-18" />
            <SkeletonBlock className="mt-3 h-7 w-14" />
          </div>
        </div>
        <SkeletonBlock className="h-11 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function ActiveVideoSkeleton() {
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_340px]">
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
        <SkeletonBlock className="aspect-16/8 w-full rounded-none" />
      </div>
      <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-5">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="mt-4 h-7 w-4/5" />
        <SkeletonBlock className="mt-2 h-7 w-3/5" />
        <SkeletonBlock className="mt-4 h-4 w-full" />
        <SkeletonBlock className="mt-2 h-4 w-5/6" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <SkeletonBlock className="h-3 w-14" />
            <SkeletonBlock className="mt-3 h-6 w-16" />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <SkeletonBlock className="h-3 w-18" />
            <SkeletonBlock className="mt-3 h-6 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewPaneSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <SkeletonBlock className="h-7 w-24 rounded-full" />
          <SkeletonBlock className="h-7 w-28 rounded-full" />
        </div>
        <SkeletonBlock className="h-4 w-36" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="mt-4 h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-4/5" />
            <SkeletonBlock className="mt-4 h-3 w-2/3" />
          </div>
          <div>
            <SkeletonBlock className="h-5 w-28" />
            <SkeletonBlock className="mt-2 h-4 w-56" />
            <SkeletonBlock className="mt-3 h-56 w-full rounded-2xl" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonBlock className="mt-4 h-5 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-2/3" />
            <SkeletonBlock className="mt-4 h-4 w-1/2" />
            <SkeletonBlock className="mt-2 h-4 w-1/2" />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <SkeletonBlock className="h-3 w-16" />
            <div className="mt-4 space-y-2">
              <SkeletonBlock className="h-10 w-full rounded-xl" />
              <SkeletonBlock className="h-10 w-full rounded-xl" />
              <SkeletonBlock className="h-10 w-full rounded-xl" />
              <SkeletonBlock className="h-10 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueSnapshotSkeleton() {
  return (
    <div className="mt-4 space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-2xl bg-gray-50 px-4 py-3">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

function formatErrorMessage(error: string) {
  const trimmed = error.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    return {
      title: "AI analysis limit reached",
      body: "The AI provider is temporarily rate-limited right now. Your saved comments are still available, but analysis and draft generation may need a short retry.",
      hint: "Wait a few seconds, then try Analyze queue again.",
    };
  }

  if (lower.includes("failed to sync comments")) {
    return {
      title: "Could not fetch fresh YouTube comments",
      body: "We could not sync new comments from YouTube right now. Existing comments already saved in the workspace can still be reviewed.",
      hint: "Try Fetch comments again in a moment.",
    };
  }

  if (lower.includes("failed to load comments inbox")) {
    return {
      title: "Could not load this inbox",
      body: "The comments for this video could not be loaded right now.",
      hint: "Try refreshing the inbox or reopen the video card.",
    };
  }

  if (lower.includes("failed to load videos")) {
    return {
      title: "Could not load videos",
      body: "The video library is unavailable right now.",
      hint: "Refresh the page or try again in a moment.",
    };
  }

  return {
    title: "Something went wrong",
    body: trimmed,
    hint: "Try again in a moment.",
  };
}

export function CommentsInboxManager() {
  const [status, setStatus] = useState<Status>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [videos, setVideos] = useState<VideoCard[] | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isVideoPanelOpen, setIsVideoPanelOpen] = useState(false);
  const [data, setData] = useState<InboxResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftReplyById, setDraftReplyById] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadVideos() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/youtube/videos");
      const payload = (await response.json()) as {
        videos?: VideoCard[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load videos.");
      }

      const nextVideos = payload.videos ?? [];
      setVideos(nextVideos);

      if (!nextVideos.length) {
        setSelectedVideoId(null);
        setIsVideoPanelOpen(false);
        setData({
          counts: {
            all: 0,
            needs_reply: 0,
            ai_ready: 0,
            waiting_review: 0,
            approved: 0,
            posted: 0,
            ignored: 0,
          },
          comments: [],
        });
        return;
      }

      if (
        selectedVideoId &&
        nextVideos.some((video) => video.id === selectedVideoId)
      ) {
        return;
      }

      setSelectedVideoId(nextVideos[0]?.id ?? null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load videos.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadInboxForVideo(videoId: string, nextStatus = status) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (nextStatus !== "all") {
        params.set("status", nextStatus);
      }
      params.set("videoId", videoId);
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }

      const response = await fetch(
        `/api/youtube/comments?${params.toString()}`,
      );
      const payload = (await response.json()) as InboxResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load comments inbox.");
      }

      setData(payload);
      setSelectedId((current) => {
        if (
          current &&
          payload.comments.some((comment) => comment.id === current)
        ) {
          return current;
        }

        return payload.comments[0]?.id ?? null;
      });
      setDraftReplyById((current) => {
        const next = { ...current };
        for (const comment of payload.comments) {
          if (!(comment.id in next)) {
            next[comment.id] = comment.aiReply ?? "";
          }
        }
        return next;
      });
      setIsVideoPanelOpen(true);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load comments inbox.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function syncAndLoadInbox(
    videoId: string,
    nextStatus = status,
    videoOverride?: VideoCard,
  ) {
    const selectedVideo =
      videoOverride ?? videos?.find((video) => video.id === videoId);

    if (!selectedVideo) {
      setIsVideoPanelOpen(true);
      await loadInboxForVideo(videoId, nextStatus);
      return;
    }

    setBusy(`sync:${videoId}`);
    setError(null);

    try {
      const syncResponse = await fetch("/api/youtube/comments/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          youtubeVideoId: selectedVideo.youtubeVideoId,
          autoAnalyze: true,
        }),
      });
      const syncPayload = (await syncResponse.json()) as { error?: string };

      if (!syncResponse.ok) {
        throw new Error(syncPayload.error ?? "Failed to sync comments.");
      }

      await loadInboxForVideo(videoId, nextStatus);
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Failed to sync comments.",
      );
    } finally {
      setBusy(null);
    }
  }

  const selectedComment = useMemo(
    () => data?.comments.find((comment) => comment.id === selectedId) ?? null,
    [data?.comments, selectedId],
  );

  const selectedVideo = useMemo(
    () => videos?.find((video) => video.id === selectedVideoId) ?? null,
    [videos, selectedVideoId],
  );

  const draftReply = selectedComment
    ? (draftReplyById[selectedComment.id] ?? selectedComment.aiReply ?? "")
    : "";

  const totalComments = data?.counts.all ?? 0;
  const readyToReview =
    (data?.counts.ai_ready ?? 0) + (data?.counts.waiting_review ?? 0);
  const readyToSend = data?.counts.approved ?? 0;
  const formattedError = error ? formatErrorMessage(error) : null;

  async function updateStatus(nextStatus: Exclude<Status, "all">) {
    if (!selectedComment) {
      return;
    }

    setBusy(`status:${nextStatus}`);
    setError(null);

    try {
      const response = await fetch(
        `/api/youtube/comments/${selectedComment.id}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
            aiReply: draftReply,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update status.");
      }

      if (selectedVideoId) {
        await loadInboxForVideo(selectedVideoId);
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update comment.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function sendReply() {
    if (!selectedComment || !selectedVideoId) {
      return;
    }

    setBusy("send");
    setError(null);

    try {
      await updateStatus("approved");
      const response = await fetch(
        `/api/youtube/comments/${selectedComment.id}/send`,
        {
          method: "POST",
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to send reply.");
      }

      await loadInboxForVideo(selectedVideoId);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send reply.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function analyzeQueue() {
    if (!selectedVideoId) {
      return;
    }

    setBusy("analyze");
    setError(null);

    try {
      const response = await fetch("/api/youtube/comments/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 15 }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to analyze comments.");
      }

      await loadInboxForVideo(selectedVideoId);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to analyze comments.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!videos && !loading && !error) {
    void loadVideos();
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 sm:p-7">
        <div className="absolute inset-x-0 top-0 h-28 bg-linear-to-r from-[#6c47ff]/8 via-white to-transparent" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 sm:text-[2rem]">
              One video at a time in a cleaner, dedicated reply workspace.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
              Start from your video library, open the inbox for one video, then
              sync comments, analyze drafts, and approve replies without losing
              context.
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto lg:min-w-[420px]">
            <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 backdrop-blur lg:min-w-[132px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 sm:text-[11px]">
                Inbox total
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {totalComments}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 backdrop-blur lg:min-w-[132px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 sm:text-[11px]">
                Needs review
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {readyToReview}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 backdrop-blur lg:min-w-[132px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 sm:text-[11px]">
                Ready to send
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {readyToSend}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!isVideoPanelOpen ? (
        <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Video library
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-gray-900">
                Pick the video you want to manage first.
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Opening a card takes you into a dedicated inbox panel for that
                video, where you can fetch comments and review the queue.
              </p>
            </div>
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => void loadVideos()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refresh videos
            </Button>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {loading && !videos?.length ? (
              Array.from({ length: 6 }).map((_, index) => (
                <VideoCardSkeleton key={index} />
              ))
            ) : videos?.length ? (
              videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => {
                    setSelectedVideoId(video.id);
                    setSelectedId(null);
                    setSearchQuery("");
                    setStatus("all");
                    setIsVideoPanelOpen(true);
                    void loadInboxForVideo(video.id, "all");
                  }}
                  className="group overflow-hidden rounded-3xl border border-gray-200 bg-white text-left transition-all hover:-translate-y-1 hover:border-[#6c47ff]/20 hover:shadow-[0_20px_50px_-24px_rgba(17,24,39,0.28)]"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                    {video.thumbnailUrl ? (
                      <Image
                        src={video.thumbnailUrl}
                        alt={video.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        sizes="(max-width: 1280px) 50vw, 33vw"
                        unoptimized
                      />
                    ) : null}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent px-5 py-4 text-white">
                      <p className="text-sm">
                        {formatUploadDate(video.uploadDate)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div>
                      <p className="line-clamp-2 text-[1.05rem] font-semibold leading-8 text-gray-900">
                        {video.title}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400">
                          Views
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900">
                          {formatCompactNumber(video.viewCount)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400">
                          Comments
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900">
                          {formatCompactNumber(video.commentCount)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-[#6c47ff]/12 bg-[#6c47ff]/6 px-4 py-3 text-sm text-gray-700">
                      <span>Open dedicated inbox</span>
                      <ChevronRight className="h-4 w-4 text-[#6c47ff]" />
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="md:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-500 shadow-sm">
                  <PlaySquare className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-medium text-gray-900">
                  {loading ? "Loading videos..." : "No videos found yet"}
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  {loading
                    ? "Pulling your latest YouTube catalog."
                    : "Refresh once your YouTube catalog is connected and synced."}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-7">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsVideoPanelOpen(false)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to videos
                  </button>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#6c47ff]/15 bg-[#6c47ff]/8 px-3 py-1 text-xs font-medium text-[#6c47ff]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Dedicated inbox panel
                  </span>
                </div>

                {loading && !selectedVideo ? (
                  <ActiveVideoSkeleton />
                ) : selectedVideo ? (
                  <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_340px]">
                    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
                      <div className="relative aspect-[16/8] w-full bg-gray-100">
                        {selectedVideo.thumbnailUrl ? (
                          <Image
                            src={selectedVideo.thumbnailUrl}
                            alt={selectedVideo.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 1024px) 100vw, 60vw"
                            unoptimized
                          />
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-5 py-4 text-white">
                          <p className="text-sm">
                            {formatUploadDate(selectedVideo.uploadDate)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                        Active video
                      </p>
                      <h3 className="mt-3 text-xl font-semibold leading-8 text-gray-900">
                        {selectedVideo.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-gray-600">
                        This panel stays scoped to one video so syncing,
                        filtering, analysis, and review remain easier to manage.
                      </p>

                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                            Views
                          </p>
                          <p className="mt-2 text-xl font-semibold text-gray-900">
                            {formatCompactNumber(selectedVideo.viewCount)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                            Comments
                          </p>
                          <p className="mt-2 text-xl font-semibold text-gray-900">
                            {formatCompactNumber(selectedVideo.commentCount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-3xl border border-gray-200 bg-white p-6">
              <div className="flex flex-wrap gap-2">
                {statusTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setStatus(tab.key);
                      if (selectedVideoId) {
                        void loadInboxForVideo(selectedVideoId, tab.key);
                      }
                    }}
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
                      status === tab.key
                        ? "border-[#6c47ff]/30 bg-[#6c47ff]/10 text-[#6c47ff]"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900",
                    ].join(" ")}
                  >
                    <span>{tab.label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-500">
                      {data?.counts?.[tab.key] ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-3 lg:flex-row">
                <label className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search author or comment text"
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-[#6c47ff] focus:bg-white"
                  />
                </label>
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => {
                    if (selectedVideoId) {
                      void loadInboxForVideo(selectedVideoId);
                    }
                  }}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Refresh inbox
                </Button>
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => {
                    if (selectedVideoId) {
                      void syncAndLoadInbox(selectedVideoId, status);
                    }
                  }}
                  disabled={
                    busy === `sync:${selectedVideoId}` || !selectedVideoId
                  }
                >
                  {busy === `sync:${selectedVideoId}` ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Fetch comments
                </Button>
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => void analyzeQueue()}
                  disabled={busy === "analyze" || !selectedVideoId}
                >
                  {busy === "analyze" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Analyze queue
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Queue snapshot
              </p>
              {loading ? (
                <QueueSnapshotSkeleton />
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                      Inbox total
                    </p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">
                      {totalComments}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                      Needs review
                    </p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">
                      {readyToReview}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                      Approved
                    </p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">
                      {readyToSend}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {formattedError ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-800">
              <p className="text-sm font-semibold">{formattedError.title}</p>
              <p className="mt-2 text-sm leading-6 text-red-700">
                {formattedError.body}
              </p>
              <p className="mt-3 text-xs font-medium text-red-600">
                {formattedError.hint}
              </p>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="rounded-[2rem] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,249,255,0.9))] p-3 shadow-[0_28px_60px_-42px_rgba(67,73,120,0.28)]">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 pb-3 pt-1">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Comment queue
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {data?.comments.length ?? 0} visible in this filtered inbox
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-[1.5rem] border border-gray-200 p-4"
                    >
                      <div className="h-4 w-28 rounded bg-gray-100" />
                      <div className="mt-3 h-3 w-full rounded bg-gray-100" />
                      <div className="mt-2 h-3 w-4/5 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : data?.comments.length ? (
                <div className="space-y-2 p-3">
                  {data.comments.map((comment) => (
                    <button
                      key={comment.id}
                      type="button"
                      onClick={() => setSelectedId(comment.id)}
                      className={[
                        "w-full rounded-[1.65rem] border px-4 py-4 text-left transition-all duration-300",
                        selectedId === comment.id
                          ? "border-[#6c47ff]/28 bg-[linear-gradient(180deg,rgba(108,71,255,0.09),rgba(108,71,255,0.04))] shadow-[0_20px_42px_-30px_rgba(108,71,255,0.45)]"
                          : "border-gray-200 bg-white/92 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_18px_36px_-30px_rgba(67,73,120,0.24)]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold tracking-[-0.02em] text-gray-900">
                            {comment.authorName ?? "Unknown author"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatRelativeDate(comment.publishedAt)}
                          </p>
                        </div>
                        <StatusBadge
                          label={comment.status.replaceAll("_", " ")}
                          tone={toneForStatus(comment.status)}
                        />
                      </div>
                      <p className="mt-4 line-clamp-3 text-[0.96rem] leading-7 text-gray-700">
                        {comment.commentText}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>{comment.likeCount} likes</span>
                        {comment.priority ? (
                          <>
                            <span>•</span>
                            <span>{comment.priority} priority</span>
                          </>
                        ) : null}
                        {comment.confidence != null ? (
                          <>
                            <span>•</span>
                            <span>
                              {Math.round(comment.confidence * 100)}% confidence
                            </span>
                          </>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                    <MessageSquareText className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-gray-900">
                    No comments match this view
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    Try another status tab, clear the search, or fetch comments
                    again for this video.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-[2rem] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,249,255,0.92))] p-6 shadow-[0_32px_70px_-46px_rgba(67,73,120,0.3)] sm:p-7">
              {loading ? (
                <ReviewPaneSkeleton />
              ) : selectedComment ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={selectedComment.status.replaceAll("_", " ")}
                        tone={toneForStatus(selectedComment.status)}
                      />
                      {selectedComment.priority ? (
                        <StatusBadge
                          label={`${selectedComment.priority} priority`}
                          tone="neutral"
                        />
                      ) : null}
                      {selectedComment.confidence != null ? (
                        <StatusBadge
                          label={`${Math.round(selectedComment.confidence * 100)}% confidence`}
                          tone="success"
                        />
                      ) : null}
                    </div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">
                      Review before sending
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-[1.7rem] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(249,250,255,0.95),rgba(244,246,255,0.84))] p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                        Incoming comment
                      </p>
                      <p className="mt-4 text-[1.02rem] leading-8 text-gray-800">
                        {selectedComment.commentText}
                      </p>
                      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">
                          {selectedComment.authorName ?? "Unknown author"}
                        </span>
                        <span>•</span>
                        <span>
                          {formatRelativeDate(selectedComment.publishedAt)}
                        </span>
                        <span>•</span>
                        <span>{selectedComment.likeCount} likes</span>
                        {selectedComment.authorIsUploader ? (
                          <>
                            <span>•</span>
                            <span>Uploader</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-[1.7rem] border border-gray-200/80 bg-white/90 p-5 shadow-[0_18px_38px_-32px_rgba(67,73,120,0.18)]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tracking-[-0.02em] text-gray-900">
                            Reply draft
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            Keep it concise, natural, and grounded in the
                            creator&apos;s tone.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-full border-gray-200 bg-white/90 px-4 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() =>
                            setDetailsPanelOpen((current) => !current)
                          }
                        >
                          {detailsPanelOpen
                            ? "Hide context & actions"
                            : "Show context & actions"}
                        </Button>
                      </div>
                      <textarea
                        value={draftReply}
                        onChange={(event) => {
                          if (!selectedComment) {
                            return;
                          }

                          const value = event.target.value;
                          setDraftReplyById((current) => ({
                            ...current,
                            [selectedComment.id]: value,
                          }));
                        }}
                        rows={8}
                        className="mt-4 min-h-[260px] w-full rounded-[1.4rem] border border-gray-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,249,255,0.92))] px-4 py-4 text-sm leading-7 text-gray-700 outline-none transition-colors focus:border-[#6c47ff]"
                        placeholder="AI reply will appear here after analysis."
                      />
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {draftReply.trim()
                            ? `${draftReply.trim().length} characters`
                            : "No draft yet"}
                        </span>
                        <span>
                          {selectedComment.aiReply
                            ? "AI draft loaded"
                            : "Waiting for analysis"}
                        </span>
                      </div>
                    </div>

                    {detailsPanelOpen ? (
                      <div className="rounded-[1.8rem] border border-gray-200/80 bg-[linear-gradient(180deg,rgba(246,247,255,0.96),rgba(241,243,255,0.9))] p-5 shadow-[0_18px_38px_-32px_rgba(67,73,120,0.18)]">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 pb-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                              Context & actions
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              Extra review details and quick decisions live
                              here.
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-5">
                          <div className="rounded-[1.5rem] border border-gray-200/80 bg-white/80 p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                              Context
                            </p>
                            <p className="mt-4 text-base font-semibold leading-7 text-gray-900">
                              {selectedComment.video.title}
                            </p>
                            <p className="mt-2 text-xs text-gray-500">
                              Video ID: {selectedComment.video.videoId}
                            </p>
                            <div className="mt-5 space-y-3 text-sm text-gray-600">
                              {selectedComment.intent ? (
                                <p>
                                  Intent:{" "}
                                  <span className="font-semibold text-gray-900">
                                    {selectedComment.intent}
                                  </span>
                                </p>
                              ) : null}
                              {selectedComment.sentiment ? (
                                <p>
                                  Sentiment:{" "}
                                  <span className="font-semibold text-gray-900">
                                    {selectedComment.sentiment}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="rounded-[1.5rem] border border-gray-200/80 bg-white/90 p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                              Actions
                            </p>
                            <div className="mt-4 flex flex-col gap-2.5">
                              <Button
                                className="h-11 rounded-full bg-[#6c47ff] text-white shadow-[0_14px_30px_-18px_rgba(108,71,255,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5b39d9]"
                                onClick={() => void sendReply()}
                                disabled={busy === "send" || !draftReply.trim()}
                              >
                                Send to YouTube
                              </Button>
                              <Button
                                variant="outline"
                                className="h-11 rounded-full bg-white/85"
                                onClick={() => void updateStatus("approved")}
                                disabled={busy === "status:approved"}
                              >
                                Approve only
                              </Button>
                              <Button
                                variant="outline"
                                className="h-11 rounded-full bg-white/85"
                                onClick={() => void updateStatus("ai_ready")}
                                disabled={busy === "status:ai_ready"}
                              >
                                Save draft
                              </Button>
                              <Button
                                variant="outline"
                                className="h-11 rounded-full bg-white/85"
                                onClick={() => void updateStatus("ignored")}
                                disabled={busy === "status:ignored"}
                              >
                                Ignore comment
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-105 flex-col items-center justify-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                    <MessageSquareText className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-gray-900">
                    Select a comment to review it
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                    The right side becomes your review workspace: inspect the
                    comment, edit the draft, then approve or send.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
