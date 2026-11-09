// ─── Wab Financial Intelligence Layer ────────────────────────────────────
// The central nervous system of Wab 2.0.
// ALL financial numbers come from deterministic engines — never from AI.
// AI only explains, summarises, and investigates pre-computed data.

import { supabase } from "./supabase";
import { computeTax } from "./tax";
import type { Transaction } from "./demo-data";

// ── Event Types ───────────────────────────────────────────────────────────────

export type FinancialEventType =
  | "TRANSACTION_RECONCILED"
  | "TRANSACTION_UNRECONCILED"
  | "ANOMALY_DETECTED"
  | "TAX_LIABILITY_CHANGED"
  | "DOCUMENT_MISSING"
  | "DOCUMENT_PROCESSED"
  | "FEE_DISCREPANCY"
  | "DUPLICATE_TRANSACTION"
  | "TAX_OPPORTUNITY"
  | "PORTFOLIO_CHANGE"
  | "COMPLIANCE_RISK"
  | "INVESTIGATION_COMPLETED"
  | "HEALTH_SCORE_CHANGED"
  | "DAILY_BRIEFING";

export type EventSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | "SUCCESS";

export interface FinancialEvent {
  id: string;
  org_id: string;
  event_type: FinancialEventType;
  severity: EventSeverity;
  title: string;
  description: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  confidence: number;
  status: "OPEN" | "RESOLVED" | "ACKNOWLEDGED";
  created_at: string;
  resolved_at?: string;
}

export interface FinancialInsight {
  id: string;
  org_id: string;
  insight_type: string;
  severity: EventSeverity;
  title: string;
  summary: string;
  confidence: number;
  evidence_ids?: string[];
  entity_ids?: string[];
  status: "ACTIVE" | "RESOLVED" | "DISMISSED";
  created_at: string;
  expires_at?: string;
}

// ── Health Score Components ───────────────────────────────────────────────────

export interface HealthScoreBreakdown {
  reconciliation: number; // 30 pts — reconciled tx / total tx
  documentCompleteness: number; // 20 pts — tx with docs / total tx
  dataConfidence: number; // 15 pts — avg confidence score
  taxConfidence: number; // 15 pts — completeness of tax data
  compliance: number; // 10 pts — absence of compliance issues
  riskExposure: number; // 10 pts — absence of critical anomalies
  total: number; // 0–100
  trend: number; // change from last snapshot
}

// ── Financial Context ─────────────────────────────────────────────────────────
// This is what gets sent to AI — structured, minimal, targeted.

export interface FinancialContext {
  org_id: string;
  current_page?: string | undefined;
  current_transaction_id?: string | undefined;
  current_portfolio_id?: string | undefined;
  current_tax_year: string;
  financial_health_score: number;
  unreconciled_count: number;
  critical_anomalies: number;
  tax_liability: number;
  portfolio_value: number;
  realized_gains: number;
  total_transactions: number;
  open_flags: number;
  jurisdiction: string;
  recent_financial_events?: FinancialEvent[] | undefined;
  active_insights?: FinancialInsight[] | undefined;
}

// ── Deterministic Financial State Engine ─────────────────────────────────────

export interface PortfolioSummary {
  totalValue: number;
  realizedGains: number;
  unrealizedGains: number | null;
  taxLiability: number;
  unreconciledCount: number;
  totalTransactions: number;
  openFlags: number;
  tickerBreakdown: Array<{ ticker: string; value: number; pct: number }>;
  currency: string;
}

export async function computePortfolioSummary(
  transactions: Transaction[],
  jurisdiction: "PSX" | "NSE",
  taxYear: string,
): Promise<PortfolioSummary> {
  // Detect actual exchange from transaction data — don't blindly trust org default.
  // If any transaction uses NSE, treat the ledger as NSE for currency purposes.
  const hasNSE = transactions.some((t) => t.exchange === "NSE");
  const hasPSX = transactions.some((t) => t.exchange === "PSX" || !t.exchange);
  // Mixed-exchange portfolios use the dominant one (more transactions)
  const nseCount = transactions.filter((t) => t.exchange === "NSE").length;
  const psxCount = transactions.length - nseCount;
  const detectedJurisdiction: "PSX" | "NSE" =
    nseCount > psxCount ? "NSE" : hasPSX ? "PSX" : hasNSE ? "NSE" : jurisdiction;
  const currency = detectedJurisdiction === "NSE" ? "INR" : "PKR";

  // Build current positions (net BUY - SELL) with avg cost
  const positions: Record<string, { qty: number; avgCost: number; exchange: "PSX" | "NSE" }> = {};
  for (const tx of transactions.sort((a, b) => a.trade_date.localeCompare(b.trade_date))) {
    if (!positions[tx.ticker]) {
      positions[tx.ticker] = { qty: 0, avgCost: 0, exchange: tx.exchange || detectedJurisdiction };
    }
    const p = positions[tx.ticker]!;
    if (tx.action === "BUY") {
      const totalCost = p.avgCost * p.qty + tx.price * tx.quantity;
      p.qty += tx.quantity;
      p.avgCost = p.qty > 0 ? totalCost / p.qty : 0;
    } else if (tx.action === "SELL") {
      p.qty = Math.max(0, p.qty - tx.quantity);
    }
  }

  // No external quote provider is used. Wab reports the recorded cost basis
  // until the user supplies a verified current-price source.
  let totalValue = 0;
  const tickerBreakdown: Array<{ ticker: string; value: number; pct: number }> = [];

  for (const [ticker, p] of Object.entries(positions)) {
    if (p.qty <= 0) continue;
    const costBasis = p.qty * p.avgCost;
    totalValue += costBasis;
    tickerBreakdown.push({ ticker, value: costBasis, pct: 0 });
  }

  const finalTickerBreakdown = tickerBreakdown
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      pct: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
    }));

  // Tax computation uses the detected jurisdiction
  const tax = computeTax(transactions, {
    jurisdiction: detectedJurisdiction,
    filerStatus: "Filer",
    taxYear,
  });

  const unreconciledCount = transactions.filter((t) => t.status === "needs_review").length;

  return {
    totalValue: Math.round(totalValue),
    realizedGains: Math.round(tax.totalGain),
    unrealizedGains: null,
    taxLiability: Math.round(tax.estimatedTaxDue),
    unreconciledCount,
    totalTransactions: transactions.length,
    openFlags: 0, // fetched separately
    tickerBreakdown: finalTickerBreakdown,
    currency,
  };
}

