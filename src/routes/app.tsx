import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading, profile, profileError, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect once we know for certain there's no session.
    // While loading is true the session is still being resolved — don't redirect yet.
    if (!loading && !session) {
      window.location.replace(`/signin?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
    }
  }, [loading, session, navigate]);

  // Keep the shell mounted once a session exists so mobile token refresh
  // does not unmount the AI workspace and restart "Opening your workspace".
  if (loading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="size-8 animate-spin rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--color-accent)" }}
        />
      </div>
    );
  }

  if (!session) return null;

  if (!loading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Your workspace needs setup</h1>
          <p className="mt-2 break-words text-sm text-muted-foreground">{profileError ?? "Your account is signed in, but its workspace profile has not loaded yet. Retry setup to continue."}</p>
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Retry workspace setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
