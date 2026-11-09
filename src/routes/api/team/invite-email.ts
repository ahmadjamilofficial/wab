import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/team/invite-email")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const supabaseUrl = process.env["SUPABASE_URL"] ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ?? (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";
        const resendKey = process.env["RESEND_API_KEY"] ?? "";
        const fromEmail = process.env["FROM_EMAIL"] ?? "";

        if (!supabaseUrl || !serviceKey || !publishableKey) {
          return Response.json({ error: "Email invite server is not configured. Add Supabase service and publishable keys." }, { status: 503 });
        }
        if (!resendKey || !fromEmail) {
          return Response.json({ error: "Email delivery is not configured. Set RESEND_API_KEY and FROM_EMAIL on the production deployment." }, { status: 503 });
        }

        const userClient = createClient<Database>(supabaseUrl, publishableKey, {
          global: { headers: { Authorization: auth } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let body: { invite_id?: string };
        try { body = await request.json() as { invite_id?: string }; }
        catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
        if (!body.invite_id) return Response.json({ error: "invite_id is required" }, { status: 400 });

        const admin = createClient<Database>(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: profile, error: profileError } = await admin
          .from("profiles").select("org_id, role").eq("user_id", user.id).maybeSingle();
        if (profileError || !profile?.org_id || !["owner", "admin"].includes(profile.role)) {
          return Response.json({ error: "Only organization owners or admins can email invitations." }, { status: 403 });
        }

        const { data: invite, error: inviteError } = await admin
          .from("org_invites").select("id, org_id, email, role, token, status, expires_at")
          .eq("id", body.invite_id).eq("org_id", profile.org_id).maybeSingle();
        if (inviteError || !invite || invite.status !== "pending") {
          return Response.json({ error: "Pending invitation not found for your organization." }, { status: 404 });
        }

        const { data: org } = await admin.from("organizations").select("name").eq("id", invite.org_id).maybeSingle();
        const appUrl = process.env["VITE_APP_URL"] ?? "https://psxl.live";
        const inviteUrl = `${appUrl.replace(/\/$/, "")}/signup?invite=${encodeURIComponent(invite.token)}`;
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromEmail,
            to: [invite.email],
            subject: `You're invited to join ${org?.name ?? "an organization"} on Wab`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717"><h2>You're invited to Wab</h2><p>You have been invited to join <strong>${org?.name ?? "an organization"}</strong> as a <strong>${invite.role}</strong>.</p><p>Use the secure invitation link below to sign up or sign in and join the workspace.</p><p><a href="${inviteUrl}" style="display:inline-block;background:#171717;color:#fff;padding:12px 20px;border-radius:24px;text-decoration:none">Accept invitation</a></p><p style="font-size:12px;color:#666">This invitation expires on ${new Date(invite.expires_at).toLocaleDateString()}.</p></div>`,
          }),
        });
        const result = await response.json().catch(() => ({})) as { message?: string; error?: string };
        if (!response.ok) return Response.json({ error: result.message ?? result.error ?? "Resend rejected the email." }, { status: 502 });
        return Response.json({ ok: true });
      },
    } as never,
  },
});