// ── Financial Health Score (deterministic) ────────────────────────────────────

export function computeHealthScore(
  transactions: Transaction[],
  openFlagsCount: number,
  criticalFlagsCount: number,
): HealthScoreBreakdown {
  const total = transactions.length;
  if (total === 0) {
    return {
      reconciliation: 0,
      documentCompleteness: 0,
      dataConfidence: 0,
      taxConfidence: 0,
      compliance: 10,
      riskExposure: 10,
      total: 20,
      trend: 0,
    };
  }

  const reconciledCount = transactions.filter((t) => t.status === "posted").length;
  const withDocs = transactions.filter((t) => !!t.ref_id).length;
  const avgConfidence = transactions.reduce((s, t) => s + t.confidence_score, 0) / total;

  // 30 pts: reconciliation rate
  const reconciliation = Math.round((reconciledCount / total) * 30);

  // 20 pts: document completeness proxy (ref_id present)
  const documentCompleteness = Math.round((withDocs / total) * 20);

  // 15 pts: average confidence
  const dataConfidence = Math.round(avgConfidence * 15);

  // 15 pts: tax confidence (full if we have enough data, penalise if few transactions)
  const taxConfidence = total >= 5 ? 15 : Math.round((total / 5) * 15);

  // 10 pts: compliance (penalise open flags)
  const compliance = Math.max(0, 10 - Math.min(10, openFlagsCount * 2));

  // 10 pts: risk (penalise critical flags heavily)
  const riskExposure = Math.max(0, 10 - Math.min(10, criticalFlagsCount * 5));

  const scoreTotal =
    reconciliation +
    documentCompleteness +
    dataConfidence +
    taxConfidence +
    compliance +
    riskExposure;

  return {
    reconciliation,
    documentCompleteness,
    dataConfidence,
    taxConfidence,
    compliance,
    riskExposure,
    total: Math.min(100, scoreTotal),
    trend: 0, // requires snapshot comparison — computed separately
  };
}

// ── Priorities Engine ─────────────────────────────────────────────────────────

export interface Priority {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  count?: number;
  action: string;
  actionLink: string;
  impact?: string;
}

export function computePriorities(
  transactions: Transaction[],
  openFlags: Array<{ severity: string; flag_type: string; description: string }>,
  insights: FinancialInsight[],
): Priority[] {
  const priorities: Priority[] = [];

  const unreconciledCount = transactions.filter((t) => t.status === "needs_review").length;
  if (unreconciledCount > 0) {
    priorities.push({
      id: "unreconciled",
      severity: unreconciledCount > 5 ? "CRITICAL" : "HIGH",
      title: `${unreconciledCount} Unreconciled Transaction${unreconciledCount > 1 ? "s" : ""}`,
      description: "These transactions do not match your broker records and require manual review.",
      count: unreconciledCount,
      action: "Review",
      actionLink: "/app/reconciliation",
    });
  }

  const criticalFlags = openFlags.filter((f) => f.severity === "bad");
  if (criticalFlags.length > 0) {
    priorities.push({
      id: "critical_flags",
      severity: "CRITICAL",
      title: `${criticalFlags.length} Critical Reconciliation Flag${criticalFlags.length > 1 ? "s" : ""}`,
      description: criticalFlags[0]?.description ?? "Potential data integrity issues detected.",
      count: criticalFlags.length,
      action: "Investigate",
      actionLink: "/app/reconciliation",
    });
  }

  const warnFlags = openFlags.filter((f) => f.severity === "warn");
  if (warnFlags.length > 0) {
    priorities.push({
      id: "warn_flags",
      severity: "MEDIUM",
      title: `${warnFlags.length} Warning${warnFlags.length > 1 ? "s" : ""} Require Attention`,
      description: "Minor reconciliation discrepancies that should be reviewed.",
      count: warnFlags.length,
      action: "Review",
      actionLink: "/app/reconciliation",
    });
  }

  const lowConfidence = transactions.filter((t) => t.confidence_score < 0.75);
  if (lowConfidence.length > 0) {
    priorities.push({
      id: "low_confidence",
      severity: "MEDIUM",
      title: `${lowConfidence.length} Low-Confidence Transaction${lowConfidence.length > 1 ? "s" : ""}`,
      description: "These transactions were extracted with lower confidence and need verification.",
      count: lowConfidence.length,
      action: "Verify",
      actionLink: "/app/ledger",
    });
  }

  // Active insights from investigation system
  for (const insight of insights.slice(0, 3)) {
    priorities.push({
      id: `insight_${insight.id}`,
      severity: insight.severity as Priority["severity"],
      title: insight.title,
      description: insight.summary,
      action: "Investigate",
      actionLink: "/app/investigations",
    });
  }

  return priorities.sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
}

