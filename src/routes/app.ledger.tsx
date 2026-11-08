import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusPill } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import {
  useTransactions,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useBrokerConnections,
  useConnectBroker,
  useDeleteBroker,
  type TransactionInput,
  type BrokerInput,
} from "@/lib/data-hooks";
import type { TxAction } from "@/lib/demo-data";

export const Route = createFileRoute("/app/ledger")({
  component: Ledger,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = "trade_date" | "ticker" | "action" | "quantity" | "price" | "confidence_score";

interface TxRow {
  id: string;
  ticker: string;
  action: TxAction;
  quantity: number;
  price: number;
  fees: number;
  wht: number;
  trade_date: string;
  ref_id: string;
  broker: string;
  exchange: string;
  confidence_score: number;
  status: "posted" | "needs_review";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  const tone = score >= 0.9 ? "ok" : score >= 0.75 ? "warn" : "bad";
  return <StatusPill tone={tone}>{score.toFixed(2)}</StatusPill>;
}

function ActionBadge({ action }: { action: TxAction }) {
  const map: Record<TxAction, { tone: "ok" | "bad" | "info" | "warn"; label: string }> = {
    BUY: { tone: "info", label: "BUY" },
    SELL: { tone: "ok", label: "SELL" },
    DIV: { tone: "warn", label: "DIV" },
  };
  const { tone, label } = map[action];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

function relativeDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", { dateStyle: "medium" });
}

// ─── Empty transaction form defaults ─────────────────────────────────────────

const EMPTY_FORM: TransactionInput & { notes?: string } = {
  ticker: "",
  action: "BUY",
  quantity: 0,
  price: 0,
  fees: 0,
  wht: 0,
  trade_date: new Date().toISOString().slice(0, 10),
  ref_id: "",
  broker: "",
  exchange: "PSX",
};

// ─── Transaction Form Modal ───────────────────────────────────────────────────

function TxFormModal({
  mode,
  initial,
  brokers,
  onClose,
  onSave,
  saving,
}: {
  mode: "add" | "edit";
  initial: TransactionInput & { notes?: string };
  brokers: { id: string; name: string; broker_name: string }[];
  onClose: () => void;
  onSave: (values: TransactionInput & { notes?: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);

  const set = (k: keyof typeof form, v: string | number): void =>
    setForm((f) => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker.trim()) {
      toast.error("Ticker is required");
      return;
    }
    if (!form.trade_date) {
      toast.error("Trade date is required");
      return;
    }
    if (form.quantity <= 0) {
      toast.error("Quantity must be > 0");
      return;
    }
    if (form.price <= 0) {
      toast.error("Price must be > 0");
      return;
    }
    onSave(form);
  }

  const fieldClass =
    "w-full rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-25)]";

  const labelClass = "block text-xs font-semibold mb-1.5";

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
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl"
        style={{ border: "1px solid var(--hairline)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 items-center justify-center rounded-xl"
              style={{ background: "var(--accent-10)" }}
            >
              {mode === "add" ? (
                <Plus size={16} style={{ color: "var(--color-accent)" }} />
              ) : (
                <Edit2 size={16} style={{ color: "var(--color-accent)" }} />
              )}
            </span>
            <h2 className="text-sm font-bold">
              {mode === "add" ? "Add Transaction" : "Edit Transaction"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-surface-hover"
          >
            <X size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            {/* Ticker */}
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Ticker <span style={{ color: "var(--bad)" }}>*</span>
              </label>
              <input
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                value={form.ticker}
                onChange={(e) => set("ticker", e.target.value.toUpperCase())}
                placeholder="e.g. OGDC"
                required
                autoFocus
              />
            </div>

            {/* Action */}
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Action <span style={{ color: "var(--bad)" }}>*</span>
              </label>
              <div className="flex gap-2">
                {(["BUY", "SELL", "DIV"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set("action", a)}
                    className="flex-1 rounded-xl border py-2 text-xs font-semibold transition-all"
                    style={{
                      borderColor: form.action === a ? "var(--color-accent)" : "var(--hairline)",
                      background: form.action === a ? "var(--accent-8)" : "var(--surface)",
                      color: form.action === a ? "var(--color-accent)" : "var(--ink-2)",
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Quantity <span style={{ color: "var(--bad)" }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                value={form.quantity || ""}
                onChange={(e) => set("quantity", parseFloat(e.target.value) || 0)}
                placeholder="500"
                required
              />
            </div>

            {/* Price */}
            <div>
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Price <span style={{ color: "var(--bad)" }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                value={form.price || ""}
                onChange={(e) => set("price", parseFloat(e.target.value) || 0)}
                placeholder="125.50"
                required
              />
            </div>

            {/* Fees */}
            <div>
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Fees
              </label>
              <input
                type="number"
                min="0"
                step="any"
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                value={form.fees || ""}
                onChange={(e) => set("fees", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            {/* WHT */}
            <div>
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                WHT
              </label>
              <input
                type="number"
                min="0"
                step="any"
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                value={form.wht || ""}
                onChange={(e) => set("wht", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            {/* Trade Date */}
            <div>
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Trade Date <span style={{ color: "var(--bad)" }}>*</span>
              </label>
              <input
                type="date"
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                value={form.trade_date}
                onChange={(e) => set("trade_date", e.target.value)}
                required
              />
            </div>

            {/* Ref ID */}
            <div>
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Reference ID
              </label>
              <input
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                value={form.ref_id}
                onChange={(e) => set("ref_id", e.target.value)}
                placeholder="TRD-20240912"
              />
            </div>

            {/* Broker */}
            <div>
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Broker
              </label>
              {brokers.length > 0 ? (
                <select
                  className={fieldClass}
                  style={{ borderColor: "var(--hairline)" }}
                  value={form.broker}
                  onChange={(e) => set("broker", e.target.value)}
                >
                  <option value="">— select broker —</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.broker_name}>
                      {b.name} ({b.broker_name})
                    </option>
                  ))}
                  <option value="__custom">Other (type below)</option>
                </select>
              ) : (
                <input
                  className={fieldClass}
                  style={{ borderColor: "var(--hairline)" }}
                  value={form.broker}
                  onChange={(e) => set("broker", e.target.value)}
                  placeholder="Arif Habib, etc."
                />
              )}
            </div>

            {/* Exchange */}
            <div>
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Exchange
              </label>
              <select
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                value={form.exchange}
                onChange={(e) => set("exchange", e.target.value)}
              >
                <option value="PSX">PSX</option>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className={labelClass} style={{ color: "var(--ink-2)" }}>
                Notes
              </label>
              <textarea
                className={`${fieldClass} resize-none`}
                style={{ borderColor: "var(--hairline)" }}
                rows={2}
                value={(form as { notes?: string }).notes ?? ""}
                onChange={(e) => set("notes" as keyof typeof form, e.target.value)}
                placeholder="Optional context for this record…"
              />
            </div>
          </div>

          {/* Footer */}
          <div
            className="mt-5 flex items-center justify-end gap-3 pt-4"
            style={{ borderTop: "1px solid var(--hairline)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-hover"
              style={{ borderColor: "var(--hairline)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-accent)" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {mode === "add" ? "Add Record" : "Save Changes"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  ticker,
  onClose,
  onConfirm,
  deleting,
}: {
  ticker: string;
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
          <AlertTriangle size={18} style={{ color: "var(--bad)" }} />
        </div>
        <h3 className="mb-1 text-sm font-bold">Delete transaction?</h3>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          This will permanently remove <strong>{ticker}</strong> from your ledger and cannot be
          undone.
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
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Broker Panel ─────────────────────────────────────────────────────────────

function BrokerPanel({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { data: brokers = [], isLoading } = useBrokerConnections(orgId);
  const connect = useConnectBroker();
  const deleteBroker = useDeleteBroker();
  const [form, setForm] = useState<BrokerInput>({
    name: "",
    broker_name: "",
    currency: "PKR",
    exchange: "PSX",
    external_ref: "",
  });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const set = (k: keyof BrokerInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.broker_name.trim()) {
      toast.error("Account name and broker name are required");
      return;
    }
    try {
      await connect.mutateAsync({ orgId, broker: form });
      toast.success("Broker account added");
      setForm({ name: "", broker_name: "", currency: "PKR", exchange: "PSX", external_ref: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add broker");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteBroker.mutateAsync({ id, orgId });
      toast.success("Broker account removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove broker");
    } finally {
      setConfirmDelete(null);
    }
  }

  const fieldClass =
    "w-full rounded-xl border bg-surface px-3 py-2 text-sm outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--accent-25)]";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-start sm:pt-16 sm:pr-6">
      <motion.div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
        style={{ border: "1px solid var(--hairline)", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: "var(--color-accent)" }} />
            <span className="text-sm font-bold">Broker Accounts</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-surface-hover">
            <X size={15} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Existing brokers */}
          <div className="px-4 py-3">
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--ink-3)" }}
            >
              Connected accounts
            </p>
            {isLoading ? (
              <div
                className="flex items-center gap-2 py-4 text-xs"
                style={{ color: "var(--ink-3)" }}
              >
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            ) : brokers.length === 0 ? (
              <p className="py-3 text-xs" style={{ color: "var(--ink-3)" }}>
                No broker accounts yet.
              </p>
            ) : (
              <div className="space-y-2">
                {brokers.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{
                      border: "1px solid var(--hairline)",
                      background: "var(--color-login-bg)",
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                        {b.broker_name} · {b.exchange} · {b.currency}
                        {b.external_ref ? ` · ${b.external_ref}` : ""}
                      </p>
                    </div>
                    {confirmDelete === b.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-white"
                          style={{ background: "var(--bad)", color: "#fff" }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-lg px-2 py-1 text-xs"
                          style={{ color: "var(--ink-2)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(b.id)}
                        className="rounded-lg p-1.5 hover:bg-surface-hover"
                        aria-label="Delete broker"
                      >
                        <Trash2 size={13} strokeWidth={1.75} style={{ color: "var(--bad)" }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add broker form */}
          <form
            onSubmit={handleAdd}
            className="border-t px-4 py-4"
            style={{ borderColor: "var(--hairline)" }}
          >
            <p
              className="mb-3 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--ink-3)" }}
            >
              Add new account
            </p>
            <div className="space-y-2.5">
              <input
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                placeholder="Account name *"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
              <input
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                placeholder="Broker name *  (e.g. Arif Habib)"
                value={form.broker_name}
                onChange={(e) => set("broker_name", e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={fieldClass}
                  style={{ borderColor: "var(--hairline)" }}
                  value={form.exchange}
                  onChange={(e) => set("exchange", e.target.value)}
                >
                  <option value="PSX">PSX</option>
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                  <option value="OTHER">Other</option>
                </select>
                <select
                  className={fieldClass}
                  style={{ borderColor: "var(--hairline)" }}
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  <option value="PKR">PKR</option>
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <input
                className={fieldClass}
                style={{ borderColor: "var(--hairline)" }}
                placeholder="Account / reference ID (optional)"
                value={form.external_ref ?? ""}
                onChange={(e) => set("external_ref", e.target.value)}
              />
              <button
                type="submit"
                disabled={connect.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--color-accent)" }}
              >
                {connect.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Add Account
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ─── CSV / Doc Import Panel ───────────────────────────────────────────────────

function ImportPanel({
  orgId,
  onClose,
  onImported,
}: {
  orgId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "parsing" | "review" | "saving" | "done">("idle");
  const [parsed, setParsed] = useState<(TransactionInput & { _raw?: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function addSheet() {
    setError(null);
    const res = await fetch("/api/sheets-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sheetUrl.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as { csv?: string; error?: string };
    if (!res.ok || !json.csv) return setError(json.error ?? "Couldn't import that sheet.");
    addFiles([new File([json.csv], "google-sheet.csv", { type: "text/csv" })]);
    setSheetUrl("");
    toast.success("Google Sheet added");
  }
  const createTx = useCreateTransaction();
  const { profile } = useAuth();

  const accept = ".csv,.xlsx,.xls,.txt";

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...arr.filter((f) => !names.has(f.name))];
    });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function parseFiles() {
    if (files.length === 0) return;
    setStatus("parsing");
    setError(null);

    try {
      const results: (TransactionInput & { _raw?: string })[] = [];
      const spreadsheetFiles = files.filter((file) =>
        /\\.(csv|xlsx|xls)$/i.test(file.name),
      );
      const textFiles = files.filter((file) => !/\\.(csv|xlsx|xls)$/i.test(file.name));

      // CSV and Excel imports are deterministic: no AI provider/key/quota is
      // required to turn a spreadsheet with headers into ledger rows.
      if (spreadsheetFiles.length > 0) {
        const XLSX = await import("xlsx");
        const aliases: Record<string, string[]> = {
          ticker: ["ticker", "symbol", "stock", "security", "scrip", "company"],
          action: ["action", "side", "transaction type", "type", "buy sell", "trade type"],
          quantity: ["quantity", "qty", "shares", "units", "volume"],
          price: ["price", "rate", "trade price", "avg price", "average price"],
          fees: ["fees", "fee", "commission", "brokerage", "charges"],
          wht: ["wht", "tax", "withholding tax", "withholding", "withholding tax amount"],
          trade_date: ["trade date", "date", "transaction date", "order date", "settlement date"],
          ref_id: ["ref id", "reference", "reference id", "order id", "trade id", "contract no"],
          broker: ["broker", "broker name", "member", "dealer"],
          exchange: ["exchange", "market"],
        };
        const numberValue = (value: unknown): number => {
          const cleaned = String(value ?? "").replace(/[,\\s]/g, "").replace(/[^0-9.\\-]/g, "");
          const parsed = Number(cleaned);
          return Number.isFinite(parsed) ? parsed : 0;
        };
        const dateValue = (value: unknown): string => {
          if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
          const raw = String(value ?? "").trim();
          if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return raw;
          const parsed = new Date(raw);
          return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
        };

        for (const file of spreadsheetFiles) {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
              defval: "",
              raw: false,
            });
            for (const source of rows) {
              const normalized = new Map(
                Object.entries(source).map(([key, value]) => [
                  key.toLowerCase().replace(/[_\\-]+/g, " ").trim(),
                  value,
                ]),
              );
              const pick = (field: string): unknown => {
                for (const alias of aliases[field] ?? [field]) {
                  if (normalized.has(alias)) return normalized.get(alias);
                }
                return "";
              };
              const ticker = String(pick("ticker") ?? "").trim().toUpperCase();
              const quantity = numberValue(pick("quantity"));
              const price = numberValue(pick("price"));
              if (!ticker || quantity <= 0 || price <= 0) continue;
              const rawAction = String(pick("action") ?? "BUY").trim().toUpperCase();
              const action = /^(S|SELL|SALE|SOLD)$/.test(rawAction)
                ? "SELL"
                : /^(D|DIV|DIVIDEND)$/.test(rawAction)
                  ? "DIV"
                  : "BUY";
              results.push({
                ticker,
                action,
                quantity,
                price,
                fees: numberValue(pick("fees")),
                wht: numberValue(pick("wht")),
                trade_date: dateValue(pick("trade_date")),
                ref_id: String(pick("ref_id") ?? "").trim(),
                broker: String(pick("broker") ?? "").trim(),
                exchange: String(pick("exchange") ?? "PSX").trim() || "PSX",
                _raw: file.name,
              });
            }
          }
        }
      }

      // Plain-text statements still use the server-side AI extractor.
      if (textFiles.length > 0) {
        const { complete } = await import("@/lib/groq-client");
        for (const file of textFiles) {
          const content = await file.text();
          const raw = await complete({
            systemPrompt:
              "You extract brokerage transactions. Reply with ONLY a JSON array, no prose.",
            userPrompt: `Extract ALL transactions from this financial document as a JSON array. Each object must have: ticker, action (BUY/SELL/DIV), quantity, price, fees, wht, trade_date (YYYY-MM-DD), ref_id, broker, exchange.\\n\\n${content.slice(0, 50000)}`,
          });
          const clean = raw.replace(/\`\`\`[a-z]*\\n?/g, "").replace(/\`\`\`/g, "").trim();
          let rows: unknown[] = [];
          try {
            rows = JSON.parse(clean) as unknown[];
          } catch {
            throw new Error(`${file.name}: AI returned invalid transaction data. Try CSV or Excel format.`);
          }
          for (const row of rows) {
            const r = row as Record<string, unknown>;
            const ticker = String(r["ticker"] ?? "").trim().toUpperCase();
            const quantity = Number(r["quantity"] ?? 0);
            const price = Number(r["price"] ?? 0);
            if (!ticker || quantity <= 0 || price <= 0) continue;
            results.push({
              ticker,
              action: (["BUY", "SELL", "DIV"].includes(String(r["action"]).toUpperCase())
                ? String(r["action"]).toUpperCase()
                : "BUY") as "BUY" | "SELL" | "DIV",
              quantity,
              price,
              fees: Number(r["fees"] ?? 0),
              wht: Number(r["wht"] ?? 0),
              trade_date: String(r["trade_date"] ?? new Date().toISOString().slice(0, 10)),
              ref_id: String(r["ref_id"] ?? ""),
              broker: String(r["broker"] ?? ""),
              exchange: String(r["exchange"] ?? "PSX"),
              _raw: file.name,
            });
          }
        }
      }

      if (results.length === 0) {
        setError("No transactions could be extracted from the uploaded files.");
        setStatus("idle");
        return;
      }

      setParsed(results);
      setStatus("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parsing failed");
      setStatus("idle");
    }
  }

  async function saveAll() {
    if (!orgId) {
      setError("Your workspace is still loading. Refresh the page and try again.");
      return;
    }
    setStatus("saving");
    let saved = 0;
    const failures: string[] = [];
    for (const [index, row] of parsed.entries()) {
      try {
        await createTx.mutateAsync({ orgId, values: row });
        saved++;
      } catch (cause) {
        failures.push(`Row ${index + 1} (${row.ticker || "unknown ticker"}): ${cause instanceof Error ? cause.message : "Save failed"}`);
      }
    }
    if (saved > 0) {
      toast.success(`${saved} of ${parsed.length} transactions imported`);
      onImported();
    }
    if (failures.length > 0) {
      const detail = failures.slice(0, 4).join(" • ");
      setError(`${saved} saved; ${failures.length} failed. ${detail}`);
      toast.error(`${failures.length} transaction(s) could not be saved`);
      setStatus("review");
      return;
    }
    setStatus("done");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={status === "idle" || status === "done" ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl"
        style={{ border: "1px solid var(--hairline)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 items-center justify-center rounded-xl"
              style={{ background: "var(--accent-10)" }}
            >
              <Upload size={15} style={{ color: "var(--color-accent)" }} />
            </span>
            <h2 className="text-sm font-bold">Import Records</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-surface-hover">
            <X size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {/* ── Upload zone ── */}
          {(status === "idle" || status === "parsing") && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors"
                style={{
                  borderColor: dragging ? "var(--color-accent)" : "var(--hairline)",
                  background: dragging ? "var(--accent-4)" : "var(--color-login-bg)",
                }}
              >
                <Paperclip
                  size={28}
                  strokeWidth={1.5}
                  style={{ color: dragging ? "var(--color-accent)" : "var(--ink-3)" }}
                />
                <p className="mt-3 text-sm font-medium">
                  Drop files here or <span style={{ color: "var(--color-accent)" }}>browse</span>
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                  CSV, Excel (.xlsx) or text files. PDFs and images go in the Wab chat.
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={accept}
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="Or paste a Google Sheets link (shared: anyone with the link)"
                  aria-label="Google Sheets link"
                  className="flex-1 rounded-full border px-3.5 py-2 text-xs outline-none"
                  style={{ borderColor: "var(--hairline)" }}
                />
                <button
                  type="button"
                  onClick={addSheet}
                  disabled={!sheetUrl.trim()}
                  className="rounded-full border px-3.5 py-2 text-xs font-medium disabled:opacity-50"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  Add sheet
                </button>
              </div>

              {files.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {files.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                      style={{
                        background: "var(--color-login-bg)",
                        border: "1px solid var(--hairline)",
                      }}
                    >
                      <FileText size={13} style={{ color: "var(--ink-3)" }} />
                      <span className="flex-1 truncate font-medium">{f.name}</span>
                      <span style={{ color: "var(--ink-3)" }}>{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles((p) => p.filter((x) => x.name !== f.name));
                        }}
                        className="rounded p-0.5 hover:bg-surface-hover"
                      >
                        <X size={11} strokeWidth={2} style={{ color: "var(--ink-3)" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div
                  className="mt-3 flex items-start gap-2 rounded-xl px-3 py-3 text-xs"
                  style={{
                    background: "color-mix(in srgb, var(--bad) 6%, transparent)",
                    color: "var(--bad)",
                  }}
                >
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-3">
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
                  onClick={parseFiles}
                  disabled={files.length === 0 || status === "parsing"}
                  className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--color-accent)" }}
                >
                  {status === "parsing" ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Parsing…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Parse with AI
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* ── Review parsed results ── */}
          {status === "review" && (
            <>
              <div className="mb-4 flex items-center gap-2">
                <Check size={15} style={{ color: "var(--ok)" }} />
                <p className="text-sm font-semibold">
                  {parsed.length} transaction{parsed.length !== 1 ? "s" : ""} extracted — review
                  before saving
                </p>
              </div>
              <div
                className="max-h-64 overflow-y-auto rounded-xl"
                style={{ border: "1px solid var(--hairline)" }}
              >
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr
                      style={{
                        background: "var(--color-login-bg)",
                        borderBottom: "1px solid var(--hairline)",
                      }}
                    >
                      {["Ticker", "Action", "Qty", "Price", "Date", "Broker"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-semibold"
                          style={{ color: "var(--ink-2)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--hairline)" }}>
                        <td className="px-3 py-2 font-semibold">
                          {row.ticker || <span style={{ color: "var(--bad)" }}>MISSING</span>}
                        </td>
                        <td className="px-3 py-2">{row.action}</td>
                        <td className="px-3 py-2 tabular-nums">{row.quantity}</td>
                        <td className="px-3 py-2 tabular-nums">{row.price}</td>
                        <td className="px-3 py-2">{row.trade_date}</td>
                        <td
                          className="px-3 py-2 truncate max-w-[80px]"
                          style={{ color: "var(--ink-3)" }}
                        >
                          {row.broker || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStatus("idle");
                    setParsed([]);
                  }}
                  className="text-xs"
                  style={{ color: "var(--ink-3)" }}
                >
                  ← Back
                </button>
                <div className="flex gap-3">
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
                    onClick={saveAll}
                    className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white"
                    style={{ background: "var(--color-accent)" }}
                  >
                    <Check size={14} />
                    Save {parsed.length} records
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Saving ── */}
          {status === "saving" && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Loader2
                size={28}
                className="animate-spin"
                style={{ color: "var(--color-accent)" }}
              />
              <p className="text-sm font-medium">Saving records to your ledger…</p>
            </div>
          )}

          {/* ── Done ── */}
          {status === "done" && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div
                className="flex size-12 items-center justify-center rounded-2xl"
                style={{ background: "color-mix(in srgb, var(--ok) 10%, transparent)" }}
              >
                <Check size={22} style={{ color: "var(--ok)" }} />
              </div>
              <p className="text-sm font-semibold">Import complete!</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-5 py-2 text-sm font-semibold text-white"
                style={{ background: "var(--color-accent)" }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Sparkles used inside ImportPanel ─────────────────────────────────────────
import { Sparkles } from "lucide-react";

// ─── Main Ledger Page ─────────────────────────────────────────────────────────

function Ledger() {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? "";

  const { data: transactions = [], isLoading, refetch } = useTransactions(orgId || undefined);
  const { data: brokers = [] } = useBrokerConnections(orgId || undefined);
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();

  // UI state
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("trade_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [actionFilter, setActionFilter] = useState<TxAction | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"all" | "posted" | "needs_review">("all");
  const [rowMenu, setRowMenu] = useState<string | null>(null);

  // Modal state
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<TxRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<TxRow | null>(null);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const filtered = (transactions as TxRow[]).filter((t) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      t.ticker.toLowerCase().includes(q) ||
      t.ref_id.toLowerCase().includes(q) ||
      t.broker.toLowerCase().includes(q);
    const matchAction = actionFilter === "ALL" || t.action === actionFilter;
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchAction && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = a[sortKey] as string | number;
    let bv: string | number = b[sortKey] as string | number;
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  // CSV export
  function exportCSV() {
    const headers = [
      "ticker",
      "action",
      "quantity",
      "price",
      "fees",
      "wht",
      "trade_date",
      "ref_id",
      "broker",
      "exchange",
      "status",
      "confidence_score",
    ];
    const rows = sorted.map((t) =>
      [
        t.ticker,
        t.action,
        t.quantity,
        t.price,
        t.fees,
        t.wht,
        t.trade_date,
        t.ref_id,
        t.broker,
        t.exchange,
        t.status,
        t.confidence_score,
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wab-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Ledger exported as CSV");
  }

  async function exportXLSX() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      sorted.map((t) => ({
        Ticker: t.ticker,
        Action: t.action,
        Quantity: t.quantity,
        Price: t.price,
        Fees: t.fees,
        WHT: t.wht,
        "Trade date": t.trade_date,
        Reference: t.ref_id,
        Broker: t.broker,
        Exchange: t.exchange,
        Status: t.status,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `wab-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Ledger exported for Excel / Google Sheets");
  }

  // Add transaction
  async function handleAdd(values: TransactionInput & { notes?: string }) {
    if (!orgId) return;
    try {
      await createTx.mutateAsync({ orgId, values });
      toast.success(`${values.ticker} added to ledger`);
      setAddOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add transaction");
    }
  }

  // Edit transaction
  async function handleEdit(values: TransactionInput & { notes?: string }) {
    if (!editRow || !orgId) return;
    try {
      await updateTx.mutateAsync({ id: editRow.id, orgId, values });
      toast.success(`${values.ticker} updated`);
      setEditRow(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update transaction");
    }
  }

  // Delete transaction
  async function handleDelete() {
    if (!deleteRow || !orgId) return;
    try {
      await deleteTx.mutateAsync({ id: deleteRow.id, orgId });
      toast.success(`${deleteRow.ticker} removed from ledger`);
      setDeleteRow(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete transaction");
    }
  }

  const th = "px-4 py-3 text-left text-xs font-semibold cursor-pointer select-none";
  const needsReview = (transactions as TxRow[]).filter((t) => t.status === "needs_review").length;

  return (
    <div className="space-y-4 p-3 sm:p-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Ledger</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--ink-2)" }}>
            {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
            {needsReview > 0 && (
              <span style={{ color: "var(--warn)" }}>
                {" "}
                · {needsReview} need{needsReview === 1 ? "s" : ""} review
              </span>
            )}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Broker accounts */}
          <button
            type="button"
            onClick={() => setBrokerOpen(true)}
            className="flex items-center gap-2 rounded-full border bg-surface px-3.5 py-2 text-xs font-medium transition-shadow hover:shadow-md"
            style={{ borderColor: "var(--hairline)" }}
          >
            <Building2 size={14} strokeWidth={1.75} style={{ color: "var(--ink-2)" }} />
            <span className="hidden sm:inline">Brokers</span>
            {brokers.length > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: "var(--accent-10)", color: "var(--color-accent)" }}
              >
                {brokers.length}
              </span>
            )}
          </button>

          {/* Import */}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-full border bg-surface px-3.5 py-2 text-xs font-medium transition-shadow hover:shadow-md"
            style={{ borderColor: "var(--hairline)" }}
          >
            <Upload size={14} strokeWidth={1.75} style={{ color: "var(--ink-2)" }} />
            <span className="hidden sm:inline">Import</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-full border bg-surface px-3.5 py-2 text-xs font-medium transition-shadow hover:shadow-md"
            style={{ borderColor: "var(--hairline)" }}
          >
            <Download size={14} strokeWidth={1.75} style={{ color: "var(--ink-2)" }} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            type="button"
            onClick={exportXLSX}
            className="flex items-center gap-2 rounded-full border bg-surface px-3.5 py-2 text-xs font-medium transition-shadow hover:shadow-md"
            style={{ borderColor: "var(--hairline)" }}
          >
            <Download size={14} strokeWidth={1.75} style={{ color: "var(--ink-2)" }} />
            <span className="hidden sm:inline">Excel</span>
          </button>

          {/* Add transaction */}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white"
            style={{
              background: "var(--color-accent)",
              boxShadow: "var(--shadow-accent)",
            }}
          >
            <Plus size={14} strokeWidth={2} />
            Add Record
          </button>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!isLoading && transactions.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center gap-5 rounded-2xl bg-surface py-16 text-center"
          style={{ border: "1px solid var(--hairline)" }}
        >
          <div
            className="flex size-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--accent-8)" }}
          >
            <BookOpen size={24} strokeWidth={1.5} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold">Your ledger is empty</p>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
              Add records manually or import a broker statement to get started.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--hairline)" }}
            >
              <Upload size={14} /> Import file
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--color-accent)" }}
            >
              <Plus size={14} /> Add manually
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Filters ── */}
      {transactions.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4"
          style={{ border: "1px solid var(--hairline)" }}
        >
          <div
            className="flex flex-1 items-center gap-2 rounded-xl border bg-surface px-3 py-2"
            style={{ borderColor: "var(--hairline)", minWidth: 200 }}
          >
            <Search size={14} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
            <input
              type="text"
              placeholder="Search ticker, ref ID, broker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                <X size={12} style={{ color: "var(--ink-3)" }} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Filter size={13} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
            {(["ALL", "BUY", "SELL", "DIV"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setActionFilter(a)}
                className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  background: actionFilter === a ? "var(--color-accent)" : "var(--color-login-bg)",
                  color: actionFilter === a ? "var(--accent-fg)" : "var(--ink-2)",
                }}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {(["all", "posted", "needs_review"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className="rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors"
                style={{
                  background: statusFilter === s ? "var(--color-accent)" : "var(--color-login-bg)",
                  color: statusFilter === s ? "var(--accent-fg)" : "var(--ink-2)",
                }}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>

          {(search || actionFilter !== "ALL" || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setActionFilter("ALL");
                setStatusFilter("all");
              }}
              className="text-xs"
              style={{ color: "var(--ink-3)" }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Loading state ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        </div>
      )}

      {/* ── Table ── */}
      {!isLoading && transactions.length > 0 && (
        <div
          className="overflow-x-auto rounded-2xl bg-surface"
          style={{ border: "1px solid var(--hairline)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--hairline)",
                    background: "var(--color-login-bg)",
                  }}
                >
                  <th className={th} onClick={() => toggleSort("ticker")}>
                    <span className="flex items-center gap-1">
                      Ticker <SortIcon col="ticker" />
                    </span>
                  </th>
                  <th className={th} onClick={() => toggleSort("action")}>
                    <span className="flex items-center gap-1">
                      Action <SortIcon col="action" />
                    </span>
                  </th>
                  <th className={`${th} text-right`} onClick={() => toggleSort("quantity")}>
                    <span className="flex items-center justify-end gap-1">
                      Qty <SortIcon col="quantity" />
                    </span>
                  </th>
                  <th className={`${th} text-right`} onClick={() => toggleSort("price")}>
                    <span className="flex items-center justify-end gap-1">
                      Price <SortIcon col="price" />
                    </span>
                  </th>
                  <th className={`${th} text-right hidden sm:table-cell`}>Fees</th>
                  <th className={`${th} text-right hidden sm:table-cell`}>WHT</th>
                  <th className={th} onClick={() => toggleSort("trade_date")}>
                    <span className="flex items-center gap-1">
                      Date <SortIcon col="trade_date" />
                    </span>
                  </th>
                  <th className={`${th} hidden md:table-cell`}>Ref / Broker</th>
                  <th className={th} onClick={() => toggleSort("confidence_score")}>
                    <span className="flex items-center gap-1">
                      Conf. <SortIcon col="confidence_score" />
                    </span>
                  </th>
                  <th className={th}>Status</th>
                  <th className={`${th} w-10`} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((tx, i) => (
                  <motion.tr
                    key={tx.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    style={{ borderBottom: "1px solid var(--hairline)" }}
                    className="ledger-row transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-semibold">{tx.ticker}</td>
                    <td className="px-4 py-3">
                      <ActionBadge action={tx.action} />
                    </td>
                    <td className="tnum px-4 py-3 text-right text-sm">
                      {tx.quantity.toLocaleString()}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-sm">
                      {tx.price.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className="tnum px-4 py-3 text-right text-sm hidden sm:table-cell"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {tx.fees > 0 ? tx.fees.toLocaleString() : "—"}
                    </td>
                    <td
                      className="tnum px-4 py-3 text-right text-sm hidden sm:table-cell"
                      style={{ color: tx.wht > 0 ? "var(--warn)" : "var(--ink-3)" }}
                    >
                      {tx.wht > 0 ? tx.wht.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--ink-2)" }}>
                      {relativeDate(tx.trade_date)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="font-mono text-xs" style={{ color: "var(--ink-3)" }}>
                        {tx.ref_id || "—"}
                      </p>
                      {tx.broker && (
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                          {tx.broker}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBadge score={tx.confidence_score} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={tx.status === "posted" ? "ok" : "warn"}>
                        {tx.status === "posted" ? "Posted" : "Review"}
                      </StatusPill>
                    </td>

                    {/* Row menu */}
                    <td className="relative px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setRowMenu(rowMenu === tx.id ? null : tx.id)}
                        className="rounded-lg p-1.5 transition-colors hover:bg-surface-hover"
                        aria-label="Row actions"
                      >
                        <MoreHorizontal size={16} strokeWidth={1.75} />
                      </button>

                      <AnimatePresence>
                        {rowMenu === tx.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.12 }}
                            className="absolute right-3 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl shadow-lg"
                            style={{ border: "1px solid var(--hairline)", background: "var(--surface)" }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setEditRow(tx);
                                setRowMenu(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-surface-hover"
                            >
                              <Edit2
                                size={13}
                                strokeWidth={1.75}
                                style={{ color: "var(--color-accent)" }}
                              />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteRow(tx);
                                setRowMenu(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-surface-hover"
                              style={{ color: "var(--bad)" }}
                            >
                              <Trash2 size={13} strokeWidth={1.75} />
                              Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {sorted.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                No transactions match your filters.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {addOpen && (
          <TxFormModal
            mode="add"
            initial={{ ...EMPTY_FORM }}
            brokers={brokers as { id: string; name: string; broker_name: string }[]}
            onClose={() => setAddOpen(false)}
            onSave={handleAdd}
            saving={createTx.isPending}
          />
        )}

        {editRow && (
          <TxFormModal
            mode="edit"
            initial={{
              ticker: editRow.ticker,
              action: editRow.action,
              quantity: editRow.quantity,
              price: editRow.price,
              fees: editRow.fees,
              wht: editRow.wht,
              trade_date: editRow.trade_date,
              ref_id: editRow.ref_id,
              broker: editRow.broker,
              exchange: editRow.exchange,
            }}
            brokers={brokers as { id: string; name: string; broker_name: string }[]}
            onClose={() => setEditRow(null)}
            onSave={handleEdit}
            saving={updateTx.isPending}
          />
        )}

        {deleteRow && (
          <DeleteConfirmModal
            ticker={deleteRow.ticker}
            onClose={() => setDeleteRow(null)}
            onConfirm={handleDelete}
            deleting={deleteTx.isPending}
          />
        )}

        {brokerOpen && <BrokerPanel orgId={orgId} onClose={() => setBrokerOpen(false)} />}

        {importOpen && (
          <ImportPanel
            orgId={orgId}
            onClose={() => setImportOpen(false)}
            onImported={() => {
              void refetch();
              setImportOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Close row menu on outside click */}
      {rowMenu && <div className="fixed inset-0 z-10" onClick={() => setRowMenu(null)} />}
    </div>
  );
}
