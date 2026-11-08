import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useChatThreads, useDeleteChatThread } from "@/lib/data-hooks";
import { supabase } from "@/lib/supabase";

function groupLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Older";
}

export function ChatSidebar({ activeId }: { activeId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: threads = [], isLoading } = useChatThreads(user?.id);
  const del = useDeleteChatThread();
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = new Map<string, typeof threads>();
    for (const t of threads) {
      if (q && !(t.title ?? "").toLowerCase().includes(q)) continue;
      const k = groupLabel(t.updated_at ?? t.created_at);
      out.set(k, [...(out.get(k) ?? []), t]);
    }
    return [...out.entries()];
  }, [threads, query]);

  async function newChat() {
    if (!user || creating) return;
    setCreating(true);
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!prof?.org_id) throw new Error("Workspace not ready yet");
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: user.id, org_id: prof.org_id, title: "New chat" } as never)
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Could not create chat");
      await qc.invalidateQueries({ queryKey: ["chat_threads", user.id] });
      navigate({ to: "/app/parser/$threadId", params: { threadId: data.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create chat");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!user) return;
    try {
      await del.mutateAsync({ threadId: id, userId: user.id });
      if (id === activeId) {
        const next = threads.find((t) => t.id !== id);
        if (next) navigate({ to: "/app/parser/$threadId", params: { threadId: next.id } });
        else navigate({ to: "/app/parser" });
      }
    } catch {
      toast.error("Couldn't delete chat");
    }
  }

  if (!open) {
    return (
      <div
        className="hidden shrink-0 flex-col items-center gap-2 border-r p-2 md:flex"
        style={{ borderColor: "var(--sidebar-border)", background: "var(--sidebar)" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Show chats"
          className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
        >
          <PanelLeftOpen size={16} />
        </button>
        <button
          type="button"
          onClick={newChat}
          aria-label="New chat"
          className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Plus size={16} />
        </button>
      </div>
    );
  }

  return (
    <aside
      className="hidden h-full min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r md:flex"
      style={{ borderColor: "var(--sidebar-border)", background: "var(--sidebar)" }}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={newChat}
          disabled={creating}
          className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-[var(--accent-6)] active:scale-[0.99] disabled:opacity-60"
        >
          <Plus size={15} /> New chat
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide chats"
          className="flex size-9 items-center justify-center rounded-lg hover:bg-muted"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 transition-colors duration-150 focus-within:bg-[var(--accent-6)]"
          style={{ background: "var(--accent-4)" }}
        >
          <Search size={13} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-2 pb-3">
        {isLoading && <p className="px-2 py-3 text-xs text-muted-foreground">Loading chats…</p>}
        {!isLoading && groups.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No chats yet</p>
        )}
        {groups.map(([label, items]) => (
          <div key={label} className="mb-3">
            <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {items.map((t) => (
              <div
                key={t.id}
                className={`group flex items-center rounded-xl transition-colors duration-150 ${t.id === activeId ? "bg-[var(--accent-8)]" : "hover:bg-[var(--accent-5)]"}`}
              >
                <Link
                  to="/app/parser/$threadId"
                  params={{ threadId: t.id }}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-sm"
                >
                  <MessageSquare size={13} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{t.title || "New chat"}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(t.id)}
                  aria-label="Delete chat"
                  className="mr-1 hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive group-hover:flex"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
