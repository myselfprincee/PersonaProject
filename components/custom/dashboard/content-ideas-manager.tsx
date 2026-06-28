"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Lightbulb, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatWorkspace } from "@/components/custom/dashboard/chat-workspace";
import { StatusBadge } from "@/components/custom/dashboard/status-badge";

type ContentIdeasData = {
  connection: {
    id: string;
    channelId: string;
    channelName: string;
  } | null;
  summary: {
    totalVideos: number;
    detailedVideos: number;
    analyzedVideos: number;
  } | null;
  activeRun: {
    id: string;
    status: string;
    stage: string;
    progress_percent: number;
    total_videos: number;
    processed_videos: number;
    failed_videos: number;
    error_summary?: {
      code?: string | null;
      message?: string | null;
      retryAfterSeconds?: number | null;
    } | null;
  } | null;
  recentInsights: Array<{
    videoId: string;
    title: string;
    summary: string;
    hook: string;
    thumbnailDescription: string;
    updatedAt: string;
  }>;
  geminiUsage?: {
    dayKey: string;
    used: number;
    limit: number;
    configuredKeys?: number;
    perKey?: Array<{
      name: string;
      used: number;
      limit: number;
    }>;
  };
};

function getStagePresentation(stage: string) {
  switch (stage) {
    case "pending":
      return {
        label: "Waiting to start",
        detail: "Persona is ready to begin catalog analysis.",
      };
    case "downloading_transcript":
      return {
        label: "Downloading transcripts",
        detail: "Pulling transcript files for each video into the pipeline.",
      };
    case "uploading_transcript":
      return {
        label: "Storing transcripts",
        detail:
          "Saving transcript files into storage under the new channel/transcripts path.",
      };
    case "collecting_video_details":
      return {
        label: "Collecting video details",
        detail:
          "Fetching title, thumbnail, chapters, tags, and heatmap metadata for stronger analysis.",
      };
    case "generating_video_insights":
      return {
        label: "Generating insights",
        detail:
          "Reading the full transcript plus metadata to store summaries, hooks, and thumbnail descriptions.",
      };
    case "completed":
      return {
        label: "Ready",
        detail:
          "Video insights are stored and ready to power better content ideas.",
      };
    case "failed":
      return {
        label: "Needs attention",
        detail: "One or more videos failed during analysis.",
      };
    default:
      return {
        label: stage.replace(/_/g, " "),
        detail: "Persona is moving through the analysis pipeline.",
      };
  }
}