// ── "What Changed?" Engine ────────────────────────────────────────────────────

export interface FinancialChange {
  metric: string;
  previous: number;
  current: number;
  delta: number;
  deltaPct: number;
  direction: "UP" | "DOWN" | "UNCHANGED";
  significance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  explanation?: string | undefined;
}

export function computeChanges(
  currentSnapshot: PortfolioSummary,
  previousSnapshot: Partial<PortfolioSummary>,
): FinancialChange[] {
  const changes: FinancialChange[] = [];

  function addChange(
    metric: string,
    current: number,
    previous: number | undefined,
    significance: FinancialChange["significance"],
    explanation?: string,
  ) {
    const prev = previous ?? 0;
    const delta = current - prev;
    const deltaPct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : 0;
    changes.push({
      metric,
      previous: prev,
      current,
      delta,
      deltaPct,
      direction: delta > 0 ? "UP" : delta < 0 ? "DOWN" : "UNCHANGED",
      significance,
      explanation,
    });
  }

  addChange("Portfolio Value", currentSnapshot.totalValue, previousSnapshot.totalValue, "HIGH");
  addChange(
    "Tax Liability",
    currentSnapshot.taxLiability,
    previousSnapshot.taxLiability,
    "CRITICAL",
  );
  addChange(
    "Realized Gains",
    currentSnapshot.realizedGains,
    previousSnapshot.realizedGains,
    "HIGH",
  );
  addChange(
    "Unreconciled Items",
    currentSnapshot.unreconciledCount,
    previousSnapshot.unreconciledCount,
    "MEDIUM",
  );

  return changes.filter((c) => c.direction !== "UNCHANGED");
}

// ── Supabase Integration ──────────────────────────────────────────────────────

export async function fetchFinancialEvents(orgId: string, limit = 20): Promise<FinancialEvent[]> {
  const { data, error } = await supabase
    .from("financial_events")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as FinancialEvent[];
}

export async function fetchFinancialInsights(
  orgId: string,
  limit = 10,
): Promise<FinancialInsight[]> {
  const { data, error } = await supabase
    .from("financial_insights")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as FinancialInsight[];
}

export async function createFinancialEvent(
  event: Omit<FinancialEvent, "id" | "created_at">,
): Promise<void> {
  await supabase
    .from("financial_events")
    .insert({
      org_id: event.org_id,
      event_type: event.event_type,
      severity: event.severity,
      title: event.title,
      description: event.description,
      entity_type: event.entity_type ?? null,
      entity_id: event.entity_id ?? null,
      metadata: (event.metadata ?? null) as never,
      confidence: event.confidence,
      status: event.status,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

// ── AI Context Builder ────────────────────────────────────────────────────────
// Creates the minimal structured context for AI queries.
// NEVER sends raw chat history or entire database.

export function buildAIContext(
  orgId: string,
  portfolio: PortfolioSummary,
  healthScore: number,
  events: FinancialEvent[],
  insights: FinancialInsight[],
  pageMeta?: { page: string; entityId?: string | undefined; taxYear?: string | undefined },
): FinancialContext {
  const ctx: FinancialContext = {
    org_id: orgId,
    current_tax_year: pageMeta?.taxYear ?? new Date().getFullYear().toString(),
    financial_health_score: healthScore,
    unreconciled_count: portfolio.unreconciledCount,
    critical_anomalies: insights.filter((i) => i.severity === "CRITICAL").length,
    tax_liability: portfolio.taxLiability,
    portfolio_value: portfolio.totalValue,
    realized_gains: portfolio.realizedGains,
    total_transactions: portfolio.totalTransactions,
    open_flags: portfolio.openFlags,
    jurisdiction: portfolio.currency === "PKR" ? "PSX" : "NSE",
    recent_financial_events: events.slice(0, 5),
    active_insights: insights.slice(0, 5),
  };
  if (pageMeta?.page !== undefined) ctx.current_page = pageMeta.page;
  if (pageMeta?.entityId !== undefined) ctx.current_transaction_id = pageMeta.entityId;
  return ctx;
}
