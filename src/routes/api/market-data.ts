import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/market-data")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            tickers: Array<{ ticker: string; exchange: "PSX" | "NSE" }>;
          };
          const tickers = body.tickers || [];

          const prices = await fetchYahooPrices(tickers);

          return new Response(JSON.stringify({ prices }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ prices: [] }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

interface TickerQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  currency: string;
  marketState: "REGULAR" | "CLOSED" | "PRE" | "POST";
}

interface MarketPrice {
  ticker: string;
  exchange: "PSX" | "NSE";
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  lastUpdated: string;
}

// ─── Fetch single ticker price from Yahoo Finance (server-side) ─────────────

async function fetchYahooPrice(ticker: string): Promise<TickerQuote | null> {
  try {
    const proxyUrl = "https://query1.finance.yahoo.com/v8/finance/chart/";
    const response = await fetch(`${proxyUrl}${ticker}?interval=1d&range=1d`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const quote = result?.indicators?.quote?.[0];

    if (!meta || !quote) return null;

    const latestPrice = quote.close?.[quote.close.length - 1] || meta.regularMarketPrice;
    const prevClose = meta.previousClose || quote.open?.[0];

    if (!latestPrice || prevClose === undefined) return null;

    const change = latestPrice - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: meta.symbol,
      regularMarketPrice: latestPrice,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      currency: meta.currency || "USD",
      marketState: meta.marketState || "CLOSED",
    };
  } catch (error) {
    return null;
  }
}

// ─── Normalize ticker symbols for Yahoo Finance ─────────────────────────────

function normalizeTicker(ticker: string, exchange: "PSX" | "NSE"): string {
  // NSE tickers need .NS suffix
  if (exchange === "NSE") {
    return `${ticker}.NS`;
  }
  // Yahoo Finance maps Pakistan Stock Exchange symbols to the .KAR suffix.
  return `${ticker}.KAR`;
}

// ─── Fetch multiple ticker prices (batched) ─────────────────────────────────

async function fetchYahooPrices(
  tickers: Array<{ ticker: string; exchange: "PSX" | "NSE" }>,
): Promise<MarketPrice[]> {
  const prices: MarketPrice[] = [];

  for (const { ticker, exchange } of tickers) {
    const normalized = normalizeTicker(ticker, exchange);
    const quote = await fetchYahooPrice(normalized);

    if (quote) {
      const currency = exchange === "NSE" ? "INR" : "PKR";
      const marketPrice: MarketPrice = {
        ticker,
        exchange,
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        currency,
        lastUpdated: new Date().toISOString(),
      };

      prices.push(marketPrice);
    }

    // Add small delay between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return prices;
}
