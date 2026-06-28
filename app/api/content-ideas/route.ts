import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { listUserIngestionRuns } from "@/services/ingestion/progress-service";
import { createIngestionRunWithCatalogTask } from "@/services/ingestion/ingestion-orchestrator";
import { getYoutubeConnectionForUser } from "@/services/public-persona/public-persona.service";
import { getGeminiDailyUsageSnapshot } from "@/services/video-insights/video-insights.service";
import { countVideosMissingInsights } from "@/repositories/videos.repository";

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

function isOptionalSchemaError(error: PostgrestLikeError | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42703" ||
    error.code === "42P01" ||
    error.message?.includes("thumbnail_url") ||
    error.message?.includes("video_insights") ||
    false
  );
}

function pickActiveRun(
  runs: Awaited<ReturnType<typeof listUserIngestionRuns>>,
) {
  return (
    runs.find((run) => ["queued", "running", "paused"].includes(run.status)) ??
    null
  );
}

async function validateContentIdeasSchema() {
  console.log("[content-ideas] validating required schema");
  const supabase = createAdminClient();
  const checks = await Promise.all([
    supabase
      .from("ingestion_runs")
      .select("id", { head: true, count: "exact" }),
    supabase
      .from("pipeline_tasks")
      .select("id", { head: true, count: "exact" }),
    supabase
      .from("video_processing_states")
      .select("id", { head: true, count: "exact" }),
    supabase
      .from("video_insights")
      .select("video_id", { head: true, count: "exact" }),
    supabase
      .from("videos")
      .select("thumbnail_url", { head: true, count: "exact" }),
  ]);

  const failedCheck = checks.find((result) => result.error);

  if (!failedCheck?.error) {
    console.log("[content-ideas] schema validation passed");
    return;
  }

  const missingMessage = failedCheck.error.message ?? "Unknown schema error.";
  throw new Error(
    `Content ideas setup is incomplete in the database. Please run the latest Supabase migration before starting analysis. Details: ${missingMessage}`,
  );
}

