// ─── Wab Parser Workspace ──────────────────────────────────────────────────
// AI chat interface with agentic tool execution, approval gates,
// quota-aware error handling, and chat deletion.

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Download,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationScrollOnSend,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAuth } from "@/lib/auth-context";
import { ChatSidebar } from "@/components/agent/ChatSidebar";
import { takePendingFiles, takePendingPrompt } from "@/lib/chat-session";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/utils";
import { useDeleteChatThread, AI_PLAN_DAILY_LIMITS } from "@/lib/data-hooks";
import { loadComposerDraft, saveComposerDraft, clearComposerDraft } from "@/lib/chat-session";

// ── Suggestion chips ──────────────────────────────────────────────────────────

const SUGGESTIONS_BY_PLAN: Record<string, string[]> = {
  free: ["What is my realised capital gain this tax year?", "Show my latest ledger totals"],
  standard: [
    "Reconcile my last 10 trades and flag anything odd",
    "Extract this broker slip and post it to my ledger",
    "What is my realised capital gain this tax year?",
    "Detect fee surcharges and WHT mismatches",
  ],
  pro: [
    "Reconcile my last 10 trades and flag anything odd",
    "Extract this broker slip and post it to my ledger",
    "What is my realised capital gain this tax year?",
    "Update unfinished records and prepare a new spreadsheet",
    "Detect fee surcharges and WHT mismatches",
    "Analyse my portfolio concentration and risk",
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceStatus = "loading" | "ready" | "not_found" | "error";

type ToolPart = {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string };
};

// ── Quota error structures returned by /api/chat ──────────────────────────────

interface QuotaError {
  code: "quota_exceeded";
  plan: string;
  daily_limit: number;
  credits_used: number;
  message: string;
}

interface ProviderError {
  code: "provider_error" | "timeout" | "rate_limit";
  message: string;
}

// ── Classify API error message ────────────────────────────────────────────────

function classifyError(
  msg: string,
): "quota" | "credits" | "rate_limit" | "timeout" | "provider" | "generic" {
  const m = msg.toLowerCase();
  if (
    m.includes("quota_exceeded") ||
    m.includes("quota exceeded") ||
    m.includes("daily limit") ||
    m.includes("429")
  )
    return "quota";
  if (
    m.includes("402") ||
    m.includes("requires more credits") ||
    m.includes("credits") ||
    m.includes("upgrade to a paid")
  )
    return "credits";
  if (m.includes("rate limit") || m.includes("rate-limit") || m.includes("temporarily busy"))
    return "rate_limit";
  if (
    m.includes("504") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("taking longer")
  )
    return "timeout";
  if (
    m.includes("502") ||
    m.includes("503") ||
    m.includes("upstream") ||
    m.includes("provider") ||
    m.includes("overloaded")
  )
    return "provider";
  return "generic";
}

// ── Quota / Error banner shown inline in the chat ─────────────────────────────

function ErrorBanner({
  message,
  plan,
  onRetry,
}: {
  message: string;
  plan: string;
  onRetry?: () => void;
}) {
  const kind = classifyError(message);

  const configs = {
    quota: {
      icon: Zap,
      color: "var(--bad)",
      bg: "color-mix(in srgb, var(--bad) 6%, transparent)",
      border: "color-mix(in srgb, var(--bad) 20%, transparent)",
      title: plan === "free" ? "You've reached today's AI limit" : "Daily AI limit reached",
      body:
        plan === "free"
          ? `Your Free plan includes ${AI_PLAN_DAILY_LIMITS["free"]} AI requests per day. Your limit resets in 24 hours.`
          : message,
      cta: plan === "free" ? "Upgrade to Pro" : null,
      ctaLink: "/app/billing",
    },
    credits: {
      icon: Zap,
      color: "var(--warn)",
      bg: "color-mix(in srgb, var(--warn) 6%, transparent)",
      border: "color-mix(in srgb, var(--warn) 20%, transparent)",
      title: "AI service needs more credits",
      body: "The AI provider ran out of free credits for this request. This is a temporary limit — try again in a few minutes or ask a simpler question.",
      cta: "Try again",
      ctaLink: null,
    },
    rate_limit: {
      icon: Clock,
      color: "var(--warn)",
      bg: "color-mix(in srgb, var(--warn) 6%, transparent)",
      border: "color-mix(in srgb, var(--warn) 20%, transparent)",
      title: "Wab is temporarily busy",
      body: "The AI service has reached its current request limit. Your data is safe and no changes were made. Try again in a few minutes.",
      cta: "Try again",
      ctaLink: null,
    },
    timeout: {
      icon: AlertTriangle,
      color: "var(--warn)",
      bg: "color-mix(in srgb, var(--warn) 6%, transparent)",
      border: "color-mix(in srgb, var(--warn) 20%, transparent)",
      title: "Wab is taking longer than expected",
      body: "The AI service didn't respond in time. Your financial data hasn't been changed.",
      cta: "Try again",
      ctaLink: null,
    },
    provider: {
      icon: AlertTriangle,
      color: "var(--warn)",
      bg: "color-mix(in srgb, var(--warn) 6%, transparent)",
      border: "color-mix(in srgb, var(--warn) 20%, transparent)",
      title: "Wab is temporarily unavailable",
      body: "The AI service didn't respond. Your financial data was not changed. This is usually resolved in seconds.",
      cta: "Try again",
      ctaLink: null,
    },
    generic: {
      icon: AlertTriangle,
      color: "var(--bad)",
      bg: "color-mix(in srgb, var(--bad) 6%, transparent)",
      border: "color-mix(in srgb, var(--bad) 20%, transparent)",
      title: "Something went wrong",
      body: message,
      cta: "Try again",
      ctaLink: null,
    },
  } as const;

  const cfg = configs[kind];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto my-3 max-w-[48rem] overflow-hidden rounded-2xl px-5 py-4"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <div className="flex items-start gap-3">
        <Icon
          size={16}
          strokeWidth={1.75}
          style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: cfg.color }}>
            {cfg.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {cfg.body}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cfg.cta && cfg.ctaLink && (
              <a
                href={cfg.ctaLink}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: cfg.color }}
              >
                {cfg.cta}
                <ArrowUpRight size={11} />
              </a>
            )}
            {cfg.cta && !cfg.ctaLink && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-hover"
                style={{ borderColor: cfg.color, color: cfg.color }}
              >
                {cfg.cta}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── CSV download helper ───────────────────────────────────────────────────────

function formatMoney(value: unknown, currency?: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  const amount = Number.isFinite(num)
    ? num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(value ?? "—");
  const cur = typeof currency === "string" && currency.trim() ? currency.trim() : "";
  return cur ? `${cur} ${amount}` : amount;
}

function narrateToolOutput(name: string, output: unknown): string {
  if (output == null) return "";
  if (typeof output === "string") return output.trim();
  if (typeof output !== "object") return String(output);

  const rec = output as Record<string, unknown>;
  if (typeof rec["error"] === "string") return rec["error"];
  if (typeof rec["message"] === "string" && rec["accounts"] == null) return rec["message"];

  if (Array.isArray(rec["accounts"])) {
    const accounts = rec["accounts"] as Record<string, unknown>[];
    if (accounts.length === 0) {
      return typeof rec["note"] === "string"
        ? rec["note"]
        : "No live balances are available yet. Connect a source, then ask again.";
    }
    const lines = accounts.map((account) => {
      const label =
        [account["account_type"], account["external_id"], account["connection_id"]]
          .filter((part) => typeof part === "string" && part.trim())
          .join(" · ") || "Account";
      return `- ${label}: ${formatMoney(account["balance"] ?? account["available"], account["currency"])}`;
    });
    const note = typeof rec["note"] === "string" ? `\n\n${rec["note"]}` : "";
    return `Here is your current balance:\n\n${lines.join("\n")}${note}`;
  }

  if (typeof rec["totalTransactions"] === "number") {
    return `Your ledger has ${rec["totalTransactions"]} transaction(s), ${rec["needsReview"] ?? 0} needing review, and ${rec["openFlags"] ?? 0} open flag(s).`;
  }

  if (typeof rec["plan"] === "string" && typeof rec["transactions"] === "number") {
    return `You are on the ${rec["plan"]} plan, with ${rec["transactions"]} ledger transaction(s) and ${rec["open_flags"] ?? 0} open flag(s).`;
  }

  const scalars = Object.entries(rec)
    .filter(([, value]) => value == null || ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 8)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`);
  return scalars.length > 0 ? scalars.join("\n") : "";
}

function assistantHasWrittenText(parts: UIMessage["parts"]): boolean {
  return parts.some((part) => part.type === "text" && part.text.trim().length > 0);
}

function narrateAssistantTools(parts: UIMessage["parts"]): string {
  const paragraphs: string[] = [];
  for (const part of parts) {
    const tp = part as unknown as ToolPart;
    if (!(tp.type?.startsWith("tool-") || tp.type === "dynamic-tool")) continue;
    if (tp.state !== "output-available" || tp.output == null) continue;
    const name = tp.toolName ?? tp.type.replace(/^tool-/, "");
    if (name === "report_progress" || name === "plan_task") continue;
    const text = narrateToolOutput(name, tp.output);
    if (text) paragraphs.push(text);
  }
  return paragraphs.join("\n\n");
}

function triggerCsvDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Tool card ─────────────────────────────────────────────────────────────────

function ToolCard({
  part,
  onApprove,
}: {
  part: ToolPart;
  onApprove: ((approved: boolean) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rawName = part.toolName ?? part.type.replace(/^tool-/, "");
  const friendlyName = rawName.replace(/_/g, " ");
  const running = part.state === "input-streaming" || part.state === "input-available";
  const needsApproval = part.state === "approval-requested";
  const isDone = part.state === "output-available";
  const isError = !!part.errorText;

  useEffect(() => {
    if (rawName === "prepare_spreadsheet" && isDone && part.output) {
      const out = part.output as Record<string, unknown>;
      if (typeof out["csv"] === "string" && typeof out["filename"] === "string") {
        triggerCsvDownload(out["filename"] as string, out["csv"] as string);
        toast.success("Spreadsheet ready", { description: `${out["filename"]} downloaded` });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone]);

  if (rawName === "plan_task" && isDone && part.output) {
    const out = part.output as Record<string, unknown>;
    const steps = Array.isArray(out["steps"]) ? (out["steps"] as string[]) : [];
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-3 overflow-hidden rounded-2xl"
        style={{ border: "1px solid var(--accent-20)", background: "var(--accent-4)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <Sparkles size={14} style={{ color: "var(--color-accent)" }} />
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-accent)" }}
          >
            Task Plan
          </span>
        </div>
        {out["objective"] != null && (
          <p className="px-4 pb-2 text-sm font-medium">{String(out["objective"])}</p>
        )}
        {steps.length > 0 && (
          <ul className="space-y-1.5 px-4 pb-4">
            {steps.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs"
                style={{ color: "var(--ink-2)" }}
              >
                <span
                  className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: "var(--accent-14)", color: "var(--color-accent)" }}
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    );
  }

  if (rawName === "report_progress") return null;

  if (rawName === "prepare_spreadsheet" && isDone && part.output) {
    const out = part.output as Record<string, unknown>;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-3 overflow-hidden rounded-2xl"
        style={{
          border: "1px solid color-mix(in srgb, var(--ok) 25%, transparent)",
          background: "color-mix(in srgb, var(--ok) 5%, transparent)",
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Download size={16} strokeWidth={1.75} style={{ color: "var(--ok)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--ok)" }}>
              Spreadsheet Ready
            </p>
            <p className="text-xs truncate" style={{ color: "var(--ink-3)" }}>
              {String(out["filename"] ?? "export.csv")}
              {out["row_count"] !== undefined && ` — ${out["row_count"]} rows`}
            </p>
          </div>
          {typeof out["csv"] === "string" && (
            <button
              type="button"
              onClick={() =>
                triggerCsvDownload(String(out["filename"] ?? "export.csv"), String(out["csv"]))
              }
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "var(--ok)", color: "#fff" }}
            >
              <Download size={12} /> Download
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div
      className="my-1 overflow-hidden rounded-2xl transition-colors"
      style={{ border: "1px solid var(--hairline)" }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-[var(--accent-4)]"
      >
        {/* Static status marker — no spinners or pulses while a tool runs. */}
        {running ? (
          <Circle size={13} strokeWidth={2} style={{ color: "var(--ink-3)" }} />
        ) : isError ? (
          <X size={14} style={{ color: "var(--bad)" }} />
        ) : needsApproval ? (
          <AlertTriangle size={14} style={{ color: "var(--warn)" }} />
        ) : (
          <Check size={14} style={{ color: "var(--ok)" }} />
        )}
        <span className="capitalize">{friendlyName}</span>
        <span className="ml-auto text-xs font-normal" style={{ color: "var(--ink-3)" }}>
          {needsApproval ? "needs approval" : running ? "running" : isError ? "failed" : "done"}
        </span>
        {isDone && !isError && (
          <ChevronDown
            size={13}
            className="transition-transform duration-200 ease-out"
            style={{ transform: open ? "rotate(180deg)" : "none", color: "var(--ink-3)" }}
          />
        )}
      </button>

      {/* Height animates via grid-template-rows so the transcript never jumps. */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 px-3.5 pb-3 pt-1 text-[11px]" style={{ color: "var(--ink-2)" }}>
            {part.input != null && (
              <pre
                className="overflow-x-auto rounded-xl p-2.5 whitespace-pre-wrap break-words"
                style={{ background: "var(--accent-5)" }}
              >
                {JSON.stringify(part.input, null, 2)}
              </pre>
            )}
            {part.output !== undefined && (
              <pre
                className="overflow-x-auto rounded-xl p-2.5 whitespace-pre-wrap break-words"
                style={{ background: "var(--accent-5)" }}
              >
                {JSON.stringify(part.output, null, 2)}
              </pre>
            )}
            {isError && <p style={{ color: "var(--bad)" }}>{part.errorText}</p>}
          </div>
        </div>
      </div>

      {needsApproval && onApprove && (
        <div
          className="flex items-center gap-3 border-t px-4 py-3"
          style={{
            borderColor: "var(--hairline)",
            background: "color-mix(in srgb, var(--warn) 5%, transparent)",
          }}
        >
          <AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <p className="mr-auto text-xs" style={{ color: "var(--ink-2)" }}>
            Wab wants to write to your ledger. Review the input above before approving.
          </p>
          <button
            type="button"
            onClick={() => onApprove(false)}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--accent-6)]"
            style={{ border: "1px solid var(--hairline)" }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onApprove(true)}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-accent)" }}
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteChatModal({
  onClose,
  onConfirm,
  deleting,
}: {
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-surface p-6 shadow-2xl"
        style={{ border: "1px solid var(--hairline)" }}
      >
        <div
          className="mb-4 flex size-10 items-center justify-center rounded-xl"
          style={{ background: "color-mix(in srgb, var(--bad) 10%, transparent)" }}
        >
          <Trash2 size={18} style={{ color: "var(--bad)" }} />
        </div>
        <h3 className="mb-1 text-sm font-bold">Delete this conversation?</h3>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          All messages in this chat will be permanently deleted. Your ledger records and
          transactions are not affected.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--hairline)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--bad)", color: "#fff" }}
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete chat
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── AttachedFileStrip — shows queued files inside the composer ───────────────

function AttachFilesButton() {
  const attachments = usePromptInputAttachments();
  return (
    <button
      type="button"
      onClick={() => attachments.openFileDialog()}
      title="Attach files"
      aria-label="Attach files"
      className="flex size-9 items-center justify-center rounded-full transition-colors duration-150 hover:bg-[var(--accent-8)] active:scale-95"
      style={{ color: "var(--ink-2)" }}
    >
      <Plus size={19} strokeWidth={1.75} />
    </button>
  );
}

function AttachedFileStrip() {
  const attachments = usePromptInputAttachments();
  const files = attachments.files;
  if (!files || files.length === 0) return null;

  return (
    <div data-has-attachments className="flex flex-wrap gap-2 px-4 pt-3.5 pb-0">
      {files.map((file) => (
        <div
          key={file.id}
          className="wab-pop-in flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
          style={{
            background: "var(--accent-5)",
            border: "1px solid var(--hairline)",
            color: "var(--color-text)",
          }}
        >
          <FileText size={13} strokeWidth={1.75} style={{ color: "var(--ink-2)", flexShrink: 0 }} />
          <span className="max-w-[180px] truncate">{file.filename ?? "Document"}</span>
          <button
            type="button"
            onClick={() => attachments.remove(file.id)}
            className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-[var(--accent-10)]"
            aria-label={`Remove ${file.filename}`}
            style={{ color: "var(--ink-3)" }}
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Chat component ────────────────────────────────────────────────────────────

function Chat({
  threadId,
  initial,
  transport,
  plan,
}: {
  threadId: string;
  initial: UIMessage[];
  transport: DefaultChatTransport<UIMessage>;
  plan: string;
}) {
  const { user } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingFired = useRef(false);
  const navigate = useNavigate();
  const deleteChatMutation = useDeleteChatThread();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Messages that existed when the thread opened never animate in; only new
  // turns get the entrance transition (history shouldn't "pop" on load).
  const initialCount = useRef(initial.length);

  const { messages, sendMessage, status, stop, error, addToolApprovalResponse } = useChat({
    id: threadId,
    messages: initial,
    transport,
    // ~25fps flush keeps streamed text flowing smoothly instead of in chunks.
    throttle: 40,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat_threads", user?.id] });
    },
    onError: (cause) => {
      // Don't show a generic toast — the ErrorBanner in the UI handles it
      console.error("[Wab] Chat error", cause);
    },
  });

  // ── Pending prompt from landing composer ──────────────────────────────────
  useEffect(() => {
    if (pendingFired.current) return;
    pendingFired.current = true;
    const pendingText = takePendingPrompt();
    const pendingFiles = takePendingFiles();
    if (pendingText || pendingFiles.length > 0) {
      void (async () => {
        const aiFiles =
          pendingFiles.length > 0
            ? await Promise.all(
                pendingFiles.map(async (f) => {
                  const ab = await f.arrayBuffer();
                  return new File([ab], f.name, { type: f.type || "application/octet-stream" });
                }),
              )
            : undefined;
        await sendMessage({
          text: pendingText || "Analyse the attached document(s).",
          ...(aiFiles ? { files: dataTransferFiles(aiFiles) } : {}),
        });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status]);

  // Restore the unsent draft after reload so typed text survives navigation.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const draft = loadComposerDraft(threadId);
    if (draft && !ta.value) ta.value = draft;
  }, [threadId]);

  async function handleDeleteChat() {
    if (!user?.id) return;
    try {
      await deleteChatMutation.mutateAsync({ threadId, userId: user.id });
      toast.success("Conversation deleted");
      // Navigate to parser index which will create a fresh thread
      navigate({ to: "/app/parser" });
    } catch {
      toast.error("Failed to delete conversation");
    }
  }

  const empty = messages.length === 0;
  const isStreaming = status === "streaming" || status === "submitted";

  // Classify the error so we can render the right message
  const errorMessage = error?.message ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <Conversation className="min-h-0 flex-1">
        <ConversationScrollOnSend messages={messages} />
        <ConversationContent className="mx-auto w-full max-w-[48rem] gap-8 px-4 pb-10 pt-6 sm:px-5 sm:pt-10">
          {empty && (
            <div className="wab-fade-up flex min-h-[48vh] flex-col items-center justify-center text-center">
              <h1
                className="text-balance"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "clamp(1.6rem,3.4vw,2.2rem)",
                  lineHeight: 1.15,
                }}
              >
                Ask Wab a question about your data
              </h1>
              <p
                className="mt-3 max-w-md text-balance text-[15px] leading-relaxed"
                style={{ color: "var(--ink-2)" }}
              >
                Investigate anomalies, reconcile trades, or drop in a broker statement, PDF or
                spreadsheet to get started.
              </p>
            </div>
          )}

          {messages.map((message, messageIndex) => {
            const isLastAssistant =
              message.role === "assistant" && messageIndex === messages.length - 1;
            const fallbackText =
              message.role === "assistant" &&
              !isStreaming &&
              !assistantHasWrittenText(message.parts)
                ? narrateAssistantTools(message.parts)
                : "";
            // Only turns created after the thread opened get the entrance motion.
            const isNewTurn = messageIndex >= initialCount.current;
            return (
              <Message
                key={message.id}
                from={message.role}
                className={isNewTurn ? "wab-msg-in" : undefined}
              >
                <MessageContent>
                  {message.parts.map((part, index) => {
                    const partKey =
                      ("toolCallId" in part &&
                        typeof part.toolCallId === "string" &&
                        part.toolCallId) ||
                      `${message.id}-${part.type}-${index}`;
                    if (part.type === "text")
                      return (
                        <MessageResponse key={partKey} isAnimating={isStreaming && isLastAssistant}>
                          {part.text}
                        </MessageResponse>
                      );

                    if (part.type === "file")
                      return (
                        <div
                          key={partKey}
                          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
                          style={{ borderColor: "var(--hairline)" }}
                        >
                          📎 {("filename" in part && part.filename) || "Attached document"}
                        </div>
                      );

                    if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                      const tp = part as unknown as ToolPart;
                      const approvalId = tp.approval?.id;
                      return (
                        <ToolCard
                          key={partKey}
                          part={tp}
                          onApprove={
                            approvalId
                              ? (approved) => addToolApprovalResponse({ id: approvalId, approved })
                              : undefined
                          }
                        />
                      );
                    }
                    return null;
                  })}
                  {fallbackText ? <MessageResponse>{fallbackText}</MessageResponse> : null}
                </MessageContent>
              </Message>
            );
          })}

          {/* Quota / provider / timeout error banners */}
          {error && (
            <ErrorBanner
              message={errorMessage}
              plan={plan}
              onRetry={() => {
                const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                if (lastUserMsg) {
                  const textParts = lastUserMsg.parts.filter((p) => p.type === "text");
                  const text = textParts.map((p) => (p as { text: string }).text).join(" ");
                  if (text) void sendMessage({ text });
                }
              }}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Composer area ─────────────────────────────────────────────────── */}
      <div className="wab-composer-area relative px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
        <div className="mx-auto w-full max-w-[48rem]">
          {empty && (
            <div className="wab-fade-up mb-3 flex flex-wrap justify-center gap-2">
              {(SUGGESTIONS_BY_PLAN[plan] ?? SUGGESTIONS_BY_PLAN["free"] ?? []).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void sendMessage({ text: s })}
                  className="rounded-full px-3.5 py-2 text-[13px] transition-[background-color,transform] duration-150 hover:bg-[var(--accent-6)] active:scale-[0.98]"
                  style={{ border: "1px solid var(--hairline)", color: "var(--ink-2)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <PromptInput
            className="wab-composer"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.txt,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain"
            multiple
            globalDrop
            onError={(err) => toast.error(err.message)}
            onSubmit={async ({ text, files }) => {
              const trimmed = (text ?? "").trim();
              if (!trimmed && (!files || files.length === 0)) return;
              clearComposerDraft(threadId);
              // Collapse the box back to one line as soon as the message leaves.
              requestAnimationFrame(() => {
                if (textareaRef.current) textareaRef.current.style.height = "";
              });
              await sendMessage({
                text: trimmed || "Read the attached file(s) and use them as context.",
                files,
              });
            }}
          >
            <AttachedFileStrip />
            <PromptInputTextarea
              ref={textareaRef}
              autoFocus
              placeholder="Ask Wab a question about your data…"
              className="max-h-[200px] min-h-[56px] px-5 pt-4 text-base leading-6 placeholder:text-[color:var(--ink-3)]"
              onChange={(e) => {
                // Auto-grow (field-sizing covers modern browsers; this covers the rest)
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                saveComposerDraft(threadId, el.value);
              }}
            />
            <PromptInputFooter className="px-3 pb-3 pt-1">
              <PromptInputTools>
                <AttachFilesButton />
              </PromptInputTools>
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>

          <p className="mt-2 text-center text-[11px]" style={{ color: "var(--ink-3)" }}>
            Wab acts on your data autonomously. Every change is traceable and reversible.
          </p>
        </div>
      </div>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteOpen && (
          <DeleteChatModal
            onClose={() => setDeleteOpen(false)}
            onConfirm={handleDeleteChat}
            deleting={deleteChatMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ParserWorkspace (public entry point) ──────────────────────────────────────

export function ParserWorkspace({ threadId }: { threadId: string }) {
  const { session, profile } = useAuth();
  const [wsStatus, setWsStatus] = useState<WorkspaceStatus>("loading");
  const [initial, setInitial] = useState<UIMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const plan = profile?.plan ?? "free";

  useEffect(() => {
    let cancelled = false;
    setWsStatus("loading");
    setLoadError(null);

    void (async () => {
      try {
        const { data: thread, error: threadError } = await withTimeout(
          supabase.from("chat_threads").select("id").eq("id", threadId).maybeSingle(),
          15000,
          "Thread query",
        );
        if (cancelled) return;
        if (threadError) throw new Error(threadError.message);
        if (!thread) {
          try {
            sessionStorage.removeItem("wab.last.chat.thread");
          } catch {
            /* ignore */
          }
          setWsStatus("not_found");
          return;
        }

        const { data, error } = await withTimeout(
          supabase
            .from("chat_messages")
            .select("ai_message_id, role, parts")
            .eq("thread_id", threadId)
            .order("position"),
          15000,
          "Messages query",
        );
        if (cancelled) return;
        if (error) throw new Error(error.message);

        setInitial(
          (data ?? []).map((row) => ({
            id: row.ai_message_id,
            role: row.role,
            parts: row.parts,
          })) as UIMessage[],
        );
        try {
          sessionStorage.setItem("wab.last.chat.thread", threadId);
        } catch {
          /* ignore */
        }
        setWsStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        setLoadError(cause instanceof Error ? cause.message : "Failed to load workspace.");
        setWsStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId, attempt]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${aiApiOrigin()}/api/chat`,
        headers: () => ({ Authorization: `Bearer ${session?.access_token ?? ""}` }),
        // Intercept non-2xx responses and surface the actual error body
        // before the AI SDK replaces it with the generic "An error occurred."
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          if (!res.ok) {
            // Clone so we can read the body without consuming the original
            let message = `HTTP ${res.status}`;
            const text = await res
              .clone()
              .text()
              .catch(() => "");
            if (text) {
              try {
                const body = JSON.parse(text) as { message?: string };
                message = body.message ?? text;
              } catch {
                message = text.slice(0, 300);
              }
            }
            throw new Error(message);
          }
          return res;
        },
      }),
    [session?.access_token],
  );

  if (wsStatus === "not_found" || wsStatus === "error") {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          {wsStatus === "not_found"
            ? "This workspace does not exist or you do not have access."
            : (loadError ?? "Failed to load workspace.")}
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-full px-4 py-2 text-xs font-semibold text-white"
          style={{ background: "var(--color-accent)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (wsStatus === "loading") {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Shimmer>Opening audit workspace…</Shimmer>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <ChatSidebar activeId={threadId} />
      <div className="min-h-0 min-w-0 flex-1">
        <Chat
          key={threadId}
          threadId={threadId}
          initial={initial}
          transport={transport}
          plan={plan}
        />
      </div>
    </div>
  );
}

function dataTransferFiles(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  return dt.files;
}

// Always call /api/chat on the same origin as the app.
// Override with VITE_AI_API_ORIGIN if you need to proxy to a separate backend.
function aiApiOrigin(): string {
  const configured = import.meta.env["VITE_AI_API_ORIGIN"] as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  // Same-origin for all deployments — avoids CORS issues on custom domains.
  return "";
}
