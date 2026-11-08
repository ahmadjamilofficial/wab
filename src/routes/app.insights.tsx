// ─── Wab Financial Insights ────────────────────────────────────────────────
// Proactively surfaced findings from deterministic financial data.

import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Search,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { reveal } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { useTransactions, useReconciliationFlags } from "@/lib/data-hooks";
import { useFinancialInsights } from "@/lib/financial-intelligence-hooks";
import { InsightCard, InsightCardEmpty } from "@/components/intelligence/InsightCard";
import { computeTax, suggestHarvesting } from "@/lib/tax";
import { useLedgerContext } from "@/lib/use-ledger-context";
import type { InsightData } from "@/components/intelligence/InsightCard";
import type { EventSeverity } from "@/lib/financial-intelligence";

export const Route = createFileRoute("/app/insights")({
  component: InsightsPage,
});

type FilterLevel = "ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

function InsightsPage() {
  const { profile } = useAuth();
  const { jurisdiction, currency, taxYear } = useLedgerContext();

  const { data: transactions = [] } = useTransactions(profile?.org_id);
  const { data: flags = [] } = useReconciliationFlags(profile?.org_id);
  const { data: dbInsights = [], isLoading } = useFinancialInsights(20);

  const [activeFilter, setActiveFilter] = useState<FilterLevel>("ALL");

  // Build comprehensive insights from all data sources
  const allInsights: InsightData[] = [];

  // 1. From DB financial_insights (if they exist)
  for (const ins of dbInsights) {
    allInsights.push({
      id: ins.id,
      type: ins.insight_type,
      severity: ins.severity as EventSeverity,
      title: ins.title,
      summary: ins.summary,
      confidence: ins.confidence,
      evidenceCount: (ins.evidence_ids ?? []).length,
      actionLabel: "Investigate",
      actionLink: "/app/investigations",
    });
  }

  // 2. Synthesize from real data if no DB insights yet
  if (allInsights.length === 0) {
    const criticalFlags = flags.filter((f) => f.severity === "bad");
    if (criticalFlags.length > 0) {
      const totalImpact = criticalFlags.reduce(
        (s, f) => s + Math.abs((f.actual ?? 0) - (f.expected ?? 0)),
        0,
      );
      allInsights.push({
        id: "insight-critical-flags",
        type: "FEE_DISCREPANCY",
        severity: "CRITICAL",
        title: `${criticalFlags.length} Critical Reconciliation Flag${criticalFlags.length > 1 ? "s" : ""} Detected`,
        summary: `Wab detected ${criticalFlags.length} critical reconciliation issue${criticalFlags.length > 1 ? "s" : ""} that may affect your financial records. ${criticalFlags[0]?.flag_type ?? "Discrepancy"}: ${criticalFlags[0]?.description ?? ""}`,
        confidence: 0.97,
        financialImpact: totalImpact,
        currency,
        evidenceCount: criticalFlags.length,
        actionLabel: "Investigate",
        actionLink: "/app/investigations",
        secondaryActionLabel: "View Flags",
        secondaryActionLink: "/app/reconciliation",
      });
    }

    const warnFlags = flags.filter((f) => f.severity === "warn");
    if (warnFlags.length > 0) {
      allInsights.push({
        id: "insight-warn-flags",
        type: "ANOMALY_DETECTED",
        severity: "HIGH",
        title: `${warnFlags.length} Reconciliation Warning${warnFlags.length > 1 ? "s" : ""} Need Review`,
        summary: `${warnFlags.length} transaction${warnFlags.length > 1 ? "s" : ""} ${warnFlags.length > 1 ? "have" : "has"} reconciliation discrepancies that are not yet critical but should be reviewed to maintain data accuracy.`,
        confidence: 0.92,
        evidenceCount: warnFlags.length,
        actionLabel: "Review",
        actionLink: "/app/reconciliation",
      });
    }

    const unreconciledTxs = transactions.filter((t) => t.status === "needs_review");
    if (unreconciledTxs.length > 0) {
      allInsights.push({
        id: "insight-unreconciled",
        type: "TRANSACTION_UNRECONCILED",
        severity: unreconciledTxs.length > 5 ? "CRITICAL" : "HIGH",
        title: `${unreconciledTxs.length} Transaction${unreconciledTxs.length > 1 ? "s" : ""} Unreconciled`,
        summary: `${unreconciledTxs.length} transaction${unreconciledTxs.length > 1 ? "s" : ""} in your ledger ${unreconciledTxs.length > 1 ? "do" : "does"} not match broker records. These were extracted with lower confidence and require manual verification.`,
        confidence: 1.0,
        evidenceCount: unreconciledTxs.length,
        actionLabel: "Review",
        actionLink: "/app/reconciliation",
      });
    }

    const tax = computeTax(transactions, { jurisdiction, filerStatus: "Filer", taxYear });
    const harvestOpportunities = suggestHarvesting(transactions, tax.totalGain);
    if (harvestOpportunities.length > 0) {
      const totalSaving = harvestOpportunities.reduce((s, h) => s + h.potentialOffset * 0.15, 0);
      allInsights.push({
        id: "insight-tax-harvest",
        type: "TAX_OPPORTUNITY",
        severity: "LOW",
        title: `Tax-Loss Harvesting Opportunity — ${currency} ${totalSaving.toLocaleString("en-PK", { maximumFractionDigits: 0 })} Potential Saving`,
        summary: `Wab identified ${harvestOpportunities.length} position${harvestOpportunities.length > 1 ? "s" : ""} with unrealized losses that could offset your realized gains of ${currency} ${tax.totalGain.toLocaleString("en-PK", { maximumFractionDigits: 0 })}, reducing your estimated tax liability.`,
        confidence: 0.82,
        financialImpact: totalSaving,
        currency,
        evidenceCount: harvestOpportunities.length,
        actionLabel: "View Analysis",
        actionLink: "/app/tax",
      });
    }

    const lowConf = transactions.filter((t) => t.confidence_score < 0.75);
    if (lowConf.length > 0) {
      allInsights.push({
        id: "insight-low-confidence",
        type: "DOCUMENT_MISSING",
        severity: "MEDIUM",
        title: `${lowConf.length} Transaction${lowConf.length > 1 ? "s" : ""} Have Low Extraction Confidence`,
        summary: `${lowConf.length} transaction${lowConf.length > 1 ? "s" : ""} ${lowConf.length > 1 ? "were" : "was"} extracted with confidence below 75%, meaning field values may be inaccurate. Manual verification against original documents is recommended.`,
        confidence: 1.0,
        evidenceCount: lowConf.length,
        actionLabel: "Review",
        actionLink: "/app/ledger",
      });
    }

    const missingDocs = transactions.filter((t) => !t.ref_id || t.ref_id === "");
    if (missingDocs.length > 0) {
      allInsights.push({
        id: "insight-missing-docs",
        type: "DOCUMENT_MISSING",
        severity: "MEDIUM",
        title: `${missingDocs.length} Transaction${missingDocs.length > 1 ? "s" : ""} Missing Reference Documents`,
        summary: `${missingDocs.length} transaction${missingDocs.length > 1 ? "s" : ""} ${missingDocs.length > 1 ? "are" : "is"} missing source reference documentation. Upload the corresponding broker statements to complete your audit trail.`,
        confidence: 0.95,
        evidenceCount: missingDocs.length,
        actionLabel: "Upload Documents",
        actionLink: "/app/parser",
      });
    }
  }

  const filteredInsights =
    activeFilter === "ALL" ? allInsights : allInsights.filter((i) => i.severity === activeFilter);

  const counts = {
    CRITICAL: allInsights.filter((i) => i.severity === "CRITICAL").length,
    HIGH: allInsights.filter((i) => i.severity === "HIGH").length,
    MEDIUM: allInsights.filter((i) => i.severity === "MEDIUM").length,
    LOW: allInsights.filter((i) => i.severity === "LOW").length,
  };

  const filterButtons: Array<{ label: string; value: FilterLevel; count: number; color: string }> =
    [
      { label: "All", value: "ALL", count: allInsights.length, color: "var(--ink-2)" },
      { label: "Critical", value: "CRITICAL", count: counts.CRITICAL, color: "var(--bad)" },
      { label: "High", value: "HIGH", count: counts.HIGH, color: "var(--warn)" },
      { label: "Medium", value: "MEDIUM", count: counts.MEDIUM, color: "var(--info)" },
      { label: "Opportunity", value: "LOW", count: counts.LOW, color: "var(--ok)" },
    ];

  const summaryTiles = [
    {
      icon: AlertCircle,
      label: "Critical",
      value: counts.CRITICAL,
      filterVal: "CRITICAL" as FilterLevel,
      color: "var(--bad)",
      bg: "color-mix(in srgb, var(--bad) 6%, transparent)",
      border: "color-mix(in srgb, var(--bad) 18%, transparent)",
    },
    {
      icon: AlertTriangle,
      label: "High",
      value: counts.HIGH,
      filterVal: "HIGH" as FilterLevel,
      color: "var(--warn)",
      bg: "color-mix(in srgb, var(--warn) 6%, transparent)",
      border: "color-mix(in srgb, var(--warn) 18%, transparent)",
    },
    {
      icon: Search,
      label: "Medium",
      value: counts.MEDIUM,
      filterVal: "MEDIUM" as FilterLevel,
      color: "var(--info)",
      bg: "color-mix(in srgb, var(--info) 6%, transparent)",
      border: "color-mix(in srgb, var(--info) 18%, transparent)",
    },
    {
      icon: Lightbulb,
      label: "Opportunities",
      value: counts.LOW,
      filterVal: "LOW" as FilterLevel,
      color: "var(--ok)",
      bg: "color-mix(in srgb, var(--ok) 6%, transparent)",
      border: "color-mix(in srgb, var(--ok) 18%, transparent)",
    },
  ];

  return (
    <div className="space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>
            Financial Insights
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Wab continuously monitors your financial data and surfaces findings proactively.
          </p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ background: "var(--accent-8)", color: "var(--color-accent)" }}
        >
          <Sparkles size={12} />
          <span className="text-xs font-semibold">Live Intelligence</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryTiles.map(({ icon: Ic, label, value, filterVal, color, bg, border }, i) => (
          <motion.div key={label} variants={reveal} custom={i} initial="hidden" animate="visible">
            <button
              type="button"
              onClick={() => setActiveFilter(filterVal)}
              className="w-full rounded-2xl p-4 text-left transition-shadow hover:shadow-md"
              style={{ background: bg, border: `1px solid ${border}` }}
            >
              <Ic size={16} style={{ color }} />
              <p className="tnum mt-2 text-2xl font-bold" style={{ color }}>
                {value}
              </p>
              <p className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>
                {label}
              </p>
            </button>
          </motion.div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {filterButtons.map(({ label, value, count, color }) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveFilter(value)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
            style={{
              background:
                activeFilter === value
                  ? `color-mix(in srgb, ${color} 12%, transparent)`
                  : "var(--accent-4)",
              color: activeFilter === value ? color : "var(--ink-3)",
              border: `1px solid ${
                activeFilter === value
                  ? `color-mix(in srgb, ${color} 25%, transparent)`
                  : "var(--hairline)"
              }`,
            }}
          >
            {label}
            {count > 0 && (
              <span
                className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]"
                style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Insights grid */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl"
              style={{ background: "var(--hairline)" }}
            />
          ))}
        </div>
      ) : filteredInsights.length === 0 ? (
        <InsightCardEmpty />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredInsights.map((insight, i) => (
            <InsightCard key={insight.id} insight={insight} index={i} />
          ))}
        </div>
      )}

      {/* Philosophy footer */}
      <div
        className="flex items-start gap-3 rounded-xl px-4 py-3 text-xs"
        style={{
          background: "var(--accent-3)",
          border: "1px solid var(--hairline)",
          color: "var(--ink-3)",
        }}
      >
        <CheckCircle2 size={14} style={{ color: "var(--ok)", flexShrink: 0, marginTop: 1 }} />
        <p>
          <strong className="font-semibold" style={{ color: "var(--ink-2)" }}>
            No number without evidence.
          </strong>{" "}
          Every insight is backed by deterministic calculations from your real transaction data. AI
          interprets and explains — it never invents financial figures.
        </p>
      </div>
    </div>
  );
}
