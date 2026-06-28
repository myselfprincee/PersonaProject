"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Globe, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatWorkspace } from "@/components/custom/dashboard/chat-workspace";
import { StatusBadge } from "@/components/custom/dashboard/status-badge";

type PublicPersonaSettings = {
  youtubeConnectionId: string;
  channelId: string;
  channelName: string;
  publicPersonaEnabled: boolean;
  publicSlug: string | null;
};

export function PublicPersonaManager() {
  const [settings, setSettings] = useState<PublicPersonaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privateDecision, setPrivateDecision] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch("/api/public-persona/settings");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load public persona settings.");
        }

        setSettings(data.settings);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load public persona settings.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function updateEnabled(enabled: boolean) {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/public-persona/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update public persona settings.");
      }

      setSettings(data.settings);
      setPrivateDecision(!enabled);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update public persona settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  const publicUrl = useMemo(() => {
    if (!settings?.publicSlug) {
      return null;
    }

    if (typeof window === "undefined") {
      return `/chat-w-${settings.publicSlug}`;
    }

    return `${window.location.origin}/chat-w-${settings.publicSlug}`;
  }, [settings?.publicSlug]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading public persona settings...
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

  if (!settings) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Connect YouTube first before you can configure a public persona.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={settings.publicPersonaEnabled ? "Public persona enabled" : "Private by default"}
              tone={settings.publicPersonaEnabled ? "success" : "neutral"}
            />
            <StatusBadge label={settings.channelName} tone="neutral" />
          </div>

          <h2 className="mt-5 text-2xl font-semibold text-gray-900">
            Make your Persona publicly accessible.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600 sm:text-base">
            If you make it public, people can ask questions directly against your published creator memory. That means fewer repeated DMs, faster fan answers, and a shareable URL that represents your voice.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Shareable destination</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Turn your memory into a public page people can visit directly.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Less repeated answering</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Let common questions route through Persona before they reach your inbox.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Grounded fan experience</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Answers still come from what you already published publicly.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              className="rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]"
              onClick={() => updateEnabled(true)}
              disabled={saving || settings.publicPersonaEnabled}
            >
              {settings.publicPersonaEnabled ? "Already public" : "Yes, make it public"}
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setPrivateDecision(true);
                void updateEnabled(false);
              }}
              disabled={saving}
            >
              No, keep it private for now
            </Button>
          </div>

          {settings.publicPersonaEnabled && publicUrl ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                Your public Persona is live.
              </p>
              <p className="mt-2 break-all text-sm leading-6 text-green-700">
                {publicUrl}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild className="rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]">
                  <Link href={publicUrl}>Open public page</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {!settings.publicPersonaEnabled && privateDecision ? (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Keeping it private is a fair choice.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    If you want more control, it makes sense to keep the public assistant off for now. At the same time, the source material is already public on YouTube, so what you are really holding back is discoverability, convenience, and a cleaner way for people to learn from what you have already shared.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-6">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              <Globe className="h-3.5 w-3.5 text-[#6c47ff]" />
              What becomes public
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-600">
              Only the public-facing assistant experience. Questions are answered from the selected creator channel only, not from anyone else.
            </p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-6">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              <Sparkles className="h-3.5 w-3.5 text-[#6c47ff]" />
              Why this matters
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-600">
              A public Persona can absorb repeat questions, teach new viewers faster, and make your past knowledge more discoverable without asking people to search across hundreds of videos manually.
            </p>
          </div>
        </div>
      </div>

      {settings.publicPersonaEnabled ? (
        <ChatWorkspace
          endpoint="/api/search"
          modeLabel="Public Persona Preview"
          emptyTitle="Preview the public experience before you share it"
          emptyDescription="This preview uses your current creator-scoped public persona behavior."
          exampleQuestions={[
            "What editor do you use?",
            "Did you ever mention when the giveaway starts?",
            "What is your advice for better thumbnails?",
          ]}
          sideTitle="Preview mode"
          sideBody="This lets you test how the public assistant sounds before you send the URL to other people."
          followUpCopy={[
            "Follow-up questions inherit the previous exchange when needed.",
            "The current preview is scoped to your own channel only.",
            "The public route will not require sign in.",
          ]}
          requireConnectionCheck={false}
          forceConnected
        />
      ) : null}
    </div>
  );
}
