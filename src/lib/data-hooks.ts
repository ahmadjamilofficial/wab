// ─── React Query hooks for real Supabase data ─────────────────────────────────

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseDocument, parseTextDocument } from "./ai-service";
import { supabase } from "./supabase";
import type { Transaction } from "./demo-data";

// ── Transactions ──────────────────────────────────────────────────────────────

export function useTransactions(orgId: string | undefined) {
  return useQuery({
    queryKey: ["transactions", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("org_id", orgId!)
        .order("trade_date", { ascending: false });

      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => ({
        id: row.id,
        ticker: row.ticker,
        action: row.action as Transaction["action"],
        quantity: Number(row.quantity),
        price: Number(row.price),
        fees: Number(row.fees),
        wht: Number(row.wht),
        trade_date: row.trade_date,
        ref_id: row.ref_id,
        confidence_score: Number(row.confidence_score),
        status: row.status as Transaction["status"],
        broker: row.broker,
        exchange: row.exchange as Transaction["exchange"],
      })) as Transaction[];
    },
    staleTime: 0,
  });
}

export interface TransactionInput {
  ticker: string;
  action: "BUY" | "SELL" | "DIV";
  quantity: number;
  price: number;
  fees: number;
  wht: number;
  trade_date: string;
  ref_id: string;
  broker: string;
  exchange: string;
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, values }: { orgId: string; values: TransactionInput }) => {
      // Never spread UI-only fields (e.g. notes, _raw) into a PostgREST row.
      // Supabase rejects unknown columns, which previously broke both manual
      // entry and file imports even when the visible form looked valid.
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          org_id: orgId,
          ticker: values.ticker.trim().toUpperCase(),
          action: values.action,
          quantity: values.quantity,
          price: values.price,
          fees: values.fees ?? 0,
          wht: values.wht ?? 0,
          trade_date: values.trade_date,
          ref_id: values.ref_id ?? "",
          broker: values.broker ?? "",
          exchange: values.exchange || "PSX",
          confidence_score: 1,
          status: "posted",
        } as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["transactions", orgId] }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      orgId,
      values,
    }: {
      id: string;
      orgId: string;
      values: Partial<TransactionInput> & { status?: string };
    }) => {
      const allowed: Partial<TransactionInput> & { status?: string } = {};
      const fields: Array<keyof TransactionInput> = [
        "ticker", "action", "quantity", "price", "fees", "wht",
        "trade_date", "ref_id", "broker", "exchange",
      ];
      for (const field of fields) {
        if (values[field] !== undefined) {
          (allowed as Record<string, unknown>)[field] = values[field];
        }
      }
      if (values.status !== undefined) allowed.status = values.status;
      if (allowed.ticker) allowed.ticker = allowed.ticker.trim().toUpperCase();

      const { error } = await supabase
        .from("transactions")
        .update(allowed as never)
        .eq("id", id)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["transactions", orgId] }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId }: { id: string; orgId: string }) => {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["transactions", orgId] }),
  });
}

/** Number of transactions created in the current calendar month (plan metering). */
export function useMonthlyTransactionCount(orgId: string | undefined) {
  return useQuery({
    queryKey: ["transactions_month", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .gte("created_at", start.toISOString());
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
  });
}

// ── Reconciliation flags ──────────────────────────────────────────────────────

export function useReconciliationFlags(orgId: string | undefined) {
  return useQuery({
    queryKey: ["reconciliation_flags", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reconciliation_flags")
        .select("*")
        .eq("org_id", orgId!)
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => ({
        id: row.id,
        flag_type: row.flag_type,
        severity: row.severity as "ok" | "warn" | "bad",
        ticker: row.ticker,
        ref_id: row.ref_id,
        expected: typeof row.expected === "number" ? row.expected : 0,
        actual: typeof row.actual === "number" ? row.actual : 0,
        description: row.description,
        suggested_resolution: row.suggested_resolution,
      }));
    },
    staleTime: 30_000,
  });
}

