import { notFound } from "next/navigation";
import { ChatWorkspace } from "@/components/custom/dashboard/chat-workspace";
import { WorkspacePageHeader } from "@/components/custom/dashboard/page-header";
import { getPublicPersonaBySlug } from "@/services/public-persona/public-persona.service";

export default async function PublicPersonaChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let publicPersona: Awaited<ReturnType<typeof getPublicPersonaBySlug>> = null;
  let loadError: string | null = null;

  try {
    publicPersona = await getPublicPersonaBySlug(slug);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Public persona setup is not available yet.";
  }

  if (loadError) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
            {loadError}
          </div>
        </div>
      </div>
    );
  }

  if (!publicPersona) {
    notFound();
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="space-y-6">
          <WorkspacePageHeader
            eyebrow="Public Persona"
            title={`Ask ${publicPersona.channelName}`}
            description="This page is open to anyone. Answers are grounded only in this creator's published transcript memory, not anyone else's data."
            badges={[
              { label: "No sign in required", tone: "neutral" },
              { label: "Scoped to one creator", tone: "success" },
            ]}
          />

          <ChatWorkspace
            endpoint={`/api/public-persona/${publicPersona.publicSlug}/search`}
            modeLabel={`${publicPersona.channelName} Public Persona`}
            emptyTitle={`Ask what you want to know about ${publicPersona.channelName}`}
            emptyDescription="This assistant answers from the creator's published videos only."
            exampleQuestions={[
              "What editor do you use?",
              "Did you ever mention when the giveaway starts?",
              "What is your advice for better thumbnails?",
            ]}
            sideTitle="Why this is public"
            sideBody="This is the fan-facing assistant. It is open without sign in, but retrieval stays scoped to this creator alone."
            followUpCopy={[
              "Follow-up questions inherit the previous exchange when needed.",
              "Transcript evidence still stays the source of truth.",
              "This route answers only from this creator's published memory.",
            ]}
            requireConnectionCheck={false}
            forceConnected
            layout="expanded"
          />
        </div>
      </div>
    </div>
  );
}
