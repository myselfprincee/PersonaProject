import { WorkspacePageHeader } from "@/components/custom/dashboard/page-header";
import { CommentsInboxManager } from "@/components/custom/dashboard/comments-inbox-manager";

export default function AIRepliesPage() {
  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        eyebrow="AI Replies"
        title="Run your YouTube comments inbox like a creator workflow."
        description="Sync comments from a video, auto-analyze them with creator memory, review drafts, and send approved replies back to YouTube without leaving the dashboard."
        badges={[
          { label: "Inbox workflow", tone: "success" },
          { label: "Auto-drafted replies", tone: "neutral" },
        ]}
      />

      <CommentsInboxManager />
    </div>
  );
}
