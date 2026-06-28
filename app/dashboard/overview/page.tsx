import Link from "next/link";
import { ArrowRight, Database, Globe, MessagesSquare, Tv2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspacePageHeader } from "@/components/custom/dashboard/page-header";
import { StatusBadge } from "@/components/custom/dashboard/status-badge";

const summaryCards = [
  {
    icon: Database,
    title: "Creator memory",
    description:
      "Transcripts become reusable memory for creator recall, replies, and public persona answers.",
  },
  {
    icon: MessagesSquare,
    title: "AI replies",
    description:
      "Draft comment replies from what the creator actually explained in past videos.",
  },
  {
    icon: Globe,
    title: "Public persona",
    description:
      "Preview the fan-facing assistant before exposing it through a public profile page.",
  },
];

const nextActions = [
  {
    title: "Connect YouTube",
    body: "Link the creator account so Persona can import the video catalog and start building memory.",
    href: "/onboarding",
    label: "Open setup",
  },
  {
    title: "Search your own memory",
    body: "Use Creator Memory when you want to recall whether, where, or when you mentioned something already.",
    href: "/dashboard/creator-memory",
    label: "Open creator memory",
  },
  {
    title: "Preview the public assistant",
    body: "Use Public Persona to test what internet users would ask and how the creator-facing answer sounds.",
    href: "/dashboard/public-persona",
    label: "Open public persona",
  },
];

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        eyebrow="Overview"
        title="See what Persona is for before you jump into a mode."
        description="This workspace is easier to use when the split is obvious: Creator Memory is for the creator's own recall, and Public Persona is for the internet-facing assistant."
        badges={[
          { label: "Creator-first workspace", tone: "neutral" },
          { label: "Public persona preview", tone: "neutral" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {summaryCards.map((card) => (
          <div
            key={card.title}
            className="rounded-3xl border border-gray-200 bg-white p-6"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#6c47ff]/10 text-[#6c47ff]">
                <card.icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                {card.title}
              </h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-600">
              {card.description}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            Workspace map
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm font-medium text-gray-900">
                Creator Memory
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Internal recall for questions like: when did I last mention a
                giveaway, which video covered Rust, or did I ever explain my
                thumbnail process?
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm font-medium text-gray-900">
                Public Persona
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                External assistant behavior for questions from fans and internet
                users who want answers grounded in published creator content.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm font-medium text-gray-900">AI Replies</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Response drafting for comments, using transcript evidence before
                generation.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm font-medium text-gray-900">Content Ideas</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Strategic insight from titles, topics, thumbnails, and content
                history.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              System rule
            </p>
            <p className="mt-4 text-sm leading-6 text-gray-600">
              The chatbot is only the interface. The real product is structured
              creator memory, then retrieval, then AI.
            </p>
            <div className="mt-4 inline-flex items-center gap-2">
              <StatusBadge label="Retrieval first" tone="success" />
              <StatusBadge label="Citations visible" tone="neutral" />
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Setup shortcut
            </p>
            <div className="mt-4 flex items-start gap-3">
              <Tv2 className="mt-0.5 h-4 w-4 text-[#6c47ff]" />
              <p className="text-sm leading-6 text-gray-600">
                If anything feels incomplete, the next likely problem is setup
                or transcript indexing.
              </p>
            </div>
            <Button
              asChild
              className="mt-5 rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]"
            >
              <Link href="/onboarding">Go to setup</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Recommended next actions
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {nextActions.map((action) => (
            <div
              key={action.title}
              className="rounded-2xl border border-gray-200 bg-gray-50 p-5"
            >
              <p className="text-lg font-semibold text-gray-900">
                {action.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {action.body}
              </p>
              <Link
                href={action.href}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#6c47ff]"
              >
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
