"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  MessageSquareText,
  Tv2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const classes = {
    neutral: "border-gray-200 bg-gray-50 text-gray-600",
    success: "border-green-200 bg-green-50 text-green-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[tone]}`}
    >
      {label}
    </span>
  );
}

function StepCard({
  step,
  title,
  description,
  status,
  action,
  detail,
}: {
  step: string;
  title: string;
  description: string;
  status: React.ReactNode;
  action: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
            {step}
          </p>
          <h2 className="mt-3 text-xl font-semibold text-gray-900">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            {description}
          </p>
        </div>
        {status}
      </div>
      {detail ? <div className="mt-5">{detail}</div> : null}
      <div className="mt-6">{action}</div>
    </div>
  );
}

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexedThisSession, setIndexedThisSession] = useState(false);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);

  const callbackState = useMemo(() => {
    const youtube = searchParams.get("youtube");
    const error = searchParams.get("error");

    if (youtube === "connected") {
      return {
        type: "success" as const,
        message: "YouTube connected successfully.",
      };
    }

    if (error) {
      return {
        type: "error" as const,
        message: `Connection failed: ${error.replaceAll("_", " ")}.`,
      };
    }

    return null;
  }, [searchParams]);

  useEffect(() => {
    async function checkConnection() {
      try {
        const response = await fetch("/api/youtube/checkConnection");
        const data = await response.json();
        setConnected(Boolean(data.connected));
      } catch {
        setConnected(false);
      }
    }

    checkConnection();
  }, []);

  async function handleIndexVideos() {
    setIndexing(true);
    setIndexMessage(null);

    try {
      const response = await fetch("/api/youtube/ytdlp/saveVideosInDb");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Indexing failed.");
      }

      setIndexedThisSession(true);
      setIndexMessage(data.message ?? "Videos indexed successfully.");
    } catch (error) {
      setIndexMessage(
        error instanceof Error ? error.message : "Indexing failed.",
      );
    } finally {
      setIndexing(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            Persona setup
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Build the creator memory once, then reuse it everywhere.
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-600">
            Connect YouTube, import transcripts, and generate embeddings. After
            that, Persona can power creator chat, smart replies, and public Q&A
            from the same memory layer.
          </p>
        </div>

        {callbackState ? (
          <div
            className={`mt-8 rounded-2xl border px-4 py-3 text-sm ${
              callbackState.type === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {callbackState.message}
          </div>
        ) : null}

        <div className="mt-10 grid gap-4">
          <StepCard
            step="Step 01"
            title="Connect YouTube"
            description="Authorize Persona to read the creator's channel identity and public video catalog. This is the entry point for the rest of the memory pipeline."
            status={
              connected === true ? (
                <StatusPill label="Connected" tone="success" />
              ) : connected === false ? (
                <StatusPill label="Not connected" tone="warning" />
              ) : (
                <StatusPill label="Checking" />
              )
            }
            detail={
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <Tv2 className="h-5 w-5 text-[#6c47ff]" />
                  <p className="mt-3 text-sm font-medium text-gray-900">
                    Channel access
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Used to discover videos and map the memory to one creator.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <Upload className="h-5 w-5 text-[#6c47ff]" />
                  <p className="mt-3 text-sm font-medium text-gray-900">
                    Transcript import
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Persona downloads transcript files and stores them for
                    chunking.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <Database className="h-5 w-5 text-[#6c47ff]" />
                  <p className="mt-3 text-sm font-medium text-gray-900">
                    Memory base
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Chunks and embeddings become reusable creator memory.
                  </p>
                </div>
              </div>
            }
            action={
              connected ? (
                <Button variant="outline" className="rounded-xl" disabled>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  YouTube connected
                </Button>
              ) : (
                <Button
                  className="rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]"
                  onClick={() => {
                    window.location.href = "/api/youtube/connect";
                  }}
                >
                  Connect YouTube
                </Button>
              )
            }
          />

          <StepCard
            step="Step 02"
            title="Build transcript memory"
            description="Import creator videos, store transcripts, and create vector memory so responses can be traced back to something the creator actually said."
            status={
              indexedThisSession ? (
                <StatusPill label="Indexed this session" tone="success" />
              ) : (
                <StatusPill label="Ready when connected" />
              )
            }
            detail={
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                <div className="grid gap-2 sm:grid-cols-4">
                  <p>Videos</p>
                  <p>Transcripts</p>
                  <p>Chunks</p>
                  <p>Embeddings</p>
                </div>
                {indexMessage ? (
                  <p className="mt-4 text-sm font-medium text-gray-900">
                    {indexMessage}
                  </p>
                ) : null}
              </div>
            }
            action={
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]"
                  onClick={handleIndexVideos}
                  disabled={!connected || indexing}
                >
                  {indexing ? "Indexing videos..." : "Build memory"}
                </Button>
                <p className="text-sm text-gray-500">
                  Runs your existing import and transcript pipeline.
                </p>
              </div>
            }
          />

          <StepCard
            step="Step 03"
            title="Open the workspace"
            description="Use Persona chat for grounded answers, review smart comment replies, inspect content ideas, and prepare the public persona experience for fans."
            status={<StatusPill label="Workspace ready" tone="neutral" />}
            action={
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/dashboard">
                  Open workspace
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            }
          />
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              What Persona reads
            </p>
            <div className="mt-5 space-y-3 text-sm leading-6 text-gray-600">
              <p>
                Published video transcripts for creator memory and grounded
                answers.
              </p>
              <p>
                Comments that should receive replies based on prior creator
                statements.
              </p>
              <p>
                Titles, thumbnails, upload cadence, and views for content
                strategy suggestions.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Product rule
            </p>
            <div className="mt-4 flex gap-3">
              <MessageSquareText className="mt-0.5 h-5 w-5 text-[#6c47ff]" />
              <p className="text-sm leading-6 text-gray-700">
                Every AI response should be traceable to something the creator
                actually said or published. Retrieval comes before generation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