export function useResolveFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ flagId, orgId }: { flagId: string; orgId: string }) => {
      const { error } = await supabase
        .from("reconciliation_flags")
        .update({ status: "resolved" })
        .eq("id", flagId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) =>
      qc.invalidateQueries({ queryKey: ["reconciliation_flags", orgId] }),
  });
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export function useAuditLog(orgId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["audit_log", orgId, limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

// ── Subscription / plan ───────────────────────────────────────────────────────

export function useSubscription(orgId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error || !data) return { plan: "free", status: "active", current_period_end: null };
      return data;
    },
    staleTime: 60_000,
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, message, severity, read, link, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as AppNotification[];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, id }: { userId: string; id?: string }) => {
      let query = supabase.from("notifications").update({ read: true }).eq("user_id", userId);
      if (id) query = query.eq("id", id);
      else query = query.eq("read", false);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { userId }) => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
  });
}

export async function pushNotification(input: {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  severity?: string;
  link?: string;
}) {
  await supabase
    .from("notifications")
    .insert({
      org_id: input.orgId,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      severity: input.severity ?? "info",
      link: input.link ?? null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

// ── Broker accounts ───────────────────────────────────────────────────────────

export interface BrokerInput {
  name: string;
  broker_name: string;
  currency: string;
  exchange: string;
  external_ref?: string | undefined;
}

export function useBrokerConnections(orgId: string | undefined) {
  return useQuery({
    queryKey: ["broker_connections", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broker_accounts")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useConnectBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, broker }: { orgId: string; broker: BrokerInput }) => {
      const { data, error } = await supabase
        .from("broker_accounts")
        .insert({
          org_id: orgId,
          name: broker.name,
          broker_name: broker.broker_name,
          currency: broker.currency,
          exchange: broker.exchange,
          external_ref: broker.external_ref ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["broker_connections", orgId] }),
  });
}

export function useDeleteBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId }: { id: string; orgId: string }) => {
      const { error } = await supabase
        .from("broker_accounts")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["broker_connections", orgId] }),
  });
}

// ── Organisation ──────────────────────────────────────────────────────────────

export function useDeleteOrganization() {
  return useMutation({
    mutationFn: async ({ orgId }: { orgId: string }) => {
      const { error } = await supabase.from("organizations").delete().eq("id", orgId);
      if (error) throw new Error(error.message);
    },
  });
}

// ── Chat threads ──────────────────────────────────────────────────────────────

export function useChatThreads(userId: string | undefined) {
  return useQuery({
    queryKey: ["chat_threads", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id, title, created_at, updated_at")
        .eq("user_id", userId!)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 10_000,
  });
}

export function useDeleteChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, userId }: { threadId: string; userId: string }) => {
      // Delete messages first (foreign key), then the thread
      const { error: msgErr } = await supabase
        .from("chat_messages")
        .delete()
        .eq("thread_id", threadId);
      if (msgErr) throw new Error(msgErr.message);

      const { error: threadErr } = await supabase
        .from("chat_threads")
        .delete()
        .eq("id", threadId)
        .eq("user_id", userId);
      if (threadErr) throw new Error(threadErr.message);
    },
    onSuccess: (_d, { userId }) => qc.invalidateQueries({ queryKey: ["chat_threads", userId] }),
  });
}

// ── AI usage (quota tracking) ─────────────────────────────────────────────────

export interface AiUsageToday {
  credits_used_today: number;
  requests_today: number;
}

/** Wab plan daily credit limits (mirrors ai_plan_limits table). */
export const AI_PLAN_DAILY_LIMITS: Record<string, number> = {
  free: 8,
  standard: 60,
  pro: 200,
  enterprise: 200,
};

