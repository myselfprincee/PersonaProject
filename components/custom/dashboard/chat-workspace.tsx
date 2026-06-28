"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  CornerDownRight,
  Database,
  Maximize2,
  Minimize2,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/custom/dashboard/status-badge";

type Match = {
  chunk_text: string;
  start_ms: number;
  end_ms: number;
  video_title?: string | null;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  matches?: Match[];
  error?: boolean;
  streaming?: boolean;
};

type ConversationContext = {
  previousQuestion: string;
  previousAnswer: string;
};

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m${seconds === 0 ? "" : ` ${seconds}s`}`;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="space-y-3 overflow-hidden [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_em]:italic [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-inherit [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-inherit [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-inherit [&_li]:ml-5 [&_li]:pl-1 [&_ol]:space-y-1 [&_p]:leading-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black/5 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs [&_strong]:font-semibold [&_table]:mt-4 [&_table]:w-full [&_table]:min-w-105 [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-xl [&_tbody_tr]:border-t [&_tbody_tr]:border-gray-200/80 [&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-sm [&_th]:border [&_th]:border-gray-200 [&_th]:bg-black/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_ul]:space-y-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              className="text-[#6c47ff] underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            />
          ),
          ul: ({ ...props }) => (
            <ul {...props} className="list-disc space-y-1 pl-1" />
          ),
          ol: ({ ...props }) => (
            <ol {...props} className="list-decimal space-y-1 pl-1" />
          ),
          table: ({ ...props }) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MessageBubble({
  message,
  messageIndex,
  onFollowUp,
  isFollowUpTarget = false,
  isFullscreen = false,
}: {
  message: Message;
  messageIndex: number;
  onFollowUp?: (messageIndex: number) => void;
  isFollowUpTarget?: boolean;
  isFullscreen?: boolean;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isUser = message.role === "user";
  const hasSources = Boolean(message.matches?.length);

  if (isUser) {
    return (
      <div className="mb-4 flex justify-end">
        <div
          className={[
            "inline-block rounded-2xl rounded-br-sm bg-[#6c47ff] text-sm leading-relaxed text-white",
            isFullscreen
              ? "max-w-[88%] px-5 py-3 xl:max-w-[78%]"
              : "max-w-[80%] px-4 py-2.5",
          ].join(" ")}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="group mb-4 flex flex-col items-start">
      <div
        className={[
          "relative",
          isFullscreen ? "max-w-[92%] xl:max-w-[82%]" : "max-w-[92%]",
        ].join(" ")}
      >
        <div
          className={[
            "rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed shadow-[0_1px_0_rgba(15,23,42,0.02)]",
            isFollowUpTarget
              ? "border border-[#6c47ff]/25 bg-[#6c47ff]/6 text-gray-900"
              : message.error
                ? "border border-red-200 bg-red-50 text-red-800"
                : "border border-gray-200 bg-gray-50 text-gray-900",
          ].join(" ")}
        >
          {message.error ? (
            <div className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-red-700">
              <AlertCircle className="h-4 w-4" />
              Error
            </div>
          ) : null}
          {message.streaming ? (
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#6c47ff]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#6c47ff]" />
              Persona is typing
            </div>
          ) : null}
          <MarkdownMessage content={message.content} />
        </div>

        {!message.error && onFollowUp ? (
          <button
            type="button"
            onClick={() => onFollowUp(messageIndex)}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-500 opacity-0 shadow-sm transition duration-200 ease-out group-hover:opacity-100 group-focus-within:opacity-100 hover:border-[#6c47ff]/30 hover:text-[#6c47ff] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c47ff]/30"
            aria-label="Ask a follow-up about this reply"
            title="Ask a follow-up"
          >
            <CornerDownRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {hasSources ? (
        <div
          className={[
            "mt-2 w-full",
            isFullscreen ? "max-w-[92%] xl:max-w-[82%]" : "max-w-[92%]",
          ].join(" ")}
        >
          <button
            onClick={() => setSourcesOpen((value) => !value)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <span>Sources ({message.matches?.length ?? 0})</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${sourcesOpen ? "rotate-180" : ""}`}
            />
          </button>
          {sourcesOpen ? (
            <div className="mt-2 flex flex-col gap-2">
              {message.matches?.map((match, index) => (
                <div
                  key={`${match.start_ms}-${index}`}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2"
                >
                  {match.video_title ? (
                    <p className="text-[11px] font-medium text-gray-900">
                      {match.video_title}
                    </p>
                  ) : null}
                  <p className="text-[11px] font-medium text-[#6c47ff]">
                    {formatTime(match.start_ms)} — {formatTime(match.end_ms)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    {match.chunk_text.length > 110
                      ? `${match.chunk_text.slice(0, 110)}…`
                      : match.chunk_text}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  title,
  description,
  exampleQuestions,
  onPick,
  isFullscreen = false,
}: {
  title: string;
  description: string;
  exampleQuestions: string[];
  onPick: (value: string) => void;
  isFullscreen?: boolean;
}) {
  return (
    <div
      className={[
        "flex h-full flex-col items-center justify-center px-4 text-center",
        isFullscreen ? "py-10" : "py-12",
      ].join(" ")}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6c47ff]/10">
        <Bot className="h-5 w-5 text-[#6c47ff]" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">
        {description}
      </p>
      <div
        className={[
          "mt-8 flex w-full flex-col gap-2",
          isFullscreen ? "max-w-2xl" : "max-w-xl",
        ].join(" ")}
      >
        {exampleQuestions.map((question) => (
          <button
            key={question}
            onClick={() => onPick(question)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-700 hover:border-[#6c47ff]/30 hover:bg-[#6c47ff]/5"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingDots({ isFullscreen = false }: { isFullscreen?: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div
        className={[
          "rounded-2xl rounded-bl-sm border border-gray-200 bg-gray-50 px-4 py-3",
          isFullscreen ? "max-w-[92%] xl:max-w-[82%]" : "max-w-[85%]",
        ].join(" ")}
      >
        <span className="flex h-4 items-center gap-1">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse"
              style={{ animationDelay: `${index * 150}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

function getPreviousConversationContext(
  messages: Message[],
  preferredAssistantIndex?: number | null,
): ConversationContext | null {
  if (
    preferredAssistantIndex != null &&
    preferredAssistantIndex > 0 &&
    messages[preferredAssistantIndex]?.role === "assistant" &&
    !messages[preferredAssistantIndex]?.error &&
    messages[preferredAssistantIndex - 1]?.role === "user"
  ) {
    return {
      previousQuestion: messages[preferredAssistantIndex - 1].content,
      previousAnswer: messages[preferredAssistantIndex].content,
    };
  }

  for (let index = messages.length - 1; index > 0; index -= 1) {
    const assistantMessage = messages[index];
    const userMessage = messages[index - 1];

    if (
      assistantMessage?.role === "assistant" &&
      !assistantMessage.error &&
      userMessage?.role === "user"
    ) {
      return {
        previousQuestion: userMessage.content,
        previousAnswer: assistantMessage.content,
      };
    }
  }

  return null;
}

export function ChatWorkspace({
  endpoint,
  modeLabel,
  emptyTitle,
  emptyDescription,
  exampleQuestions,
  sideTitle,
  sideBody,
  followUpCopy,
  showIndexControls = false,
  requireConnectionCheck = true,
  forceConnected = false,
  layout = "default",
}: {
  endpoint: string;
  modeLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  exampleQuestions: string[];
  sideTitle: string;
  sideBody: string;
  followUpCopy: string[];
  showIndexControls?: boolean;
  requireConnectionCheck?: boolean;
  forceConnected?: boolean;
  layout?: "default" | "expanded";
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);
  const [followUpAssistantIndex, setFollowUpAssistantIndex] = useState<
    number | null
  >(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const conversationContext = useMemo(
    () => getPreviousConversationContext(messages, followUpAssistantIndex),
    [messages, followUpAssistantIndex],
  );
  const isExpanded = layout === "expanded";

  useEffect(() => {
    if (!requireConnectionCheck) {
      setConnected(forceConnected);
      return;
    }

    async function checkConnection() {
      try {
        const response = await fetch("/api/youtube/checkConnection");
        const data = await response.json();
        setConnected(Boolean(data.connected));
      } catch {
        setConnected(false);
      }
    }

    checkConnection();
  }, [forceConnected, requireConnectionCheck]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  async function handleIndexVideos() {
    setIndexing(true);
    setIndexStatus(null);

    try {
      const response = await fetch("/api/youtube/ytdlp/saveVideosInDb");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Indexing failed.");
      }

      setIndexStatus(data.message ?? "Videos indexed successfully.");
    } catch (error) {
      setIndexStatus(
        error instanceof Error
          ? error.message
          : "Indexing failed. Please try again.",
      );
    } finally {
      setIndexing(false);
    }
  }

  async function handleSubmit() {
    const question = input.trim();

    if (!question || loading) {
      return;
    }

    setMessages((current) => [...current, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question, conversationContext }),
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/x-ndjson")) {
        if (!response.ok || !response.body) {
          const fallbackError = await response
            .json()
            .catch(() => ({ error: "Search failed." }));
          throw new Error(fallbackError.error ?? "Search failed.");
        }

        let assistantIndex = -1;
        setMessages((current) => {
          assistantIndex = current.length;
          return [
            ...current,
            {
              role: "assistant",
              content: "",
              matches: [],
              streaming: true,
            },
          ];
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed) {
              continue;
            }

            const event = JSON.parse(trimmed) as {
              type: "token" | "done" | "error";
              token?: string;
              answer?: string;
              matches?: Match[];
              error?: string;
            };

            if (event.type === "token") {
              const token = event.token ?? "";
              setMessages((current) =>
                current.map((message, index) =>
                  index === assistantIndex
                    ? {
                        ...message,
                        content: `${message.content}${token}`,
                      }
                    : message,
                ),
              );
              continue;
            }

            if (event.type === "done") {
              setMessages((current) =>
                current.map((message, index) =>
                  index === assistantIndex
                    ? {
                        ...message,
                        content: event.answer ?? message.content,
                        matches: event.matches ?? [],
                        streaming: false,
                      }
                    : message,
                ),
              );
              setFollowUpAssistantIndex(null);
              continue;
            }

            if (event.type === "error") {
              throw new Error(event.error ?? "Search failed.");
            }
          }
        }
      } else {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Search failed.");
        }

        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: data.answer,
            matches: data.matches ?? [],
          },
        ]);
        setFollowUpAssistantIndex(null);
      }
    } catch (error) {
      setMessages((current) => {
        const next = [...current];
        const last = next.at(-1);

        if (last?.role === "assistant" && last.streaming) {
          next[next.length - 1] = {
            role: "assistant",
            content:
              error instanceof Error
                ? error.message
                : "Something went wrong. Please try again.",
            error: true,
          };
          return next;
        }

        return [
          ...current,
          {
            role: "assistant",
            content:
              error instanceof Error
                ? error.message
                : "Something went wrong. Please try again.",
            error: true,
          },
        ];
      });
      setFollowUpAssistantIndex(null);
    } finally {
      setLoading(false);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleQuestionPick(value: string) {
    setInput(value);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleFollowUp(messageIndex: number) {
    setFollowUpAssistantIndex(messageIndex);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const inputPlaceholder =
    followUpAssistantIndex != null
      ? "Ask a follow-up about this reply..."
      : "Ask a grounded question...";

  const helperCopy = isFullscreen
    ? "Focus mode keeps only the conversation on screen. Press Esc to close."
    : "Keep the interaction natural, then use sources to verify what Persona pulled in.";

  return (
    <>
      {isFullscreen ? (
        <button
          type="button"
          onClick={() => setIsFullscreen(false)}
          className="fixed inset-0 z-40 bg-[oklch(0.17_0.01_286/0.16)] backdrop-blur-[2px]"
          aria-label="Close distraction-free chat mode"
        />
      ) : null}

      <div
        className={[
          "grid gap-4",
          isExpanded
            ? "xl:grid-cols-[minmax(0,1fr)_280px]"
            : "lg:grid-cols-[minmax(0,1fr)_320px]",
        ].join(" ")}
      >
        <div
          className={[
            "overflow-hidden rounded-3xl border border-gray-200 bg-white",
            isExpanded ? "flex min-h-[72vh] flex-col" : "",
            isFullscreen
              ? "fixed inset-x-4 bottom-4 top-[calc(var(--app-navbar-offset)+1rem)] z-50 flex flex-col rounded-[2rem] shadow-[0_32px_120px_rgba(15,23,42,0.24)]"
              : "",
          ].join(" ")}
        >
          <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                {isFullscreen ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400">
                    Focus mode
                  </p>
                ) : null}
                <p className="text-sm font-medium text-gray-900">{modeLabel}</p>
                <p className="mt-1 text-sm text-gray-600">{helperCopy}</p>
              </div>

              <div className="flex items-center gap-2 self-start">
                <StatusBadge
                  label={
                    connected === true
                      ? "Ready"
                      : connected === false
                        ? "Setup needed"
                        : "Checking"
                  }
                  tone={
                    connected === true
                      ? "success"
                      : connected === false
                        ? "warning"
                        : "neutral"
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setIsFullscreen((value) => !value)}
                  className="rounded-full border-gray-200 bg-white text-gray-600 hover:border-[#6c47ff]/30 hover:text-[#6c47ff]"
                  aria-label={
                    isFullscreen
                      ? "Exit distraction-free chat mode"
                      : "Open distraction-free chat mode"
                  }
                  title={isFullscreen ? "Exit focus mode" : "Open focus mode"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div
            className={[
              "overflow-y-auto px-5 py-5 sm:px-6",
              isFullscreen
                ? "min-h-0 flex-1 scroll-py-8"
                : isExpanded
                  ? "min-h-128 flex-1 scroll-py-6"
                  : "max-h-136 min-h-80",
            ].join(" ")}
          >
            {connected !== true ? (
              <div className="flex min-h-80 items-center justify-center">
                <div className="max-w-lg text-center">
                  <Bot className="mx-auto h-8 w-8 text-[#6c47ff]" />
                  <h3 className="mt-4 text-xl font-semibold text-gray-900">
                    This workspace becomes useful after setup.
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    Connect YouTube and build transcript memory first, then this
                    page can answer with grounded context and follow-up
                    awareness.
                  </p>
                  <Button
                    asChild
                    className="mt-6 rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]"
                  >
                    <Link href="/onboarding">Open setup</Link>
                  </Button>
                </div>
              </div>
            ) : messages.length === 0 && !loading ? (
              <div className="min-h-80">
                <EmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                  exampleQuestions={exampleQuestions}
                  onPick={handleQuestionPick}
                  isFullscreen={isFullscreen}
                />
              </div>
            ) : (
              <div>
                {messages.map((message, index) => (
                  <MessageBubble
                    key={`${message.role}-${index}`}
                    message={message}
                    messageIndex={index}
                    onFollowUp={
                      message.role === "assistant" ? handleFollowUp : undefined
                    }
                    isFollowUpTarget={followUpAssistantIndex === index}
                    isFullscreen={isFullscreen}
                  />
                ))}
                {loading ? <ThinkingDots isFullscreen={isFullscreen} /> : null}
                <div ref={chatBottomRef} />
              </div>
            )}
          </div>

          <div
            className={[
              "border-t border-gray-200 px-5 py-4 sm:px-6",
              isFullscreen
                ? "sticky bottom-0 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur supports-backdrop-filter:bg-white/88"
                : "",
            ].join(" ")}
          >
            {showIndexControls ? (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <div className="inline-flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-[#6c47ff]" />
                  <span>Transcript memory pipeline</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-lg px-2 text-xs text-gray-700"
                  onClick={handleIndexVideos}
                  disabled={!connected || indexing}
                >
                  {indexing ? "Indexing..." : "Index videos"}
                </Button>
                {indexStatus ? (
                  <span className="text-gray-500">{indexStatus}</span>
                ) : null}
              </div>
            ) : null}

            {followUpAssistantIndex != null && conversationContext ? (
              <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-[#6c47ff]/15 bg-[#6c47ff]/5 px-3 py-2.5 text-sm text-gray-700">
                <div>
                  <p className="font-medium text-gray-900">Follow-up mode</p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Your next message will continue this selected reply instead
                    of the latest one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFollowUpAssistantIndex(null)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-white hover:text-gray-900"
                  aria-label="Cancel follow-up mode"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            <div className="rounded-[1.35rem] border border-gray-200 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={inputPlaceholder}
                  disabled={loading || connected !== true}
                  className={[
                    "border-0 bg-transparent text-sm shadow-none focus-visible:ring-0",
                    isExpanded || isFullscreen ? "h-12" : "h-11",
                  ].join(" ")}
                />
                <Button
                  size="icon"
                  onClick={handleSubmit}
                  disabled={loading || !input.trim() || connected !== true}
                  className={[
                    "w-11 shrink-0 rounded-xl bg-[#6c47ff] text-white hover:bg-[#5b39d9]",
                    isExpanded || isFullscreen ? "h-12" : "h-11",
                  ].join(" ")}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div
          className={[
            "space-y-4",
            isExpanded ? "xl:pt-2" : "",
            isFullscreen ? "hidden" : "",
          ].join(" ")}
        >
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              {sideTitle}
            </p>
            <p className="mt-4 text-sm leading-6 text-gray-600">{sideBody}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Follow-up behavior
            </p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
              {followUpCopy.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
