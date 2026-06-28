import { WorkspacePageHeader } from "@/components/custom/dashboard/page-header";
import ContentIdeasManager from "@/components/custom/dashboard/content-ideas-manager";

export default function ContentIdeasPage() {
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        eyebrow="Content Ideas"
        title="Turn content history into sharper next ideas."
        description="Ask Persona to collect fuller video detail first, then let the pipeline analyze your catalog into reusable insight records for stronger content strategy."
        badges={[
          { label: "Strategy workspace", tone: "neutral" },
          { label: "Pipeline-backed analysis", tone: "success" },
        ]}
      />

      <ContentIdeasManager />
    </div>
  );
}
