import { FileText, Paperclip, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AgentAttachment } from "@/lib/agent-service";

export function AttachmentChip({
  attachment,
  onRemove,
  compact,
}: {
  attachment: AgentAttachment;
  onRemove?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-xs"
      style={{ borderColor: "var(--hairline)" }}
    >
      <FileText
        size={13}
        strokeWidth={1.75}
        style={{ color: "var(--color-accent)", flexShrink: 0 }}
      />
      <span className="truncate" style={{ maxWidth: compact ? 110 : 180 }}>
        {attachment.name}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          onClick={() => onRemove(attachment.id)}
          style={{ color: "var(--ink-3)" }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  busy,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  attachments: AgentAttachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  busy: boolean;
  placeholder: string;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const canSend = !busy && !disabled && (value.trim().length > 0 || attachments.length > 0);

  const takeFiles = (files: FileList | null) => {
    if (!files?.length) return;
    onAddFiles(files);
    const names = Array.from(files)
      .map((f) => f.name)
      .slice(0, 2);
    setUploaded(
      files.length === 1
        ? `File uploaded: ${names[0]}`
        : `${files.length} files uploaded`,
    );
    window.setTimeout(() => setUploaded(null), 3500);
  };

  return (
    <div className="mx-auto w-full max-w-[720px] text-left">
      <div
        className="relative overflow-hidden rounded-[28px] bg-surface transition-[box-shadow,border-color] duration-200 focus-within:shadow-[var(--shadow-hover)]"
        style={{
          border: `1px solid ${dragging ? "var(--color-accent)" : "var(--hairline-strong)"}`,
          boxShadow: "var(--shadow-card)",
        }}
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          takeFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.txt"
          onChange={(e) => {
            takeFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 pt-4">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} onRemove={onRemoveAttachment} />
            ))}
          </div>
        )}

        <div className="px-5 pt-4 pb-1">
          <textarea
            rows={2}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSubmit();
              }
            }}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent text-base leading-relaxed outline-none"
            style={{ color: "var(--color-text)", minHeight: 56, fontFamily: "var(--font-body)" }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Attach files"
              onClick={() => inputRef.current?.click()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-[var(--accent-8)] active:scale-95"
              style={{ color: "var(--ink-2)" }}
            >
              <Paperclip size={17} strokeWidth={1.75} />
            </button>
            <span className="truncate text-xs" style={{ color: "var(--ink-3)" }}>
              PDF · PNG · CSV · XLSX — drop a file here
            </span>
          </div>

          {/* Static send arrow — no spinner; it simply rests dimmed while busy. */}
          <button
            type="button"
            aria-label="Send"
            disabled={!canSend}
            onClick={onSubmit}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-90 disabled:opacity-30"
            style={{ background: "var(--color-accent)" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {dragging && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            style={{
              background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
              border: "2px dashed var(--color-accent)",
            }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
              <Upload size={18} />
              Drop files to attach
            </div>
          </div>
        )}
      </div>
      {uploaded && (
        <p className="mt-2 text-center text-xs font-medium" style={{ color: "var(--color-accent)" }}>
          {uploaded}
        </p>
      )}
    </div>
  );
}
