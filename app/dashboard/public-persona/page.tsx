import { WorkspacePageHeader } from "@/components/custom/dashboard/page-header";
import { PublicPersonaManager } from "@/components/custom/dashboard/public-persona-manager";

export default function PublicPersonaPage() {
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        eyebrow="Public Persona"
        title="Turn your creator memory into a public assistant when you are ready."
        description="This is the internet-facing layer of Persona. If you make it public, people can ask questions without signing in, and answers will stay scoped to your own channel data only."
        badges={[
          { label: "Public-facing assistant", tone: "neutral" },
          { label: "Creator scoped", tone: "success" },
        ]}
      />

      <PublicPersonaManager />
    </div>
  );
}