export function useAiUsageToday(userId: string | undefined) {
  return useQuery({
    queryKey: ["ai_usage_today", userId],
    enabled: !!userId,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ai_usage")
        .select("credits_used")
        .eq("user_id", userId!)
        .eq("status", "ok")
        .gte("created_at", since);
      if (error) return { credits_used_today: 0, requests_today: 0 } as AiUsageToday;
      const credits_used_today = (data ?? []).reduce((s, r) => s + (r.credits_used ?? 0), 0);
      return { credits_used_today, requests_today: data?.length ?? 0 } as AiUsageToday;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

// ── Universal file import ─────────────────────────────────────────────────────

export function useUniversalImport() {
  return useMutation({
    mutationFn: async ({ file }: { file: File; orgId: string }) => {
      const isText =
        file.type.includes("text") || file.type.includes("csv") || file.name.endsWith(".csv");

      if (isText) return parseTextDocument(await file.text(), file.name);

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      return parseDocument(base64, file.type || "application/pdf", file.name);
    },
  });
}

// ── Agent Jobs ────────────────────────────────────────────────────────────────

import type { AgentJob, AgentApproval } from "./agent-queue";

export function useAgentJobs(orgId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["agent_jobs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_jobs")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as AgentJob[];
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function usePendingApprovals(orgId: string | undefined) {
  return useQuery({
    queryKey: ["agent_approvals_pending", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_approvals")
        .select("*")
        .eq("org_id", orgId!)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as AgentApproval[];
    },
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      approvalId,
      decision,
      userId,
      orgId,
    }: {
      approvalId: string;
      decision: "approved" | "rejected" | "skipped";
      userId: string;
      orgId: string;
    }) => {
      const { error } = await supabase
        .from("agent_approvals")
        .update({
          status: decision,
          decided_by: userId,
          decided_at: new Date().toISOString(),
        } as never)
        .eq("id", approvalId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => {
      void qc.invalidateQueries({ queryKey: ["agent_approvals_pending", orgId] });
    },
  });
}

export function useRevertRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ runId, orgId }: { runId: string; orgId: string }) => {
      const { data, error } = await supabase.rpc("revert_run", { p_run_id: runId });
      if (error) throw new Error(error.message);
      return (data as number) ?? 0;
    },
    onSuccess: (_d, { orgId }) => {
      void qc.invalidateQueries({ queryKey: ["agent_jobs", orgId] });
      void qc.invalidateQueries({ queryKey: ["transactions", orgId] });
    },
  });
}

// ── Connected Sources ─────────────────────────────────────────────────────────

import type { ConnectedSource, SourceRules } from "./connected-sources";

export function useConnectedSources(orgId: string | undefined) {
  return useQuery({
    queryKey: ["connected_sources", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connected_sources")
        .select(
          "id,org_id,source_type,external_id,display_name,last_hash,watch_expiry,paused,rules,last_synced_at,created_at,updated_at",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ConnectedSource[];
    },
    staleTime: 30_000,
  });
}

export function useUpdateSourceRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sourceId,
      orgId,
      rules,
    }: {
      sourceId: string;
      orgId: string;
      rules: SourceRules;
    }) => {
      const { error } = await supabase
        .from("connected_sources")
        .update({ rules: rules as never, updated_at: new Date().toISOString() } as never)
        .eq("id", sourceId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["connected_sources", orgId] }),
  });
}

export function usePauseSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sourceId,
      orgId,
      paused,
    }: {
      sourceId: string;
      orgId: string;
      paused: boolean;
    }) => {
      const { error } = await supabase
        .from("connected_sources")
        .update({ paused, updated_at: new Date().toISOString() } as never)
        .eq("id", sourceId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["connected_sources", orgId] }),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceId, orgId }: { sourceId: string; orgId: string }) => {
      const { error } = await supabase
        .from("connected_sources")
        .delete()
        .eq("id", sourceId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["connected_sources", orgId] }),
  });
}

export function useOrgPolicyConfig(orgId: string | undefined) {
  return useQuery({
    queryKey: ["org_policy_config", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("org_policy_config")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });
}

export function useUpdateOrgPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, updates }: { orgId: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("org_policy_config")
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["org_policy_config", orgId] }),
  });
}

export function useOrgFeatureFlags(orgId: string | undefined) {
  return useQuery({
    queryKey: ["org_feature_flags", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("org_feature_flags")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });
}
