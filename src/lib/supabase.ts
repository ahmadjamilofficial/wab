// ─── Lovable Cloud client (browser) ──────────────────────────────────────────
// Re-exports the generated Lovable Cloud client so all existing imports keep
// working. Row-level security handles authorisation.

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export { supabase };

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  meta: { full_name: string; org_name: string; jurisdiction: string },
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: meta, emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
  return data;
}

// The managed Google flow relies on the /~oauth endpoint that only exists on
// Lovable-hosted domains. Sites hosted elsewhere (e.g. Vercel) get a 404 there,
// so they use the backend's direct OAuth redirect instead.
function isLovableHosted() {
  const h = window.location.hostname;
  return h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com") || h === "localhost";
}

export async function signInWithGoogle() {
  if (!isLovableHosted()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app/overview` },
    });
    if (error) throw new Error(error.message);
    return data;
  }
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
  if (result.error) {
    throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
  }
  return result;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
