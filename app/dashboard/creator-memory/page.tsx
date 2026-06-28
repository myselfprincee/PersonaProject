import { WorkspacePageHeader } from "@/components/custom/dashboard/page-header";
import { ChatWorkspace } from "@/components/custom/dashboard/chat-workspace";

export default function CreatorMemoryPage() {
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        eyebrow="Creator Memory"
        title="Search your own published memory like a workspace tool, not a fan chatbot."
        description="Use this page when you want to recall where you mentioned something, whether you ever covered a topic, or what you said before about a specific process, tool, or event."
        badges={[
          { label: "Internal creator recall", tone: "success" },
          { label: "Transcript grounded", tone: "neutral" },
        ]}
      />

      <ChatWorkspace
        endpoint="/api/creator-memory/search"
        modeLabel="Creator Memory"
        emptyTitle="Ask what you already said before"
        emptyDescription="This is for the creator, not the audience. Use it to recover specific knowledge from your own published videos."
        exampleQuestions={[
          "When did I last mention a giveaway?",
          "Did I ever talk about Rust?",
          "Which video did I explain my thumbnail process in?",
        ]}
        sideTitle="How to use it"
        sideBody="Ask direct recall questions. This page is strongest when you want a fast memory lookup with titles and timestamps, not a polished public-facing response."
        followUpCopy={[
          "Short follow-ups keep the previous exchange in context.",
          "The answer should help the creator remember where something was mentioned.",
          "Titles and timestamps matter more here than public-facing polish.",
        ]}
        showIndexControls
        layout="expanded"
      />
    </div>
  );
}
