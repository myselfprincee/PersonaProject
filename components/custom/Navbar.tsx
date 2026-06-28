"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { clerkAppearance } from "@/clerk/appearance";

const signedInLinks = [
  { href: "/dashboard", label: "Workspace" },
  { href: "/onboarding", label: "Setup" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const router = useRouter();
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    function handleScroll() {
      const currentScrollY = window.scrollY;

      if (isOpen || currentScrollY <= 12) {
        setIsVisible(true);
        lastScrollYRef.current = currentScrollY;
        return;
      }

      const delta = currentScrollY - lastScrollYRef.current;

      if (delta > 8) {
        setIsVisible(false);
      } else if (delta < -8) {
        setIsVisible(true);
      }

      lastScrollYRef.current = currentScrollY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isOpen]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-navbar-offset",
      isVisible || isOpen ? "4rem" : "0px",
    );

    return () => {
      document.documentElement.style.setProperty("--app-navbar-offset", "4rem");
    };
  }, [isVisible, isOpen]);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 w-full border-b border-slate-200/80 bg-white/88 backdrop-blur-xl transition-transform duration-300 ease-out ${isVisible || isOpen ? "translate-y-0" : "-translate-y-full"}`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[#6c47ff]/14 bg-[#6c47ff]/10 shadow-[0_10px_24px_-18px_rgba(108,71,255,0.3)]">
            <div className="absolute h-5.5 w-5.5 rounded-full border border-[#6c47ff]/28" />
            <div className="absolute h-3.5 w-6.5 rotate-45 rounded-full border border-[#6c47ff]/24" />
            <div className="absolute h-6.5 w-3.5 -rotate-45 rounded-full border border-[#6c47ff]/18" />
            <div className="absolute h-2.5 w-2.5 rounded-full bg-[#6c47ff]" />
            <div className="absolute right-2 top-2 h-1 w-1 rounded-full bg-[#6c47ff]/55" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold text-gray-900">Persona</span>
            <span className="hidden text-xs text-gray-500 sm:block">
              Creator memory system
            </span>
          </div>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          <Show when="signed-out">
            <Button
              variant="ghost"
              className="rounded-xl text-gray-700 hover:bg-slate-100 hover:text-gray-900"
              onClick={() => router.push("/sign-in")}
            >
              Sign in
            </Button>
            <Button
              className="rounded-xl bg-[#6c47ff] text-white shadow-[0_12px_28px_-16px_rgba(108,71,255,0.36)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5b39d9] hover:shadow-[0_16px_34px_-16px_rgba(108,71,255,0.44)]"
              onClick={() => router.push("/sign-up")}
            >
              Get started
            </Button>
          </Show>

          <Show when="signed-in">
            {signedInLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button
                  variant="ghost"
                  className="rounded-xl text-gray-700 hover:bg-slate-100 hover:text-gray-900"
                >
                  {link.label}
                </Button>
              </Link>
            ))}
            <UserButton appearance={clerkAppearance} />
          </Show>
        </div>

        <button
          className="rounded-lg p-2 text-gray-700 md:hidden"
          onClick={() => setIsOpen((value) => !value)}
          aria-label="Toggle navigation"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-gray-200 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-2 rounded-2xl bg-white/70 p-2 backdrop-blur-sm">
            <Show when="signed-out">
              <Button
                variant="ghost"
                className="justify-start rounded-xl text-gray-700 hover:bg-slate-100"
                onClick={() => {
                  setIsOpen(false);
                  router.push("/sign-in");
                }}
              >
                Sign in
              </Button>
              <Button
                className="justify-start rounded-xl bg-[#6c47ff] text-white shadow-[0_12px_28px_-16px_rgba(108,71,255,0.36)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5b39d9] hover:shadow-[0_16px_34px_-16px_rgba(108,71,255,0.44)]"
                onClick={() => {
                  setIsOpen(false);
                  router.push("/sign-up");
                }}
              >
                Get started
              </Button>
            </Show>

            <Show when="signed-in">
              {signedInLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                >
                  <Button
                    variant="ghost"
                    className="w-full justify-start rounded-xl text-gray-700 hover:bg-slate-100"
                  >
                    {link.label}
                  </Button>
                </Link>
              ))}
              <div className="pt-2">
                <UserButton appearance={clerkAppearance} />
              </div>
            </Show>
          </div>
        </div>
      )}
    </nav>
  );
}
