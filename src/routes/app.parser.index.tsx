import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/utils";

export const Route = createFileRoute("/app/parser/")({
  component: ParserIndex,
});

const LAST_THREAD_KEY = "wab.last.chat.thread";

function readLastThread(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_THREAD_KEY);
  } catch {
    return null;
  }
}

function writeLastThread(id: string) {
  try {
    window.sessionStorage.setItem(LAST_THREAD_KEY, id);
  } catch {
    // Workspace routing must still work when browser storage is unavailable.
  }
}

function clearLastThread() {
  try {
    window.clearLastThread();
  } catch {
    // Ignore restricted/private browsing storage.
  }
}

function ParserIndex() {
  const { user, session, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  const open = useCallback(async () => {
    const currentUser = user;
    if (!currentUser || !session?.access_token) return;
    setFailure(null);

    try {
      const cached = readLastThread();
      if (cached) {
        const { data: cachedThread, error: cachedError } = await withTimeout(
          supabase.from("chat_threads").select("id").eq("id", cached).maybeSingle(),
          15000,
          "Cached thread lookup",
        );
        if (cachedError) throw new Error(cachedError.message);
        if (cachedThread?.id) {
          navigate({ to: "/app/parser/$threadId", params: { threadId: cached }, replace: true });
          return;
        }
        sessionStorage.removeItem(LAST_THREAD_KEY);
      }

      const { data: existing, error: listError } = await withTimeout(
        supabase
          .from("chat_threads")
          .select("id")
          .eq("user_id", currentUser.id)
          .order("updated_at", { ascending: false })
          .limit(1),
        15000,
        "Thread lookup",
      );
      if (listError) throw new Error(listError.message);

      const found = existing?.[0]?.id;
      if (found) {
        writeLastThread(found);
        navigate({ to: "/app/parser/$threadId", params: { threadId: found }, replace: true });
        return;
      }

      // RLS requires org_id to belong to the caller's organisation, so resolve it first.
      const { data: prof } = await withTimeout(
        supabase.from("profiles").select("org_id").eq("user_id", currentUser.id).maybeSingle(),
        15000,
        "Profile lookup",
      );
      let orgId = prof?.org_id ?? null;

      if (!orgId) {
        await refreshProfile();
        const { data: retry } = await withTimeout(
          supabase.from("profiles").select("org_id").eq("user_id", currentUser.id).maybeSingle(),
          15000,
          "Profile retry",
        );
        orgId = retry?.org_id ?? null;
      }

      if (!orgId) {
        throw new Error("We couldn't find your workspace organisation yet. Try again in a moment.");
      }

      const { data: created, error } = await withTimeout(
        supabase
          .from("chat_threads")
          .insert({ user_id: currentUser.id, org_id: orgId, title: "New audit" } as never)
          .select("id")
          .single(),
        15000,
        "Thread creation",
      );
      if (error || !created) throw new Error(error?.message ?? "Could not open the AI workspace.");

      writeLastThread(created.id);
      navigate({ to: "/app/parser/$threadId", params: { threadId: created.id }, replace: true });
    } catch (cause) {
      console.error("[Wab][ParserIndex] ERROR opening workspace", {
        userId: currentUser.id,
        cause,
      });
      setFailure(cause instanceof Error ? cause.message : "Could not open the AI workspace.");
    }
  }, [user, session?.access_token, navigate, refreshProfile]);

  const userId = user?.id;
  const token = session?.access_token;
  useEffect(() => {
    if (loading || !userId || !token || started.current) return;
    started.current = true;
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId, token]);

  if (failure) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          {failure}
        </p>
        <button
          type="button"
          onClick={() => {
            started.current = false;
            started.current = true;
            void open();
          }}
          className="rounded-full px-4 py-2 text-xs font-semibold text-white"
          style={{ background: "var(--color-accent)" }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[70vh] items-center justify-center">
      <Shimmer>Opening your AI workspace…</Shimmer>
    </div>
  );
}
