import { ShieldAlert, ShieldCheck } from "lucide-react";

type Position = {
  ticker: string;
  value: number;
  pct?: number;
};

export function PortfolioRiskSnapshot({
  positions,
  currency,
}: {
  positions: Position[];
  currency: string;
}) {
  const holdings = positions
    .filter((position) => Number.isFinite(position.value) && position.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = holdings.reduce((sum, position) => sum + position.value, 0);

  if (holdings.length === 0 || total <= 0) return null;

  const weights = holdings.map((position) => (position.value / total) * 100);
  const largestWeight = weights[0] ?? 0;
  const topThreeWeight = weights.slice(0, 3).reduce((sum, weight) => sum + weight, 0);
  const hhi = weights.reduce((sum, weight) => sum + weight * weight, 0);
  const concentration =
    hhi >= 2500 ? "High" : hhi >= 1500 ? "Moderate" : "Lower";
  const concentrationTone =
    hhi >= 2500 ? "var(--bad)" : hhi >= 1500 ? "var(--warn)" : "var(--ok)";
  const fmt = (value: number) =>
    value.toLocaleString("en-PK", { maximumFractionDigits: 0 });

  return (
    <section
      className="rounded-2xl bg-surface p-5"
      style={{ border: "1px solid var(--hairline)" }}
      aria-label="Portfolio concentration snapshot"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Portfolio Risk Snapshot</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
            Position concentration from recorded cost basis
          </p>
        </div>
        {hhi >= 2500 ? (
          <ShieldAlert size={17} style={{ color: concentrationTone }} />
        ) : (
          <ShieldCheck size={17} style={{ color: concentrationTone }} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: "var(--surface-2, var(--surface))" }}>
          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            Largest position
          </p>
          <p className="tnum mt-1 text-xl font-semibold">{largestWeight.toFixed(1)}%</p>
          <p className="mt-1 truncate text-xs" style={{ color: "var(--ink-2)" }}>
            {holdings[0]?.ticker ?? "—"}
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "var(--surface-2, var(--surface))" }}>
          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            Top 3 positions
          </p>
          <p className="tnum mt-1 text-xl font-semibold">{topThreeWeight.toFixed(1)}%</p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
            Of recorded cost basis
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium">Concentration indicator</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
            HHI · based on position weights
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            color: concentrationTone,
            background: `color-mix(in srgb, ${concentrationTone} 12%, transparent)`,
          }}
        >
          {concentration}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {holdings.slice(0, 5).map((position, index) => {
          const weight = weights[index] ?? 0;
          return (
            <div key={position.ticker}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span style={{ color: "var(--ink-2)" }}>{position.ticker}</span>
                <span className="tnum" style={{ color: "var(--color-text)" }}>
                  {weight.toFixed(1)}% · {currency} {fmt(position.value)}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--hairline)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(weight, 100)}%`,
                    background: index === 0 ? "var(--color-accent)" : "var(--chart-2)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
        Concentration is a portfolio-structure signal, not a forecast or a complete risk
        measure. Values use recorded cost basis; market prices, volatility, correlation and
        beta are not included.
      </p>
    </section>
  );
}
