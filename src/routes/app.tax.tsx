import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Info,
  Leaf,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { useState } from "react";
import { Btn, Panel, reveal, StatusPill } from "@/components/kit";
import { useAuth } from "@/lib/auth-context";
import { useTransactions } from "@/lib/data-hooks";
import { computeTax, suggestHarvesting, type Jurisdiction } from "@/lib/tax";
import { useLedgerContext } from "@/lib/use-ledger-context";

export const Route = createFileRoute("/app/tax")({
  component: TaxCenter,
});

function TaxCenter() {
  const { profile } = useAuth();
  const { jurisdiction: detectedJ, taxYear: currentYear } = useLedgerContext();

  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | null>(null);
  const [filerStatus, setFilerStatus] = useState<"Filer" | "Non-Filer">("Filer");
  const [taxYear, setTaxYear] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const { data: transactions = [] } = useTransactions(profile?.org_id);

  // Use detected values unless the user has overridden them via the dropdowns
  const activeJurisdiction = jurisdiction ?? detectedJ;
  const activeYear = taxYear ?? currentYear;

  const tax = computeTax(transactions, {
    jurisdiction: activeJurisdiction,
    filerStatus,
    taxYear: activeYear,
  });
  const harvest = suggestHarvesting(transactions, tax.totalGain);

  async function getAIExplanation() {
    setLoadingAI(true);
    try {
      const resp = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt:
            "You are a tax computation expert for PSX (Pakistan) and NSE (India) traders. Explain the provided tax calculation in plain English, covering FIFO lot matching, holding period tiers, and CGT bands. Be concise (3-4 sentences) and include key actionable advice.",
          userPrompt: `Tax computation for ${activeJurisdiction} — Filer status: ${filerStatus}\nShort-term gain: ${tax.shortTermGain}\nLong-term gain: ${tax.longTermGain}\nEstimated tax due: ${tax.estimatedTaxDue}\nTax year: ${activeYear}`,
        }),
      });
      let explanation = "";
      if (resp.ok) {
        const reader = resp.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            explanation += decoder.decode(value, { stream: true });
          }
        }
      }
      setAiExplanation(explanation || "AI explanation unavailable.");
    } catch {
      setAiExplanation("AI explanation unavailable. Please try again.");
    } finally {
      setLoadingAI(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString("en-PK", { maximumFractionDigits: 0 });

  const currency = activeJurisdiction === "PSX" ? "PKR" : "INR";

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Tax Center</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
          FIFO lot matching, holding-period tiers and CGT bands computed in code — never AI-guessed.
        </p>
      </div>

      {/* Controls */}
      <Panel>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
              Tax year
            </label>
            <select
              value={activeYear}
              onChange={(e) => setTaxYear(e.target.value)}
              className="rounded-[10px] border bg-surface px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            >
              {[0, 1, 2].map((offset) => {
                const y = String(new Date().getFullYear() - offset);
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
              Jurisdiction
            </label>
            <select
              value={activeJurisdiction}
              onChange={(e) => setJurisdiction(e.target.value as Jurisdiction)}
              className="rounded-[10px] border bg-surface px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            >
              <option value="PSX">PSX — Pakistan</option>
              <option value="NSE">NSE — India</option>
            </select>
          </div>
          {activeJurisdiction === "PSX" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ink-2)" }}>
                Filer status
              </label>
              <select
                value={filerStatus}
                onChange={(e) => setFilerStatus(e.target.value as "Filer" | "Non-Filer")}
                className="rounded-[10px] border bg-surface px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--hairline)" }}
              >
                <option>Filer</option>
                <option>Non-Filer</option>
              </select>
            </div>
          )}
          <div className="flex items-end ml-auto">
            <Btn variant="secondary">
              <Download size={15} strokeWidth={1.75} />
              Generate Tax Report
            </Btn>
          </div>
        </div>
      </Panel>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Short-term Gain",
            value: `${currency} ${fmt(tax.shortTermGain)}`,
            sublabel: `Tax @ ${activeJurisdiction === "PSX" ? "15%" : "20%"}`,
            tone: tax.shortTermGain >= 0 ? ("ok" as const) : ("bad" as const),
            i: 0,
          },
          {
            label: "Long-term Gain",
            value: `${currency} ${fmt(tax.longTermGain)}`,
            sublabel: `Tax @ ${activeJurisdiction === "PSX" ? "12.5%" : "12.5%"}`,
            tone: tax.longTermGain >= 0 ? ("ok" as const) : ("bad" as const),
            i: 1,
          },
          {
            label: "Dividend WHT",
            value: `${currency} ${fmt(tax.dividendWHT)}`,
            sublabel: "Already withheld",
            tone: "info" as const,
            i: 2,
          },
          {
            label: "Estimated Tax Due",
            value: `${currency} ${fmt(tax.estimatedTaxDue)}`,
            sublabel: "FIFO · deterministic",
            tone: "warn" as const,
            i: 3,
          },
        ].map(({ label, value, sublabel, tone, i }) => (
          <motion.div key={label} variants={reveal} custom={i} initial="hidden" animate="visible">
            <Panel>
              <p className="text-xs" style={{ color: "var(--ink-2)" }}>
                {label}
              </p>
              <p className="tnum mt-1.5 text-xl font-semibold">{value}</p>
              <StatusPill tone={tone} className="mt-2">
                {sublabel}
              </StatusPill>
            </Panel>
          </motion.div>
        ))}
      </div>

      {/* AI Explanation */}
      <Panel>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
            <p className="text-sm font-semibold">Gemini AI Tax Explanation</p>
          </div>
          <Btn variant="secondary" onClick={getAIExplanation} disabled={loadingAI}>
            {loadingAI ? "Explaining…" : aiExplanation ? "Refresh" : "Explain in plain English"}
          </Btn>
        </div>
        {aiExplanation ? (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {aiExplanation}
          </p>
        ) : (
          <p className="mt-3 text-sm" style={{ color: "var(--ink-3)" }}>
            Click "Explain in plain English" to have Gemini AI narrate your tax computation results
            in simple language. The deterministic FIFO math is computed in code first — AI only
            explains the results.
          </p>
        )}
      </Panel>

      {/* FIFO lots table */}
      {tax.lots.length > 0 && (
        <Panel>
          <p className="mb-4 text-sm font-semibold">FIFO Lot Matching</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
                  {[
                    "Ticker",
                    "Buy date",
                    "Sell date",
                    "Qty",
                    "Cost basis",
                    "Sale price",
                    "Holding",
                    "Gain",
                    "Tax rate",
                    "Tax due",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left text-xs font-semibold"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tax.lots.map((lot, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid var(--hairline)" }}
                    className="ledger-row transition-colors"
                  >
                    <td className="px-3 py-3 text-sm font-semibold">{lot.ticker}</td>
                    <td className="px-3 py-3 text-xs" style={{ color: "var(--ink-2)" }}>
                      {lot.buyDate}
                    </td>
                    <td className="px-3 py-3 text-xs" style={{ color: "var(--ink-2)" }}>
                      {lot.sellDate}
                    </td>
                    <td className="tnum px-3 py-3 text-sm">{lot.quantity}</td>
                    <td className="tnum px-3 py-3 text-sm">{lot.costBasis.toFixed(2)}</td>
                    <td className="tnum px-3 py-3 text-sm">{lot.salePrice.toFixed(2)}</td>
                    <td className="px-3 py-3">
                      <StatusPill tone={lot.isShortTerm ? "warn" : "ok"}>
                        {lot.holdingDays}d · {lot.isShortTerm ? "ST" : "LT"}
                      </StatusPill>
                    </td>
                    <td
                      className="tnum px-3 py-3 text-sm font-medium"
                      style={{ color: lot.gain >= 0 ? "var(--ok)" : "var(--bad)" }}
                    >
                      {lot.gain >= 0 ? "+" : ""}
                      {fmt(lot.gain)}
                    </td>
                    <td className="tnum px-3 py-3 text-sm" style={{ color: "var(--ink-2)" }}>
                      {(lot.taxRate * 100).toFixed(1)}%
                    </td>
                    <td
                      className="tnum px-3 py-3 text-sm font-medium"
                      style={{ color: "var(--color-accent)" }}
                    >
                      {fmt(lot.taxDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Tax-loss harvesting */}
      {harvest.length > 0 && (
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <Leaf size={18} strokeWidth={1.75} style={{ color: "var(--ok)" }} />
            <p className="text-sm font-semibold">Tax-Loss Harvesting Opportunities</p>
          </div>
          <div className="space-y-3">
            {harvest.map((h) => (
              <div
                key={h.ticker}
                className="flex items-start justify-between rounded-xl p-4"
                style={{
                  background: "color-mix(in srgb, var(--ok) 5%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--ok) 15%, transparent)",
                }}
              >
                <div className="flex items-start gap-3">
                  <TrendingDown
                    size={16}
                    strokeWidth={1.75}
                    style={{ color: "var(--bad)", marginTop: 2 }}
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      {h.ticker}
                      <span className="ml-2 text-xs font-normal" style={{ color: "var(--ink-3)" }}>
                        {h.exchange} · {h.holdingDays}d held
                      </span>
                    </p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
                      {h.rationale}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-sm font-semibold" style={{ color: "var(--bad)" }}>
                    {currency} {fmt(h.unrealizedLoss)}
                  </p>
                  <p className="tnum text-xs" style={{ color: "var(--ok)" }}>
                    saves ~{currency}{" "}
                    {fmt(h.potentialOffset * (jurisdiction === "PSX" ? 0.15 : 0.2))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tax.lots.length === 0 && (
        <Panel className="py-12 text-center">
          <Info
            size={28}
            strokeWidth={1.5}
            className="mx-auto mb-3"
            style={{ color: "var(--ink-3)" }}
          />
          <p className="font-medium">No realized gains in {taxYear}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
            Add sell transactions for FY {taxYear} to see FIFO lot matching.
          </p>
        </Panel>
      )}

      {/* Disclaimer */}
      <div
        className="flex gap-2.5 rounded-2xl px-5 py-4 text-sm"
        style={{
          background: "color-mix(in srgb, var(--info) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--info) 15%, transparent)",
        }}
      >
        <AlertCircle
          size={16}
          strokeWidth={1.75}
          style={{ color: "var(--info)", marginTop: 2, flexShrink: 0 }}
        />
        <p style={{ color: "var(--ink-2)" }}>
          <strong>Not tax or legal advice.</strong> These calculations are indicative only and based
          on the data you have uploaded. Always consult a qualified tax professional before filing.
        </p>
      </div>
    </div>
  );
}
