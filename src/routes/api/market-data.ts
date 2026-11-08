import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/market-data")({
  server: {
    handlers: {
      GET: async ({ request }) => {\n        try {\n          const url = new URL(request.url);\n          const symbol = url.searchParams.get(\"symbol\") || \"\";\n          const exchange = (url.searchParams.get(\"exchange\") || \"PSX\") as \"PSX\" | \"NSE\";\n          const range = url.searchParams.get(\"range\") || \"1mo\";\n          const interval = url.searchParams.get(\"interval\") || \"1d\";\n          if (!/^[A-Z0-9.&_-]{1,20}$/i.test(symbol) || ![\"PSX\", \"NSE\"].includes(exchange) || ![\"1d\",\"5d\",\"1mo\",\"3mo\",\"1y\"].includes(range) || ![\"5m\",\"30m\",\"1d\"].includes(interval)) return Response.json({ points: [] }, { status: 400 });\n          const ticker = normalizeTicker(symbol, exchange);\n          const response = await fetch(\"https://query1.finance.yahoo.com/v8/finance/chart/\" + encodeURIComponent(ticker) + \"?interval=\" + interval + \"&range=\" + range, { headers: { \"User-Agent\": \"Mozilla/5.0\" } });\n          if (!response.ok) return Response.json({ points: [] }, { status: 502 });\n          const data = await response.json();\n          const result = data.chart?.result?.[0];\n          const timestamps = result?.timestamp || [];\n          const closes = result?.indicators?.quote?.[0]?.close || [];\n          const points = timestamps.map((time: number, i: number) => ({ time: time * 1000, price: closes[i] })).filter((p: {time:number;price:number|null}) => typeof p.price === \"number\" && Number.isFinite(p.price));\n          return Response.json({ points, meta: { symbol: result?.meta?.symbol, currency: result?.meta?.currency, source: \"Yahoo Finance\", fetchedAt: new Date().toISOString() } });\n        } catch { return Response.json({ points: [] }, { status: 500 }); }\n      },\n      POST: async ({ request }) => {
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
