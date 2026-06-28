import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const architecture = [
  "Import videos",
  "Download transcripts",
  "Chunk transcript",
  "Generate embeddings",
  "Store vectors",
  "Answer with citations",
];

const features = [
  {
    title: "Persona chat",
    description:
      "Wanna Know about a video? Persona searches your transcript memory and answers with traceable context.",
  },
  {
    title: "Smart comment replies",
    description:
      "Draft grounded replies for repeat questions like giveaway timing, setup, tools, and workflow.",
  },
  {
    title: "Content strategy",
    description:
      "Use titles, thumbnails, views, and topic history to suggest stronger ideas before the next upload.",
  },
  {
    title: "Public persona",
    description:
      "Let anyone ask the creator's memory layer instead of searching across hundreds of videos manually.",
  },
];

const principles = [
  "Every answer starts with retrieval, not guessing.",
  "Comments become easier to reply to because the source already exists in prior videos.",
  "The chatbot is the interface, the product is structured creator memory.",
];

export default async function Home() {
  const user = await currentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent text-gray-900">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/landing-hero.webp"
          alt="Dreamy garden background"
          fill
          priority
          className="object-cover object-left-top opacity-[0.32] saturate-[0.92]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(246,248,255,0.64)_0%,rgba(245,247,255,0.54)_24%,rgba(245,247,255,0.62)_56%,rgba(248,249,255,0.76)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,rgba(255,255,255,0.3),transparent_24%),radial-gradient(circle_at_84%_16%,rgba(255,255,255,0.16),transparent_22%)]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-6 pb-20 pt-16 sm:pt-24">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/38 bg-white/20 px-6 py-8 shadow-[0_30px_80px_-48px_rgba(20,56,110,0.18)] backdrop-blur-sm sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] lg:block">
            <div className="absolute inset-y-10 right-[-4%] w-[105%] rotate-[5deg] overflow-hidden rounded-[2rem] border border-white/18 opacity-25 shadow-[0_28px_70px_-46px_rgba(15,23,42,0.28)]">
              <Image
                src="/landing-box-keyboard.jpg"
                alt="Keyboard workspace texture"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(255,255,255,0.5),rgba(255,255,255,0.18))]" />
              <div className="absolute inset-0 bg-[linear-gradient(190deg,rgba(255,255,255,0.84)_0%,rgba(255,255,255,0.34)_18%,rgba(255,255,255,0.06)_42%,rgba(255,255,255,0.18)_100%)]" />
            </div>
          </div>

          <div className="relative grid gap-10 border-b border-white/40 pb-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-end">
            <div className="max-w-3xl">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                AI memory layer for creators
              </p>
              <h1 className="max-w-4xl animate-[fade-up_700ms_ease-out] text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl">
                Every answer, grounded in what you already published.
              </h1>
              <p className="mt-6 max-w-2xl animate-[fade-up_850ms_ease-out] text-base leading-7 text-gray-600 sm:text-lg">
                Persona turns creator videos into searchable memory. It
                retrieves transcript evidence first, then drafts replies,
                answers fan questions, and suggests stronger content ideas.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3 animate-[fade-up_1000ms_ease-out]">
                <Button
                  asChild
                  className="h-10 rounded-xl bg-[#6c47ff] px-4 text-sm font-medium text-white shadow-[0_14px_30px_-18px_rgba(108,71,255,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5b39d9] hover:shadow-[0_18px_36px_-18px_rgba(108,71,255,0.42)]"
                >
                  <Link href="/sign-up">Start building Persona</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-xl px-4 text-sm font-medium text-gray-700"
                >
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  className="h-10 rounded-xl px-3 text-sm font-medium text-gray-600"
                >
                  <Link href="/onboarding">See the pipeline</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(245,249,255,0.6))] p-6 shadow-[0_24px_60px_-38px_rgba(20,56,110,0.16)] backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Why this matters
              </p>
              <div className="mt-5 space-y-4">
                {principles.map((item) => (
                  <div key={item} className="flex items-start gap-4">
                    <span className="mt-2 inline-block h-3 w-3 shrink-0 rounded-full bg-[#6c47ff]" />
                    <p className="text-sm leading-6 text-gray-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/38 bg-white/18 px-5 py-14 shadow-[0_26px_70px_-52px_rgba(20,56,110,0.16)] backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Core architecture
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
                One ingestion pipeline, multiple creator-facing features.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-gray-600">
              Persona is not a generic chatbot. The memory layer is created
              once, then reused for chat, replies, recall, and strategy.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {architecture.map((step, index) => (
              <div
                key={step}
                className="group relative overflow-hidden rounded-[1.35rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,247,255,0.84))] px-5 py-5 shadow-[0_18px_38px_-32px_rgba(95,101,160,0.24)] transition-all duration-300 hover:-translate-y-1 hover:border-white/80 hover:shadow-[0_24px_46px_-30px_rgba(95,101,160,0.34)]"
              >
                <div className="absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(108,71,255,0.55),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-[#6c47ff]/6 blur-2xl transition-all duration-300 group-hover:bg-[#6c47ff]/10" />
                <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 transition-colors duration-300 group-hover:text-[#6c47ff]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="relative mt-3 text-[1.02rem] font-semibold text-gray-900">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-14">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Product surface
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              Four ways to turn published creator knowledge into useful action.
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-white/55 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(241,243,255,0.84)_62%,rgba(234,239,255,0.9))] px-5 py-5 shadow-[0_24px_56px_-38px_rgba(95,101,160,0.38)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_64px_-36px_rgba(95,101,160,0.48)]"
              >
                <p className="text-6xl font-semibold leading-none text-gray-300/90 transition-colors duration-300 group-hover:text-[#6c47ff]/35">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-5 text-lg font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
