import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Wab" },
      { name: "description", content: "Choose a new password for your Wab account." },
      { property: "og:title", content: "Reset password — Wab" },
      { property: "og:description", content: "Choose a new password for your Wab account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return setErr("Password must be at least 6 characters");
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    nav({ to: "/app/overview", replace: true });
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: "var(--color-login-bg)" }}
    >
      <div className="mb-8">
        <Logo />
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.8rem" }}>
          Set a new password
        </h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password"
          className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none"
          style={{ borderColor: "var(--hairline)" }}
        />
        {err && (
          <p className="text-sm" style={{ color: "var(--bad)" }}>
            {err}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--color-accent)" }}
        >
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
