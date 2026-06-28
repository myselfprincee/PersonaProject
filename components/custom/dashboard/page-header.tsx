import { StatusBadge } from "@/components/custom/dashboard/status-badge";

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  badges = [],
}: {
  eyebrow: string;
  title: string;
  description: string;
  badges?: Array<{
    label: string;
    tone?: "neutral" | "success" | "warning";
  }>;
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-600 sm:text-base">
            {description}
          </p>
        </div>

        {badges.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {badges.map((badge) => (
              <StatusBadge
                key={badge.label}
                label={badge.label}
                tone={badge.tone ?? "neutral"}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
