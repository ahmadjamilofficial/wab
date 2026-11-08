// ─── Financial Timeline Page ──────────────────────────────────────────────────
// The living record of your financial world.
// Every event is meaningful — no UI noise.

import { createFileRoute } from "@tanstack/react-router";
import { Clock, Filter } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { useTransactions, useReconciliationFlags } from "@/lib/data-hooks";
import { useFinancialEvents } from "@/lib/financial-intelligence-hooks";
import {
  FinancialTimeline,
  generateTimelineFromTransactions,
  type TimelineEntry,
} from "@/components/intelligence/FinancialTimeline";
import { useLedgerContext } from "@/lib/use-ledger-context";
import type { EventSeverity } from "@/lib/financial-intelligence";

export const Route = createFileRoute("/app/timeline")({
  component: FinancialTimelinePage,
});

type FilterLevel = "ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "SUCCESS";

function FinancialTimelinePage() {
  const { profile } = useAuth();
  const { currency } = useLedgerContext();

  const { data: transactions = [], isLoading: txLoading } = useTransactions(profile?.org_id);
  const { data: flags = [] } = useReconciliationFlags(profile?.org_id);
  const { data: events = [], isLoading: eventsLoading } = useFinancialEvents(100);

  const [filter, setFilter] = useState<FilterLevel>("ALL");

  // Build timeline entries — prefer DB events, fall back to synthetic
  const rawEntries: TimelineEntry[] =
    events.length > 0
      ? events.map((e) => ({
          id: e.id,
          date: e.created_at,
          isToday: new Date(e.created_at).toDateString() === new Date().toDateString(),
          isYesterday:
            new Date(e.created_at).toDateString() ===
            new Date(Date.now() - 86400000).toDateString(),
          severity: e.severity as EventSeverity,
          title: e.title,
          description: e.description,
          confidence: e.confidence,
          eventType: e.event_type,
          actionLabel: e.entity_type ? "View details" : undefined,
          actionLink: e.entity_type === "transaction" ? "/app/ledger" : "/app/overview",
        }))
      : generateTimelineFromTransactions(transactions, flags, currency);

  const filteredEntries =
    filter === "ALL" ? rawEntries : rawEntries.filter((e) => e.severity === filter);

  const isLoading = (eventsLoading || txLoading) && rawEntries.length === 0;

  const filterOptions: { label: string; value: FilterLevel; color: string }[] = [
    { label: "All Events", value: "ALL", color: "var(--ink-2)" },
    { label: "Critical", value: "CRITICAL", color: "var(--bad)" },
    { label: "High", value: "HIGH", color: "var(--warn)" },
    { label: "Medium", value: "MEDIUM", color: "var(--info)" },
    { label: "Success", value: "SUCCESS", color: "var(--ok)" },
  ];

  return (
    <div className="space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>
            Financial Timeline
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
            The living record of every meaningful financial event in your world.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={16} strokeWidth={1.75} style={{ color: "var(--ink-3)" }} />
          <span className="text-sm" style={{ color: "var(--ink-3)" }}>
            {rawEntries.length} events
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={14} style={{ color: "var(--ink-3)" }} />
        {filterOptions.map(({ label, value, color }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
            style={{
              background:
                filter === value
                  ? `color-mix(in srgb, ${color} 12%, transparent)`
                  : "var(--accent-4)",
              color: filter === value ? color : "var(--ink-3)",
              border: `1px solid ${filter === value ? `color-mix(in srgb, ${color} 25%, transparent)` : "var(--hairline)"}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <Panel>
        {rawEntries.length === 0 && !isLoading && (
          <div className="py-4 text-center">
            <p className="text-sm font-medium">No events match this filter</p>
            <button
              type="button"
              onClick={() => setFilter("ALL")}
              className="mt-2 text-xs"
              style={{ color: "var(--color-accent)" }}
            >
              Show all events
            </button>
          </div>
        )}
        <FinancialTimeline
          entries={filteredEntries}
          isLoading={isLoading}
          showEmpty={rawEntries.length === 0}
        />
      </Panel>

      {/* Legend */}
      {rawEntries.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-4 rounded-xl px-4 py-3 text-xs"
          style={{
            background: "var(--accent-3)",
            border: "1px solid var(--hairline)",
            color: "var(--ink-3)",
          }}
        >
          <span className="font-semibold">Event types:</span>
          {[
            { color: "var(--bad)", label: "Critical" },
            { color: "var(--warn)", label: "Warning" },
            { color: "var(--ok)", label: "Success" },
            { color: "var(--info)", label: "Info" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: color }} />
              {label}
            </div>
          ))}
          <span className="ml-auto">
            Only meaningful events are shown. UI actions are not recorded.
          </span>
        </div>
      )}
    </div>
  );
}
