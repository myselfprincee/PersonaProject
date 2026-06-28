import {
  Brain,
  Globe,
  LayoutDashboard,
  Lightbulb,
  MessagesSquare,
} from "lucide-react";

export const workspaceNavigation = [
  {
    href: "/dashboard/overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "Status, setup, and next actions",
  },
  {
    href: "/dashboard/creator-memory",
    label: "Creator Memory",
    icon: Brain,
    description: "Search your own published memory",
  },
  {
    href: "/dashboard/ai-replies",
    label: "AI Replies",
    icon: MessagesSquare,
    description: "Draft grounded comment replies",
  },
  {
    href: "/dashboard/content-ideas",
    label: "Content Ideas",
    icon: Lightbulb,
    description: "Find stronger titles and angles",
  },
  {
    href: "/dashboard/public-persona",
    label: "Public Persona",
    icon: Globe,
    description: "Preview the fan-facing assistant",
  },
] as const;
