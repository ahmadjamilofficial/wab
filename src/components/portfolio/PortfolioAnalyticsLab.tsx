import { useMemo, useState } from "react";
import { Activity, BarChart3, Calculator, CandlestickChart, Layers3, PieChart as PieIcon, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Transaction } from "@/lib/demo-data";

type Props = { transactions: Transaction[]; currency: string };
type Tab = "equity" | "ticker" | "activity" | "allocation" | "dividends" | "drawdown";
const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "equity", label: "Equity flow", icon: TrendingUp },
  { id: "ticker", label: "Ticker P&L", icon: BarChart3 },
  { id: "activity", label: "Trade activity", icon: Activity },
  { id: "allocation", label: "Allocation", icon: PieIcon },
  { id: "dividends", label: "Dividends", icon: Layers3 },
  { id: "drawdown", label: "Drawdown", icon: TrendingDown },
];
const colors = ["#34D399", "#60A5FA", "#A78BFA", "#FBBF24", "#F472B6", "#22D3EE", "#FB7185", "#A3E635"];
const card = { border: "1px solid var(--hairline)", background: "var(--color-sheet)" };

export function PortfolioAnalyticsLab({ transactions, currency }: Props) {
  const [tab, setTab] = useState<Tab>("equity");
  const [ticker, setTicker] = useState("ALL");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("100");
  const [stop, setStop] = useState("95");
  const [capital, setCapital] = useState("100000");
  const [period, setPeriod] = useState("ALL");

  const posted = useMemo(() => transactions.filter(t => t.status === "posted").slice().sort((a,b) => a.trade_date.localeCompare(b.trade_date)), [transactions]);
  const tickers = useMemo(() => [...new Set(posted.map(t => t.ticker))].sort(), [posted]);
  const filtered = useMemo(() => posted.filter(t => (ticker === "ALL" || t.ticker === ticker) && (period === "ALL" || t.trade_date >= period)), [posted, ticker, period]);

  const data = useMemo(() => {
    const byTicker = new Map<string, { ticker: string; buys: number; sells: number; shares: number; dividends: number; sellValue: number; buyValue: number }>();
    const daily = new Map<string, { date: string; buys: number; sells: number; dividends: number; netFlow: number }>();
    for (const t of filtered) {
      const v = byTicker.get(t.ticker) || { ticker: t.ticker, buys: 0, sells: 0, shares: 0, dividends: 0, sellValue: 0, buyValue: 0 };
      const d = daily.get(t.trade_date) || { date: t.trade_date, buys: 0, sells: 0, dividends: 0, netFlow: 0 };
      if (t.action === "BUY") { v.buys += t.quantity*t.price+t.fees; v.buyValue += t.quantity*t.price+t.fees; v.shares += t.quantity; d.buys += t.quantity*t.price; d.netFlow -= t.quantity*t.price+t.fees; }
      else if (t.action === "SELL") { v.sells += t.quantity*t.price-t.fees; v.sellValue += t.quantity*t.price-t.fees; v.shares -= t.quantity; d.sells += t.quantity*t.price; d.netFlow += t.quantity*t.price-t.fees; }
      else { v.dividends += t.quantity*t.price-t.wht; d.dividends += t.quantity*t.price-t.wht; d.netFlow += t.quantity*t.price-t.wht; }
      byTicker.set(t.ticker,v); daily.set(t.trade_date,d);
    }
    const activity = [...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));
    let flow = 0, peak = 0;
    const equity = activity.map(d => { flow += d.netFlow; peak = Math.max(peak,flow); return { ...d, cumulative: flow, drawdown: peak ? (flow-peak)/peak*100 : 0 }; });
    const alloc = [...byTicker.values()].map(v=>({name:v.ticker,value:Math.max(0,v.shares)*(v.buyValue/(Math.max(1,v.shares))),weight:Math.max(0,v.shares)})).filter(v=>v.weight>0);
    const tickerRows = [...byTicker.values()].map(v=>({ticker:v.ticker, buys:v.buyValue, sells:v.sellValue, dividends:v.dividends, netCash:v.sellValue+v.dividends-v.buyValue, shares:v.shares})).sort((a,b)=>b.netCash-a.netCash);
    return { activity, equity, alloc, tickerRows, divs: activity.filter(d=>d.dividends>0) };
  }, [filtered]);

  const fmt = (v:number) => v.toLocaleString("en-PK",{maximumFractionDigits:2});
  const entryNum = Number(entry), stopNum = Number(stop), capitalNum = Number(capital), riskNum = Number(riskPct);
  const riskAmount = capitalNum * riskNum/100;
  const perShareRisk = Math.abs(entryNum-stopNum);
  const size = perShareRisk > 0 ? Math.floor(riskAmount/perShareRisk) : 0;

  return <section className="space-y-4 rounded-[24px] p-4 sm:p-6" style={{...card, boxShadow:"0 8px 30px color-mix(in oklch,var(--color-text) 3%,transparent)"}}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em]" style={{color:"var(--ink-3)"}}><CandlestickChart size={14}/> Analytics lab</p><h2 className="mt-2 text-xl font-semibold">Interactive portfolio intelligence</h2><p className="mt-1 text-xs" style={{color:"var(--ink-3)"}}>Switch views, filter symbols and explore your posted ledger history.</p></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Ticker filter" value={ticker} onChange={e=>setTicker(e.target.value)} className="rounded-xl px-3 py-2 text-xs" style={card}><option value="ALL">All tickers</option>{tickers.map(t=><option key={t} value={t}>{t}</option>)}</select>
        <select aria-label="History range" value={period} onChange={e=>setPeriod(e.target.value)} className="rounded-xl px-3 py-2 text-xs" style={card}><option value="ALL">All history</option><option value="2026-01-01">2026 YTD</option><option value="2025-07-01">Since Jul 2025</option><option value="2025-08-01">Since Aug 2025</option></select>
      </div>
    </header>
    <div className="flex gap-1 overflow-x-auto rounded-xl p-1" style={{background:"var(--color-login-bg)"}}>{tabs.map(t=>{const Icon=t.icon;return <button key={t.id} onClick={()=>setTab(t.id)} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all" style={{background:tab===t.id?"var(--color-sheet)":"transparent",color:tab===t.id?"var(--color-text)":"var(--ink-3)",boxShadow:tab===t.id?"0 1px 5px #00000012":"none"}}><Icon size={14}/>{t.label}</button>})}</div>
    <div className="h-[300px] min-w-0 sm:h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
      {tab==="equity" ? <AreaChart data={data.equity}><defs><linearGradient id="wab-lab-equity" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34D399" stopOpacity={.28}/><stop offset="100%" stopColor="#34D399" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--hairline)" strokeDasharray="3 4"/><XAxis dataKey="date" tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmt} tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><Tooltip formatter={(v:number)=>[currency+" "+fmt(v),"Net cash flow"]} contentStyle={{border:"1px solid var(--hairline)",borderRadius:12,background:"var(--color-sheet)"}}/><Area dataKey="cumulative" type="monotone" stroke="#34D399" strokeWidth={2.2} fill="url(#wab-lab-equity)" activeDot={{r:4}}/></AreaChart>
      : tab==="ticker" ? <BarChart data={data.tickerRows}><CartesianGrid vertical={false} stroke="var(--hairline)" strokeDasharray="3 4"/><XAxis dataKey="ticker" tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmt} tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><Tooltip formatter={(v:number)=>[currency+" "+fmt(v)]} contentStyle={{border:"1px solid var(--hairline)",borderRadius:12,background:"var(--color-sheet)"}}/><Bar dataKey="netCash" name="Net cash flow" radius={[4,4,0,0]}>{data.tickerRows.map((r,i)=><Cell key={r.ticker} fill={r.netCash>=0?"#34D399":"#FB7185"}/>)}</Bar></BarChart>
      : tab==="activity" ? <BarChart data={data.activity}><CartesianGrid vertical={false} stroke="var(--hairline)" strokeDasharray="3 4"/><XAxis dataKey="date" tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmt} tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><Tooltip formatter={(v:number)=>[currency+" "+fmt(v)]} contentStyle={{border:"1px solid var(--hairline)",borderRadius:12,background:"var(--color-sheet)"}}/><Bar dataKey="buys" name="Buy turnover" fill="#60A5FA" radius={[3,3,0,0]}/><Bar dataKey="sells" name="Sell turnover" fill="#34D399" radius={[3,3,0,0]}/></BarChart>
      : tab==="allocation" ? <PieChart><Pie data={data.alloc} dataKey="weight" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={3}>{data.alloc.map((d,i)=><Cell key={d.name} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={(v:number)=>[fmt(v)+" shares","Position"]} contentStyle={{border:"1px solid var(--hairline)",borderRadius:12,background:"var(--color-sheet)"}}/></PieChart>
      : tab==="dividends" ? <BarChart data={data.divs}><CartesianGrid vertical={false} stroke="var(--hairline)" strokeDasharray="3 4"/><XAxis dataKey="date" tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmt} tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><Tooltip formatter={(v:number)=>[currency+" "+fmt(v),"Net dividend"]} contentStyle={{border:"1px solid var(--hairline)",borderRadius:12,background:"var(--color-sheet)"}}/><Bar dataKey="dividends" fill="#A78BFA" radius={[4,4,0,0]}/></BarChart>
      : <AreaChart data={data.equity}><CartesianGrid vertical={false} stroke="var(--hairline)" strokeDasharray="3 4"/><XAxis dataKey="date" tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>v.toFixed(1)+"%"} tick={{fontSize:10,fill:"var(--ink-3)"}} axisLine={false} tickLine={false}/><Tooltip formatter={(v:number)=>[v.toFixed(2)+"%","Drawdown on cumulative net flow"]} contentStyle={{border:"1px solid var(--hairline)",borderRadius:12,background:"var(--color-sheet)"}}/><Area dataKey="drawdown" type="monotone" stroke="#FB7185" strokeWidth={2} fill="#FB718522" activeDot={{r:4}}/></AreaChart>}
      </ResponsiveContainer>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl p-4" style={{...card,background:"var(--color-login-bg)"}}><p className="text-xs" style={{color:"var(--ink-3)"}}>Recorded trades</p><p className="tnum mt-1 text-xl font-semibold">{filtered.filter(t=>t.action!=="DIV").length}</p><p className="mt-1 text-[10px]" style={{color:"var(--ink-3)"}}>Filtered posted BUY / SELL events</p></div>
      <div className="rounded-xl p-4" style={{...card,background:"var(--color-login-bg)"}}><p className="text-xs" style={{color:"var(--ink-3)"}}>Net cash flow</p><p className="tnum mt-1 text-xl font-semibold" style={{color:data.equity.at(-1)?.cumulative>=0?"var(--ok)":"var(--bad)"}}>{currency} {fmt(data.equity.at(-1)?.cumulative||0)}</p><p className="mt-1 text-[10px]" style={{color:"var(--ink-3)"}}>Sell proceeds + dividends − buys and recorded fees</p></div>
      <div className="rounded-xl p-4" style={{...card,background:"var(--color-login-bg)"}}><p className="text-xs" style={{color:"var(--ink-3)"}}>Dividend receipts</p><p className="tnum mt-1 text-xl font-semibold">{currency} {fmt(data.divs.reduce((s,d)=>s+d.dividends,0))}</p><p className="mt-1 text-[10px]" style={{color:"var(--ink-3)"}}>Recorded dividends after WHT</p></div>
    </div>
    <div className="rounded-2xl p-4 sm:p-5" style={{...card,background:"linear-gradient(145deg,color-mix(in oklch,var(--color-accent) 5%,var(--color-sheet)),var(--color-sheet))"}}>
      <div className="mb-3 flex items-center gap-2"><Calculator size={15} style={{color:"var(--color-accent)"}}/><h3 className="text-sm font-semibold">Position sizing & risk calculator</h3><span className="ml-auto text-[10px]" style={{color:"var(--ink-3)"}}>Interactive · illustrative</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs" style={{color:"var(--ink-3)"}}>Capital ({currency})<input type="number" value={capital} onChange={e=>setCapital(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={card}/></label>
        <label className="text-xs" style={{color:"var(--ink-3)"}}>Risk %<input type="number" min="0" max="100" step=".1" value={riskPct} onChange={e=>setRiskPct(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={card}/></label>
        <label className="text-xs" style={{color:"var(--ink-3)"}}>Entry price<input type="number" min="0" step=".01" value={entry} onChange={e=>setEntry(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={card}/></label>
        <label className="text-xs" style={{color:"var(--ink-3)"}}>Stop price<input type="number" min="0" step=".01" value={stop} onChange={e=>setStop(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={card}/></label>
        <div className="rounded-lg p-3" style={{background:"var(--color-login-bg)"}}><p className="text-[10px]" style={{color:"var(--ink-3)"}}>Max shares by risk</p><p className="tnum text-lg font-semibold">{Number.isFinite(size)&&size>0?size.toLocaleString():"—"}</p><p className="text-[10px]" style={{color:"var(--ink-3)"}}>Risk budget: {currency} {fmt(Math.max(0,riskAmount))}</p></div>
      </div>
      <p className="mt-3 text-[10px]" style={{color:"var(--ink-3)"}}>Position size = risk budget ÷ absolute entry-to-stop distance. This does not include lot sizes, liquidity, fees, gaps, or personal suitability. Analytics are ledger-derived; cumulative cash flow is not a true broker equity curve or realized FIFO P&L.</p>
    </div>
  </section>;
}