export async function GET() {
  const { userId } = await auth();

  console.log("[content-ideas] GET start", { userId });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connection = await getYoutubeConnectionForUser(userId);

    if (!connection) {
      return NextResponse.json({
        connection: null,
        summary: null,
        activeRun: null,
        recentInsights: [],
      });
    }

    console.log("[content-ideas] found connection", {
      userId,
      youtubeConnectionId: connection.id,
      channelId: connection.channelId,
    });

    const supabase = createAdminClient();
    const [
      totalVideosResult,
      detailedVideosResult,
      analyzedVideosResult,
      recentInsightsResult,
      runs,
    ] = await Promise.all([
      supabase
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("youtube_connection_id", connection.id),
      supabase
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("youtube_connection_id", connection.id)
        .not("thumbnail_url", "is", null),
      supabase
        .from("video_insights")
        .select("video_id, videos!inner(id, youtube_connection_id)", {
          count: "exact",
          head: true,
        })
        .eq("videos.youtube_connection_id", connection.id),
      supabase
        .from("video_insights")
        .select(
          "video_id, summary, hook, thumbnail_description, updated_at, created_at, videos!inner(id, title, youtube_connection_id)",
        )
        .eq("videos.youtube_connection_id", connection.id)
        .order("updated_at", { ascending: false })
        .limit(6),
      listUserIngestionRuns(userId, 10),
    ]);

    if (totalVideosResult.error) {
      throw totalVideosResult.error;
    }

    if (
      detailedVideosResult.error &&
      !isOptionalSchemaError(detailedVideosResult.error)
    ) {
      throw detailedVideosResult.error;
    }

    if (
      analyzedVideosResult.error &&
      !isOptionalSchemaError(analyzedVideosResult.error)
    ) {
      throw analyzedVideosResult.error;
    }

    if (
      recentInsightsResult.error &&
      !isOptionalSchemaError(recentInsightsResult.error)
    ) {
      throw recentInsightsResult.error;
    }

    let recentInsightsRows: Array<Record<string, unknown>> | null =
      recentInsightsResult.error
        ? null
        : ((recentInsightsResult.data as Array<
            Record<string, unknown>
          > | null) ?? null);

    if (
      recentInsightsResult.error &&
      isOptionalSchemaError(recentInsightsResult.error)
    ) {
      const fallbackRecentInsightsResult = await supabase
        .from("video_insights")
        .select(
          "video_id, summary, hook, thumbnail_description, created_at, videos!inner(id, title, youtube_connection_id)",
        )
        .eq("videos.youtube_connection_id", connection.id)
        .order("created_at", { ascending: false })
        .limit(6);

      if (
        fallbackRecentInsightsResult.error &&
        !isOptionalSchemaError(fallbackRecentInsightsResult.error)
      ) {
        throw fallbackRecentInsightsResult.error;
      }

      recentInsightsRows = fallbackRecentInsightsResult.error
        ? []
        : ((fallbackRecentInsightsResult.data as Array<
            Record<string, unknown>
          > | null) ?? []);
    }

    const recentInsights = (recentInsightsRows ?? []).map((item) => ({
      videoId: item.video_id as string,
      title: Array.isArray(item.videos)
        ? ((item.videos[0] as { title?: string | null } | undefined)?.title ??
          "Untitled")
        : ((item.videos as { title?: string | null } | null)?.title ??
          "Untitled"),
      summary: item.summary as string,
      hook: item.hook as string,
      thumbnailDescription: item.thumbnail_description as string,
      updatedAt: ((
        item as { updated_at?: string | null; created_at?: string | null }
      ).updated_at ??
        (item as { updated_at?: string | null; created_at?: string | null })
          .created_at ??
        new Date(0).toISOString()) as string,
    }));

    console.log("[content-ideas] GET summary ready", {
      userId,
      totalVideos: totalVideosResult.count ?? 0,
      detailedVideos: detailedVideosResult.error
        ? 0
        : (detailedVideosResult.count ?? 0),
      analyzedVideos: analyzedVideosResult.error
        ? 0
        : (analyzedVideosResult.count ?? 0),
      activeRunId: pickActiveRun(runs)?.id ?? null,
      recentInsightsCount: recentInsights.length,
    });

    return NextResponse.json({
      connection,
      summary: {
        totalVideos: totalVideosResult.count ?? 0,
        detailedVideos: detailedVideosResult.error
          ? 0
          : (detailedVideosResult.count ?? 0),
        analyzedVideos: analyzedVideosResult.error
          ? 0
          : (analyzedVideosResult.count ?? 0),
      },
      activeRun: pickActiveRun(runs),
      recentInsights,
      geminiUsage: getGeminiDailyUsageSnapshot(),
    });
  } catch (error) {
    console.error("[content-ideas] GET failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load content ideas status.",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  const { userId } = await auth();

  console.log("[content-ideas] POST start", { userId });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connection = await getYoutubeConnectionForUser(userId);

    if (!connection) {
      return NextResponse.json(
        { error: "Connect YouTube before collecting video details." },
        { status: 404 },
      );
    }

    await validateContentIdeasSchema();

    console.log("[content-ideas] starting analysis for connection", {
      userId,
      youtubeConnectionId: connection.id,
      channelId: connection.channelId,
    });

    const runs = await listUserIngestionRuns(userId, 10);
    const activeRun = pickActiveRun(runs);

    if (activeRun) {
      console.log("[content-ideas] reusing active run", {
        userId,
        runId: activeRun.id,
        status: activeRun.status,
        stage: activeRun.stage,
      });

      return NextResponse.json({ run: activeRun, reused: true });
    }

    const insightCoverage = await countVideosMissingInsights(connection.id);

    if (
      insightCoverage.totalVideos > 0 &&
      insightCoverage.videosMissingInsights === 0
    ) {
      return NextResponse.json({
        run: null,
        reused: false,
        skipped: true,
        reason: "all_videos_already_analyzed",
        summary: insightCoverage,
      });
    }

    const run = await createIngestionRunWithCatalogTask({
      clerkUserId: userId,
      youtubeConnectionId: connection.id,
      triggerSource: "refresh",
    });

    console.log("[content-ideas] created ingestion run", {
      userId,
      runId: run.id,
      youtubeConnectionId: connection.id,
    });

    return NextResponse.json({ run, reused: false }, { status: 201 });
  } catch (error) {
    console.error("[content-ideas] POST failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start content ideas analysis.",
      },
      { status: 500 },
    );
  }
}
