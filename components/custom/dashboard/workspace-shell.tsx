"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  PanelLeft,
} from "lucide-react";
import { workspaceNavigation } from "@/components/custom/dashboard/navigation";

function NavItems({
  mobile = false,
  collapsed = false,
}: {
  mobile?: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className={mobile ? "flex min-w-max gap-3" : "space-y-2"}>
      {workspaceNavigation.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        const linkClassName = [
          mobile
            ? "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors"
            : collapsed
              ? "group flex h-10 items-center justify-center rounded-[20px] border px-2.5 py-2.5 transition-all duration-300 hover:-translate-y-0.5"
              : "group flex items-start gap-3 rounded-2xl border px-4 py-4 transition-all duration-300 hover:-translate-y-0.5",
          isActive
            ? "border-[#6c47ff]/25 bg-[linear-gradient(180deg,rgba(108,71,255,0.12),rgba(108,71,255,0.06))] text-[#6c47ff] shadow-[0_16px_32px_-24px_rgba(108,71,255,0.55)]"
            : "border-gray-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,247,255,0.84))] text-gray-700 shadow-[0_14px_26px_-24px_rgba(88,94,140,0.28)] hover:border-gray-300 hover:text-gray-900",
        ].join(" ");
        const iconClassName = mobile
          ? "h-4 w-4"
          : collapsed
            ? "h-4.5 w-4.5 shrink-0"
            : "mt-0.5 h-4 w-4 shrink-0";
        const showLabel = mobile || !collapsed;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={collapsed && !mobile ? item.label : undefined}
            title={collapsed && !mobile ? item.label : undefined}
            className={linkClassName}
          >
            <Icon className={iconClassName} />
            {showLabel ? (
              <span className={mobile ? "block" : "block min-w-0"}>
                <span className="block font-medium">{item.label}</span>
                {mobile ? null : (
                  <span className="mt-1 block text-xs leading-5 text-gray-500 group-hover:text-gray-600">
                    {item.description}
                  </span>
                )}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700">
            <PanelLeft className="h-4 w-4 text-[#6c47ff]" />
            Creator workspace
          </div>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            Open setup
            <ArrowRight className="h-4 w-4 text-[#6c47ff]" />
          </Link>
        </div>

        <div className="scrollbar-none mb-6 overflow-x-auto pb-1 lg:hidden [&::-webkit-scrollbar]:hidden">
          <NavItems mobile />
        </div>

        <div
          className={[
            "grid gap-8 lg:items-start",
            collapsed
              ? "lg:grid-cols-[112px_minmax(0,1fr)]"
              : "lg:grid-cols-[280px_minmax(0,1fr)]",
          ].join(" ")}
        >
          <aside
            className="hidden transition-[width] duration-300 ease-out lg:sticky lg:block"
            style={{ top: "calc(var(--app-navbar-offset) + 1.5rem)" }}
          >
            <div className="space-y-4">
              <div
                className={[
                  "rounded-3xl border border-gray-200 bg-white transition-all duration-300 ease-out",
                  collapsed ? "p-4" : "p-5",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex gap-3",
                    collapsed
                      ? "items-center justify-between"
                      : "items-start justify-between",
                  ].join(" ")}
                >
                  {collapsed ? null : (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                        Creator workspace
                      </p>
                      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
                        Build, search, and ship creator memory.
                      </h1>
                      <p className="mt-3 text-sm leading-6 text-gray-600">
                        Keep the workflow obvious: check setup, search your own
                        memory, draft replies, and preview the public persona.
                      </p>
                      <Link
                        href="/onboarding"
                        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#6c47ff]"
                      >
                        Open setup
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setCollapsed((value) => !value)}
                    aria-label={
                      collapsed ? "Expand sidebar" : "Collapse sidebar"
                    }
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className={[
                      "inline-flex shrink-0 items-center justify-center border border-gray-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,246,255,0.82))] text-gray-500 shadow-[0_14px_30px_-24px_rgba(88,94,140,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:text-gray-700",
                      collapsed
                        ? "h-11 w-11 rounded-2xl"
                        : "h-10 w-10 rounded-2xl",
                    ].join(" ")}
                  >
                    {collapsed ? (
                      <ArrowRightToLine className="h-4 w-4" />
                    ) : (
                      <ArrowLeftToLine className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <NavItems collapsed={collapsed} />
            </div>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