export default function ContentIdeasManager() {
  const [insightsExpanded, setInsightsExpanded] = useState(false);
  const [data, setData] = useState<ContentIdeasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [regeneratingChunks, setRegeneratingChunks] = useState(false);
  const [pendingRun, setPendingRun] =
    useState<ContentIdeasData["activeRun"]>(null);
  const [error, setError] = useState<string | null>(null);
  const drainingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/content-ideas");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Failed to load content ideas status.",
        );
      }

      setData(payload);
      setPendingRun(null);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load content ideas status.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const drainPipeline = useCallback(async (limit = 3) => {
    if (drainingRef.current) {
      return;
    }

    drainingRef.current = true;

    try {
      await fetch("/api/ingestion/workers/drain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit }),
      });
    } finally {
      drainingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    if (
      !data?.activeRun?.id ||
      !["queued", "running"].includes(data.activeRun.status)
    ) {
      return;
    }

    void drainPipeline();

    const interval = window.setInterval(() => {
      void (async () => {
        await drainPipeline();
        await load();
      })();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [data?.activeRun?.id, data?.activeRun?.status, drainPipeline, load]);

  async function startAnalysis() {
    setStarting(true);
    setError(null);

    try {
      const response = await fetch("/api/content-ideas", {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to start analysis pipeline.");
      }

      const run = (payload.run ?? null) as ContentIdeasData["activeRun"];

      if (run) {
        setPendingRun(run);
      }

      await drainPipeline(4);
      await load();
    } catch (startError) {
      setPendingRun(null);
      setError(
        startError instanceof Error
          ? startError.message
          : "Failed to start analysis pipeline.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function resumeAnalysis() {
    if (!data?.activeRun?.id) {
      return;
    }

    setResuming(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ingestion/runs/${data.activeRun.id}/resume`,
        {
          method: "POST",
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to resume analysis pipeline.");
      }

      const run = (payload.run ??
        payload ??
        null) as ContentIdeasData["activeRun"];

      if (run && "id" in run) {
        setPendingRun(run);
      }

      await drainPipeline(5);
      await load();
    } catch (resumeError) {
      setPendingRun(null);
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : "Failed to resume analysis pipeline.",
      );
    } finally {
      setResuming(false);
    }
  }

  async function repairAnalysis() {
    if (!data?.activeRun?.id) {
      return;
    }

    setRepairing(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ingestion/runs/${data.activeRun.id}/repair`,
        {
          method: "POST",
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to repair analysis pipeline.");
      }

      const run = (payload.run ?? null) as ContentIdeasData["activeRun"];

      if (run) {
        setPendingRun(run);
      }

      await drainPipeline(5);
      await load();
    } catch (repairError) {
      setPendingRun(null);
      setError(
        repairError instanceof Error
          ? repairError.message
          : "Failed to repair analysis pipeline.",
      );
    } finally {
      setRepairing(false);
    }
  }

  async function backfillEmbeddings() {
    setBackfilling(true);
    setError(null);

    try {
      const response = await fetch("/api/content-ideas/backfill-embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Failed to backfill missing embeddings.",
        );
      }

      await load();
    } catch (backfillError) {
      setError(
        backfillError instanceof Error
          ? backfillError.message
          : "Failed to backfill missing embeddings.",
      );
    } finally {
      setBackfilling(false);
    }
  }

  async function regenerateChunkEmbeddings() {
    setRegeneratingChunks(true);
    setError(null);

    try {
      const response = await fetch("/api/video-chunks/regenerate-embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 30 }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Failed to regenerate chunk embeddings.",
        );
      }

      await load();
    } catch (regenerateError) {
      setError(
        regenerateError instanceof Error
          ? regenerateError.message
          : "Failed to regenerate chunk embeddings.",
      );
    } finally {
      setRegeneratingChunks(false);
    }
  }

  const activeRun = data?.activeRun ?? pendingRun;
  const activeStage = activeRun ? getStagePresentation(activeRun.stage) : null;
  const geminiUsage = data?.geminiUsage;
  const isQuotaPaused =
    activeRun?.status === "paused" &&
    activeRun.stage === "generating_video_insights" &&
    activeRun.error_summary?.code === "gemini_daily_limit_reached";
  const isStalledRun =
    activeRun?.error_summary?.code === "pipeline_stalled_no_open_tasks";
  const quotaMessage = activeRun?.error_summary?.message ?? null;
  const retryAfterSeconds = activeRun?.error_summary?.retryAfterSeconds ?? null;
  const prettyQuotaMessage = useMemo(() => {
    if (!quotaMessage) {
      return null;
    }

    if (quotaMessage.includes("RESOURCE_EXHAUSTED")) {
      return "Gemini free-tier quota was exhausted while generating video insights.";
    }

    return quotaMessage;
  }, [quotaMessage]);

  let approvalCopy =
    "Collect video details first so Persona can produce stronger, more precise content ideas.";

  if (data?.summary?.analyzedVideos && data.summary.analyzedVideos > 0) {
    approvalCopy =
      "Persona can refresh your analysis with the latest videos and improve idea quality using transcript, thumbnail, chapter, and heatmap context.";
  } else if (data?.summary) {
    approvalCopy =
      "To give precise content ideas, Persona should first collect richer video details across your catalog, then analyze every video with the full transcript and metadata.";
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading content idea workspace...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data?.connection) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Connect YouTube first so Persona can inspect your videos before
        generating content ideas.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={data.connection.channelName} tone="neutral" />
            {isQuotaPaused ? (
              <StatusBadge label="Analysis paused" tone="warning" />
            ) : activeRun ? (
              <StatusBadge label="Analysis in progress" tone="warning" />
            ) : data.summary?.analyzedVideos ? (
              <StatusBadge label="Insights available" tone="success" />
            ) : (
              <StatusBadge label="Ready to analyze" tone="neutral" />
            )}
          </div>

          <h2 className="mt-5 text-2xl font-semibold text-gray-900">
            Want sharper content ideas? Let Persona collect the full context
            first.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600 sm:text-base">
            {approvalCopy}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">
                Whole transcript
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Summaries and hook extraction work best when Persona reads the
                full stored transcript, not a short excerpt.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Video details</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Titles, thumbnail, chapters, tags, and performance signals help
                Persona find better idea patterns.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">
                Heatmap-aware hooks
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Heatmap and transcript context together help Persona reason
                about what likely grabbed attention early.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              className="rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]"
              onClick={() => void startAnalysis()}
              disabled={
                starting ||
                resuming ||
                repairing ||
                backfilling ||
                regeneratingChunks ||
                Boolean(activeRun)
              }
            >
              {activeRun
                ? "Analysis already running"
                : starting
                  ? "Starting analysis..."
                  : "Yes, collect video details and analyze everything"}
            </Button>

            {activeRun ? (
              <>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => void drainPipeline(5)}
                  disabled={
                    starting ||
                    resuming ||
                    repairing ||
                    backfilling ||
                    regeneratingChunks ||
                    isQuotaPaused
                  }
                >
                  Run now
                </Button>
                {isQuotaPaused ? (
                  <Button
                    variant="outline"
                    className="rounded-xl border-[#6c47ff]/30 bg-white text-[#6c47ff]"
                    onClick={() => void resumeAnalysis()}
                    disabled={
                      resuming ||
                      starting ||
                      repairing ||
                      backfilling ||
                      regeneratingChunks
                    }
                  >
                    {resuming ? "Resuming analysis..." : "Resume analysis"}
                  </Button>
                ) : null}
                {isStalledRun ? (
                  <Button
                    variant="outline"
                    className="rounded-xl border-amber-300 bg-white text-amber-700"
                    onClick={() => void repairAnalysis()}
                    disabled={
                      repairing ||
                      starting ||
                      resuming ||
                      backfilling ||
                      regeneratingChunks
                    }
                  >
                    {repairing ? "Repairing analysis..." : "Repair analysis"}
                  </Button>
                ) : null}
              </>
            ) : null}

            {!activeRun && data.summary?.analyzedVideos ? (
              <Button
                variant="outline"
                className="rounded-xl border-[#6c47ff]/30 bg-white text-[#6c47ff]"
                onClick={() => void backfillEmbeddings()}
                disabled={
                  starting ||
                  resuming ||
                  repairing ||
                  backfilling ||
                  regeneratingChunks
                }
              >
                {backfilling
                  ? "Backfilling embeddings..."
                  : "Backfill embeddings"}
              </Button>
            ) : null}

            {!activeRun && data.summary?.analyzedVideos ? (
              <Button
                variant="outline"
                className="rounded-xl border-[#6c47ff]/30 bg-white text-[#6c47ff]"
                onClick={() => void regenerateChunkEmbeddings()}
                disabled={
                  starting ||
                  resuming ||
                  repairing ||
                  backfilling ||
                  regeneratingChunks
                }
              >
                {regeneratingChunks
                  ? "Regenerating chunk embeddings..."
                  : "Regenerate chunk embeddings"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <div className="rounded-3xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              <Video className="h-3.5 w-3.5 text-[#6c47ff]" />
              Catalog coverage
            </div>
            <p className="mt-4 text-3xl font-semibold text-gray-900">
              {data.summary?.totalVideos ?? 0}
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Videos currently available for analysis.
            </p>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              <BarChart3 className="h-3.5 w-3.5 text-[#6c47ff]" />
              Video details collected
            </div>
            <p className="mt-4 text-3xl font-semibold text-gray-900">
              {data.summary?.detailedVideos ?? 0}
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Videos with richer metadata ready for strategic analysis.
            </p>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              <Sparkles className="h-3.5 w-3.5 text-[#6c47ff]" />
              Stored insights
            </div>
            <p className="mt-4 text-3xl font-semibold text-gray-900">
              {data.summary?.analyzedVideos ?? 0}
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Videos already summarized into reusable content insight records.
            </p>
          </div>
        </div>
      </div>

      {activeRun && activeStage ? (
        <div
          className={
            isQuotaPaused
              ? "rounded-3xl border border-amber-200 bg-amber-50 p-5"
              : "rounded-3xl border border-[#6c47ff]/20 bg-[#6c47ff]/5 p-5"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {isQuotaPaused
                  ? "Analysis pipeline is paused"
                  : "Analysis pipeline is running"}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {isQuotaPaused
                  ? "Persona paused insight generation because the Gemini free-tier daily quota was reached."
                  : activeStage.detail}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge
                label={activeStage.label}
                tone={isQuotaPaused ? "warning" : "neutral"}
              />
              <StatusBadge
                label={`${Math.round(activeRun.progress_percent)}% successful`}
                tone={isQuotaPaused ? "warning" : "success"}
              />
            </div>
          </div>
          {isQuotaPaused ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-white/80 p-4 text-sm leading-6 text-amber-900">
              <p className="font-medium">Gemini quota pause</p>
              <p className="mt-1">
                {prettyQuotaMessage ??
                  "Gemini paused while generating insights for this run."}
              </p>
              {geminiUsage?.perKey?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {geminiUsage.perKey.map((key) => (
                    <StatusBadge
                      key={key.name}
                      label={`${key.name}: ${key.used}/${key.limit}`}
                      tone={key.used >= key.limit ? "warning" : "neutral"}
                    />
                  ))}
                </div>
              ) : null}
              {retryAfterSeconds ? (
                <p className="mt-1 text-amber-800">
                  Retry after approximately {retryAfterSeconds}s, or resume
                  tomorrow once quota resets.
                </p>
              ) : (
                <p className="mt-1 text-amber-800">
                  If you added more API keys, press Resume analysis now.
                  Otherwise, resume tomorrow once quota resets or upgrade to a
                  paid Gemini tier.
                </p>
              )}
            </div>
          ) : null}

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[#6c47ff] transition-all duration-500"
              style={{
                width: `${Math.max(
                  activeRun.progress_percent > 0
                    ? activeRun.progress_percent
                    : 0,
                  6,
                )}%`,
              }}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Current stage
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                {activeStage.label}
              </p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Total videos
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                {activeRun.total_videos}
              </p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Processed
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                {activeRun.processed_videos}
              </p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Failed
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                {activeRun.failed_videos}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="rounded-xl bg-white"
              onClick={() => void drainPipeline(5)}
              disabled={isQuotaPaused || resuming}
            >
              {isQuotaPaused ? "Quota pause active" : "Run next batch now"}
            </Button>
            {isQuotaPaused ? (
              <Button
                className="rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]"
                onClick={() => void resumeAnalysis()}
                disabled={resuming}
              >
                {resuming ? "Resuming analysis..." : "Resume analysis"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {data.summary?.analyzedVideos ? (
        <ChatWorkspace
          endpoint="/api/content-ideas/chat"
          modeLabel="Content Ideas"
          emptyTitle="Ask for your next high-leverage video ideas"
          emptyDescription="This workspace uses your analyzed catalog to suggest next video directions grounded in what you have already published."
          exampleQuestions={[
            "I want to make a Rust video",
            "What should I make after my best productivity videos?",
            "Give me 5 contrarian ideas based on my channel history",
          ]}
          sideTitle="How to use it"
          sideBody="Ask for angles, follow-up ideas, sequencing, or gaps in your catalog. This mode is optimized for strategic ideation grounded in analyzed video insights, not transcript timestamp lookup."
          followUpCopy={[
            "Follow-ups can refine or challenge the previous idea set.",
            "This mode should stay grounded in retrieved analyzed videos, not generic brainstorming.",
            "Use it to find repeated patterns, underused themes, and strong title directions.",
          ]}
          requireConnectionCheck={false}
          forceConnected
          layout="expanded"
        />
      ) : null}

      {data.recentInsights.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-[#6c47ff]" />
              <h3 className="text-lg font-semibold text-gray-900">
                Recent analyzed videos
              </h3>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full px-4"
              onClick={() => setInsightsExpanded((value) => !value)}
            >
              {insightsExpanded ? "Make smaller" : "Make bigger"}
            </Button>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {data.recentInsights.map((insight) => (
              <div
                key={insight.videoId}
                className={[
                  "rounded-3xl border border-gray-200 bg-white transition-all duration-300",
                  insightsExpanded ? "p-6" : "p-5",
                ].join(" ")}
              >
                <p
                  className={[
                    "font-semibold text-gray-900",
                    insightsExpanded ? "text-lg" : "line-clamp-2 text-base",
                  ].join(" ")}
                >
                  {insight.title}
                </p>
                <div
                  className={[
                    "mt-4 space-y-4 text-sm text-gray-600",
                    insightsExpanded ? "leading-6" : "leading-5.5",
                  ].join(" ")}
                >
                  <div>
                    <p className="font-medium text-gray-900">Summary</p>
                    <p
                      className={
                        insightsExpanded ? "mt-1" : "mt-1 line-clamp-4"
                      }
                    >
                      {insight.summary}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Hook signal</p>
                    <p
                      className={
                        insightsExpanded ? "mt-1" : "mt-1 line-clamp-3"
                      }
                    >
                      {insight.hook}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Thumbnail read</p>
                    <p
                      className={
                        insightsExpanded ? "mt-1" : "mt-1 line-clamp-3"
                      }
                    >
                      {insight.thumbnailDescription}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-gray-200 bg-white p-6 text-sm leading-6 text-gray-600">
          Once Persona finishes collecting video details and analyzing
          transcripts, this page will surface stored video insights that can
          power more precise content ideas.
        </div>
      )}
    </div>
  );
}
