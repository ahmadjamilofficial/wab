// ─── Real Supabase auth context ───────────────────────────────────────────────
// Loads (and self-provisions) the signed-in user's organisation, profile and
// subscription. Never uses PostgREST embeds across unrelated tables.

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { resolveEntitlement } from "./entitlement";
import type { PlanId } from "./plans";
import { supabase } from "./supabase";
import { acceptStoredInvite } from "./team";

interface OrgProfile {
  profile_id: string;
  org_id: string;
  org_name: string;
  full_name: string;
  role: string;
  jurisdiction: string;
  plan: PlanId;
  plan_status: string;
  avatar_url?: string | undefined;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: OrgProfile | null;
  loading: boolean;
  planChosen: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  planChosen: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const provisioning = useRef(false);
  // Guards against duplicate/overlapping loads from getSession + INITIAL_SESSION + SIGNED_IN.
  const loadingUserId = useRef<string | null>(null);
  const loadedUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (u: User) => {
    try {
      // 1. Profile row (no cross-table embeds — profiles has no FK to subscriptions)
      const profileQuery = await supabase
        .from("profiles")
        .select("id, org_id, full_name, role")
        .eq("user_id", u.id)
        .maybeSingle();

      const { data: existingRow, error } = profileQuery;
      let row = existingRow;

      if (error) {
        console.error("[Wab][Auth] Profile lookup failed:", error.message);
        throw new Error(`Profile lookup failed: ${error.message}`);
      }

      // 2. Self-provision organisation + profile on first login (Basic $0 by default)
      if (!row && !provisioning.current) {
        provisioning.current = true;
        try {
          row = await provision(u);
        } finally {
          provisioning.current = false;
        }
      }
      if (!row) {
        throw new Error("Your workspace profile could not be created. Please retry.");
      }

      const joined = await acceptStoredInvite();
      if (joined) {
        const refreshed = await supabase
          .from("profiles")
          .select("id, org_id, full_name, role")
          .eq("user_id", u.id)
          .maybeSingle();
        if (refreshed.data) row = refreshed.data;
      }

      // 3. Organisation + subscription, fetched independently
      const [orgRes, subRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("name, jurisdiction_default")
          .eq("id", row.org_id)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan, status, trial_end_at, charge_period, current_period_end, created_at")
          .eq("org_id", row.org_id)
          .maybeSingle(),
      ]);

      if (orgRes.error) throw new Error(`Organisation lookup failed: ${orgRes.error.message}`);
      if (subRes.error) console.warn("[Wab][Auth] Subscription lookup failed:", subRes.error.message);

      const entitlement = resolveEntitlement({
        orgId: row.org_id,
        userId: u.id,
        subPlan: subRes.data?.plan as string | undefined,
        subStatus: subRes.data?.status as string | undefined,
        chargePeriod: subRes.data?.charge_period as string | undefined,
        currentPeriodEnd: subRes.data?.current_period_end as string | undefined,
        createdAt: subRes.data?.created_at as string | undefined,
      });
      const trialEnded =
        subRes.data?.status === "trialing" &&
        subRes.data?.trial_end_at &&
        new Date(subRes.data.trial_end_at).getTime() <= Date.now();
      const plan = trialEnded ? "free" : entitlement.featurePlan;
      const planStatus = entitlement.paused || entitlement.expired ? "active" : (subRes.data?.status as string | undefined) ?? "active";

      setProfile({
        profile_id: row.id,
        org_id: row.org_id,
        org_name: orgRes.data?.name ?? "My Organisation",
        full_name: row.full_name || ((u.user_metadata?.["full_name"] as string | undefined) ?? ""),
        role: row.role,
        jurisdiction: orgRes.data?.jurisdiction_default ?? "PSX",
        plan: plan as PlanId,
        plan_status: planStatus,
        avatar_url: u.user_metadata?.["avatar_url"] as string | undefined,
      });
    } catch (cause) {
      console.error("[Wab][Auth] Profile provisioning/loading failed:", cause);
      setProfile(null);
      throw cause;
    }
  }, []);

  // Single controlled lifecycle: never overlap, never reload the same user,
  // always release the loading flag.
  const ensureUserData = useCallback(
    async (u: User, force = false) => {
      if (loadingUserId.current === u.id) {
        // Already loading this user, don't block
        return;
      }
      if (!force && loadedUserId.current === u.id) {
        setLoading(false);
        return;
      }
      loadingUserId.current = u.id;
      if (!loadedUserId.current) setLoading(true);
      try {
        await loadProfile(u);
        loadedUserId.current = u.id;
      } catch (error) {
        console.error("Error loading user profile:", error);
      } finally {
        loadingUserId.current = null;
        setLoading(false);
      }
    },
    [loadProfile],
  );

  async function provision(u: User) {
    const meta = u.user_metadata ?? {};
    const orgName =
      (meta["org_name"] as string | undefined) || `${u.email?.split("@")[0] ?? "My"} Organisation`;
    const { data, error } = await supabase.rpc("provision_current_user", {
      _org_name: orgName,
      _full_name:
        (meta["full_name"] as string | undefined) ??
        (meta["name"] as string | undefined) ??
        u.email?.split("@")[0] ??
        "",
      _jurisdiction: (meta["jurisdiction"] as string | undefined) ?? "PSX",
    });
    if (error) {
      console.error("[Wab][Auth] First-account provisioning RPC failed:", error.message);
      throw new Error(`Workspace setup failed: ${error.message}`);
    }
    if (!data) {
      throw new Error("Workspace setup did not return an organisation. Please contact support.");
    }
    const p = data as { id: string; org_id: string; full_name: string; role: string };
    return { id: p.id, org_id: p.org_id, full_name: p.full_name, role: p.role };
  }

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) await ensureUserData(data.user, true);
  }, [ensureUserData]);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const s = data.session;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) return ensureUserData(s.user);
        setLoading(false);
        return undefined;
      })
      .catch((cause: unknown) => {
        if (mounted) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);

      if (event === "SIGNED_OUT") {
        loadedUserId.current = null;
        setProfile(null);
        setLoading(false);
        return;
      }
      // INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED for an already-loaded
      // user must not re-run the expensive profile load.
      if (s?.user) void ensureUserData(s.user);
    });

    // Safety timeout to prevent infinite loading on mobile
    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 10000); // 10 second timeout

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [ensureUserData]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  const planChosen = Boolean(user?.user_metadata?.["plan_chosen"]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        planChosen,
        signOut: handleSignOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
