import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Bell,
  Building2,
  Copy,
  CreditCard,
  Download,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Btn, Panel } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { setNotificationPrefs } from "@/lib/notifications";
import { useDeleteOrganization } from "@/lib/data-hooks";
import { DirectSourceConnect } from "@/components/app/DirectSourceConnect";
import { inviteUrl, randomInviteToken, type TeamRole } from "@/lib/team";

export const Route = createFileRoute("/app/settings")({
  component: Settings,
});

type Tab = "org" | "tax-profiles" | "import" | "team" | "notifications";

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: "org", label: "Organisation", icon: Building2 },
  { id: "tax-profiles", label: "Tax Profiles", icon: CreditCard },
  { id: "import", label: "Import Data", icon: Download },
  { id: "team", label: "Team & Roles", icon: Users },
  { id: "notifications", label: "Notifications", icon: Bell },
];

function Settings() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("org");
  const [orgName, setOrgName] = useState(profile?.org_name ?? "My Organisation");
  const [jurisdiction, setJurisdiction] = useState(profile?.jurisdiction ?? "PSX");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingOrg, setDeletingOrg] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("analyst");
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const deleteOrgMutation = useDeleteOrganization();

  const { data: members = [] } = useQuery({
    queryKey: ["org-members", profile?.org_id],
    enabled: Boolean(profile?.org_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, user_id")
        .eq("org_id", profile!.org_id)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["org-invites", profile?.org_id],
    enabled: Boolean(profile?.org_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_invites")
        .select("id, email, role, token, status, expires_at, created_at")
        .eq("org_id", profile!.org_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  async function sendInvite() {
    if (!profile?.org_id || !user?.id) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setInviting(true);
    try {
      const token = randomInviteToken();
      const { data: invite, error } = await supabase.from("org_invites").insert({
        org_id: profile.org_id,
        email,
        role: inviteRole,
        token,
        invited_by: user.id,
        status: "pending",
      }).select("id").single();
      if (error) throw error;
      const url = inviteUrl(token);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");
      const mailResponse = await fetch("/api/team/invite-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: invite.id }),
      });
      const mailResult = await mailResponse.json().catch(() => ({})) as { error?: string };
      if (!mailResponse.ok) {
        toast.warning("Invitation created, but email was not sent", {
          description: mailResult.error ?? "The invite link is copied. Share it manually or configure email delivery.",
        });
      } else {
        toast.success(`Invitation email sent to ${email}`, {
          description: "A secure invite link was also copied to your clipboard.",
        });
      }
      setInviteEmail("");
      setInviteOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["org-invites", profile.org_id] });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create invite. Apply the org_invites migration in Supabase.",
      );
    } finally {
      setInviting(false);
    }
  }

  const [notifications, setNotifications] = useState({
    lowConfidenceAlert: true,
    reconciliationFlag: true,
    taxComputationUpdate: false,
    monthlyDigest: true,
  });

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.charAt(0).toUpperCase();
  const avatarUrl =
    profile?.avatar_url || (user?.user_metadata?.["avatar_url"] as string | undefined);

  async function save() {
    if (!profile?.org_id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: orgName,
          jurisdiction_default: jurisdiction,
        })
        .eq("id", profile.org_id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["profile"] });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save organization settings");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrganisation() {
    if (!profile?.org_id) return;
    if (deleteConfirm !== profile.org_name) {
      toast.error("Type the organisation name exactly to confirm");
      return;
    }
    setDeletingOrg(true);
    try {
      await deleteOrgMutation.mutateAsync({ orgId: profile.org_id });
      toast.success("Organisation deleted");
      await signOut();
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete organisation");
    } finally {
      setDeletingOrg(false);
    }
  }

  async function updateNotificationSettings() {
    if (!profile?.org_id) return;

    try {
      const { error } = await supabase.from("org_settings").upsert({
        org_id: profile.org_id,
        notification_preferences: notifications,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["org_settings"] });
      toast.success("Notification preferences updated");
    } catch (error) {
      console.error("Failed to update notification settings:", error);
    }
  }

  function handleNotificationChange(key: keyof typeof notifications, value: boolean) {
    const newPrefs = { ...notifications, [key]: value };
    setNotifications(newPrefs);
    setNotificationPrefs(newPrefs);
    updateNotificationSettings();

    if (value) {
      const messages: Record<keyof typeof notifications, string> = {
        lowConfidenceAlert: "Low-confidence extraction alerts enabled",
        reconciliationFlag: "Reconciliation flag notifications enabled",
        taxComputationUpdate: "Tax computation updates enabled",
        monthlyDigest: "Monthly ledger digest enabled",
      };
      toast.success(messages[key]);
    }
  }

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Settings</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
          Manage your organisation, tax profiles, team, and notifications.
        </p>
      </div>

      <div className="flex gap-6">
        <nav
          className="hidden w-44 shrink-0 rounded-2xl bg-surface p-2 lg:block"
          style={{ border: "1px solid var(--hairline)", alignSelf: "start" }}
        >
          {TABS.map(({ id, label, icon: Ic }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                background: tab === id ? "var(--accent-10)" : "transparent",
                color: tab === id ? "var(--color-accent)" : "var(--ink-2)",
              }}
            >
              <Ic size={16} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>

        <div className="w-full overflow-x-auto lg:hidden">
          <div className="flex gap-2 pb-2">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
                style={{
                  background: tab === id ? "var(--color-accent)" : "var(--color-login-bg)",
                  color: tab === id ? "var(--accent-fg)" : "var(--ink-2)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {tab === "org" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <Panel>
                <p className="mb-4 text-sm font-semibold">Organisation Details</p>
                <div className="space-y-4">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: "var(--ink-2)" }}
                    >
                      Organisation name
                    </label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none focus:ring-2"
                      style={{
                        borderColor: "var(--hairline)",
                        maxWidth: 400,
                        ["--tw-ring-color" as string]: "var(--color-accent)",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: "var(--ink-2)" }}
                    >
                      Default jurisdiction
                    </label>
                    <select
                      value={jurisdiction}
                      onChange={(e) => setJurisdiction(e.target.value)}
                      className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none"
                      style={{ borderColor: "var(--hairline)", maxWidth: 400 }}
                    >
                      <option value="PSX">PSX — Pakistan</option>
                      <option value="NSE">NSE — India</option>
                    </select>
                  </div>
                  <Btn onClick={save} variant="primary" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
                        Saving...
                      </>
                    ) : saved ? (
                      "Saved ✓"
                    ) : (
                      "Save changes"
                    )}
                  </Btn>
                </div>
              </Panel>

              <Panel
                style={{ border: "1px solid color-mix(in srgb, var(--bad) 20%, transparent)" }}
              >
                <p className="mb-2 text-sm font-semibold" style={{ color: "var(--bad)" }}>
                  Danger Zone
                </p>
                <p className="mb-4 text-sm" style={{ color: "var(--ink-2)" }}>
                  Deleting your organisation permanently removes all transactions, tax computations,
                  and audit logs. This action cannot be undone.
                </p>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={`Type "${profile?.org_name ?? ""}" to confirm`}
                  className="mb-8 mt-2 w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "var(--hairline)", maxWidth: 400, marginBottom: "3rem" }}
                />
                <Btn
                  variant="ghost"
                  onClick={deleteOrganisation}
                  disabled={deletingOrg}
                  className="!text-[var(--bad)] border border-[var(--bad)]/30 hover:!bg-red-50"
                >
                  {deletingOrg ? (
                    <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} strokeWidth={1.75} />
                  )}
                  Delete organisation
                </Btn>
              </Panel>
            </motion.div>
          )}

          {tab === "tax-profiles" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <p className="mb-4 text-sm font-semibold">Tax Profiles</p>
                <div className="space-y-3">
                  {[
                    {
                      name: "PSX — Pakistan",
                      key: "PSX",
                      rules: "CGT 15% ST / 12.5% LT, Filer WHT 10%",
                    },
                    {
                      name: "NSE — India",
                      key: "NSE",
                      rules: "STCG 20%, LTCG 12.5% (post Budget 2024)",
                    },
                  ].map((p) => {
                    const isActive = jurisdiction === p.key;
                    return (
                      <div
                        key={p.name}
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{
                          background: isActive ? "var(--accent-6)" : "var(--color-login-bg)",
                          border: `1px solid ${isActive ? "var(--accent-20)" : "transparent"}`,
                        }}
                      >
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                            {p.rules}
                          </p>
                        </div>
                        {isActive && (
                          <span
                            className="rounded-full px-2.5 py-1 text-xs font-medium"
                            style={{ background: "var(--color-accent)", color: "var(--accent-fg)" }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </motion.div>
          )}

          {tab === "team" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">Team Members</p>
                  <Btn variant="secondary" onClick={() => setInviteOpen((v) => !v)}>
                    <Plus size={15} strokeWidth={1.75} />
                    {inviteOpen ? "Cancel" : "Invite member"}
                  </Btn>
                </div>

                {inviteOpen && (
                  <div
                    className="mb-4 grid gap-3 rounded-xl p-4 sm:grid-cols-[1fr_140px_auto]"
                    style={{ background: "var(--color-login-bg)" }}
                  >
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="rounded-[10px] border bg-surface px-3.5 py-2.5 text-sm outline-none"
                      style={{ borderColor: "var(--hairline)" }}
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                      className="rounded-[10px] border bg-surface px-3.5 py-2.5 text-sm outline-none"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <option value="admin">Admin</option>
                      <option value="analyst">Analyst</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Btn onClick={() => void sendInvite()} disabled={inviting}>
                      {inviting ? (
                        <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
                      ) : (
                        "Create invite"
                      )}
                    </Btn>
                    <p className="text-xs sm:col-span-3" style={{ color: "var(--ink-3)" }}>
                      Creates a join link (copied to your clipboard). They sign up or sign in with
                      that link and are added to this organisation.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {members.map((member) => {
                    const isYou = member.user_id === user?.id;
                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 rounded-xl px-4 py-3"
                        style={{ background: "var(--color-login-bg)" }}
                      >
                        <div
                          className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
                          style={{
                            background: isYou && avatarUrl ? "transparent" : "var(--color-accent)",
                            color: "var(--accent-fg)",
                          }}
                        >
                          {isYou && avatarUrl ? (
                            <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
                          ) : (
                            (member.full_name || "?").charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {member.full_name || "Member"}
                            {isYou ? " (you)" : ""}
                          </p>
                          <p className="text-xs capitalize" style={{ color: "var(--ink-3)" }}>
                            {member.role}
                          </p>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-medium capitalize"
                          style={{ background: "var(--accent-10)", color: "var(--color-accent)" }}
                        >
                          {member.role}
                        </span>
                      </div>
                    );
                  })}

                  {invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{ background: "var(--color-login-bg)" }}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{inv.email}</p>
                        <p className="text-xs capitalize" style={{ color: "var(--ink-3)" }}>
                          Pending {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{ border: "1px solid var(--hairline)" }}
                        onClick={() => {
                          void navigator.clipboard.writeText(inviteUrl(inv.token));
                          toast.success("Invite link copied");
                        }}
                      >
                        <Copy size={12} />
                        Copy link
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            </motion.div>
          )}

          {tab === "import" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <p className="mb-1 text-sm font-semibold">Import Data</p>
                <p className="mb-5 text-xs" style={{ color: "var(--ink-3)" }}>
                  Upload an Excel / CSV file or connect a Google Sheet. Wab will ask for permission
                  before touching any of your data.
                </p>
                <DirectSourceConnect
                  orgId={profile?.org_id ?? ""}
                  onComplete={() => setTab("org")}
                />
              </Panel>
            </motion.div>
          )}

          {tab === "notifications" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Panel>
                <p className="mb-4 text-sm font-semibold">Notification Preferences</p>
                <div className="space-y-4">
                  {[
                    {
                      key: "lowConfidenceAlert" as const,
                      label: "Low-confidence extraction alert",
                      desc: "When a parsed field falls below 0.75",
                    },
                    {
                      key: "reconciliationFlag" as const,
                      label: "Reconciliation flag detected",
                      desc: "When a discrepancy is found",
                    },
                    {
                      key: "taxComputationUpdate" as const,
                      label: "Tax computation update",
                      desc: "When new gains are computed",
                    },
                    {
                      key: "monthlyDigest" as const,
                      label: "Monthly ledger digest",
                      desc: "Summary of your monthy performance",
                    },
                  ].map((n) => (
                    <div key={n.key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{n.label}</p>
                        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                          {n.desc}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications[n.key]}
                        onChange={(e) => handleNotificationChange(n.key, e.target.checked)}
                        className="size-4 rounded accent-[var(--color-accent)]"
                      />
                    </div>
                  ))}
                </div>
              </Panel>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
