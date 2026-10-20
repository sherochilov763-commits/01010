// MoneyCard.jsx — Dashboard'dagi ixcham «Pul va foyda» kartasi (batafsil — Kassalar) va «Yonma-yon» taqqoslash jadvali.
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Card } from "../../components/ui.jsx";
import { LINES, LINE_META, lineColor, lineOfOrder } from "../../lib/lines.js";
import { computePnlMonths, monthsBetween } from "../../lib/pnl.js";
import { orderDebt, activePayments } from "../../lib/finance.js";
import { fmt, money, todayStr } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { monthFull } from "./ProfitLoss.jsx";

const mln = (v) => `${(Math.round((v / 1e6) * 100) / 100).toLocaleString("ru-RU")} mln`;
const sg = (v) => (v < 0 ? "−" : "") + fmt(Math.abs(Math.round(v)));

export function MoneyCard({ cashNow, kassaNow, line, orders, transactions, canProfit, onOpen }) {
  const month = todayStr().slice(0, 7);
  const pnl = useMemo(() => (canProfit ? computePnlMonths(orders, transactions, [month], null) : null), [canProfit, orders, transactions, month]);
  const profit = pnl ? (line === "all" ? pnl.total.profit : pnl[line]?.profit || 0) : null;
  const a = Math.max(0, kassaNow.totals.UVIXPRINT), b = Math.max(0, kassaNow.totals.UVONYX);
  return (
    <div data-testid="money-card" style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 14 }}>Pul va foyda · {monthFull(month).split(" ")[0].toLowerCase()}</b>
        <button type="button" onClick={onOpen} data-testid="money-card-open" style={{ marginLeft: "auto", border: 0, background: "none", color: THEME.blue, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>Kassalar <ArrowRight size={13} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cashNow != null && profit != null ? "1fr 1fr" : "1fr", gap: 12, marginTop: 10 }}>
        {cashNow != null && <div><div style={{ fontSize: 12, color: THEME.muted }}>Jami pul (hozir)</div><div data-testid="money-now" style={{ fontSize: 21, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: cashNow < 0 ? THEME.rose : THEME.text }}>{sg(cashNow)}</div></div>}
        {profit != null && <div><div style={{ fontSize: 12, color: THEME.muted }} title="Sof foyda = shu oy tushgan pul − barcha rasxodlar (Kassalar → Foyda va zarar bilan bir xil)">Shu oy sof foyda</div><div data-testid="money-profit" style={{ fontSize: 21, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: profit < 0 ? THEME.rose : THEME.greenText }}>{sg(profit)}</div></div>}
      </div>
      {cashNow != null && line === "all" && a + b > 0 && <>
        <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", marginTop: 12, background: THEME.chip }}>
          <i style={{ flex: a, background: lineColor("UVIXPRINT", THEME.isDark) }} /><i style={{ flex: b, background: lineColor("UVONYX", THEME.isDark) }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: THEME.muted, marginTop: 5 }}><span>UVIXPRINT {mln(kassaNow.totals.UVIXPRINT)}</span><span>UVONYX {mln(kassaNow.totals.UVONYX)}</span></div>
      </>}
    </div>
  );
}

// «Yonma-yon»: ikki yo'nalish ustma-ust qo'shilmasdan, bitta jadvalda
export function lineCompare(orders, transactions, kassa, canProfit, work, range) {
  const from = range?.from || "", to = range?.to || "";
  const inP = (d) => (!from || String(d || "") >= from) && (!to || String(d || "") <= to);
  const months = from && to ? monthsBetween(from, to) : [todayStr().slice(0, 7)];
  const pnl = canProfit ? computePnlMonths(orders, transactions, months, work) : null;
  const r = {};
  for (const l of LINES) {
    const os = orders.filter((o) => !o.deletedAt && lineOfOrder(o) === l);
    const inPer = os.filter((o) => inP(o.date));
    const sum = inPer.reduce((s, o) => s + (o.agreementUzs || 0), 0);
    r[l] = {
      orders: sum, count: inPer.length,
      income: os.reduce((s, o) => s + activePayments(o).filter((p) => inP(p.date)).reduce((a, p) => a + (p.amount || 0), 0), 0),
      debt: os.reduce((s, o) => s + orderDebt(o), 0),
      cash: kassa ? kassa.totals[l] : null,
      profit: pnl ? pnl[l].profit : null,
      avg: inPer.length ? sum / inPer.length : 0,
    };
  }
  return r;
}

export function SplitCompare({ orders, transactions, kassa, canProfit, work, range }) {
  const r = useMemo(() => lineCompare(orders, transactions, kassa, canProfit, work, range), [orders, transactions, kassa, canProfit, work, range]);
  const A = r.UVIXPRINT, B = r.UVONYX;
  const lead = (a, b, kind = "sum", better = "more") => {
    if (a == null || b == null || (a === 0 && b === 0)) return <span style={{ color: THEME.dim }}>—</span>;
    const aWins = better === "more" ? a > b : a < b;
    const w = aWins ? "UVIXPRINT" : "UVONYX";
    const big = Math.max(Math.abs(a), Math.abs(b)), small = Math.min(Math.abs(a), Math.abs(b));
    const txt = kind === "ratio" && small > 0 ? `×${(Math.round((big / small) * 10) / 10).toLocaleString("ru-RU")}` : `+${mln(Math.abs(a - b))}`;
    const c = lineColor(w, THEME.isDark);
    return <span style={{ fontSize: 11.5, fontWeight: 800, color: c, background: c + "1F", borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{w === "UVIXPRINT" ? "UVIX" : "ONYX"} {txt}</span>;
  };
  const rows = [
    ["Buyurtmalar", `${fmt(A.orders)} · ${A.count} ta`, `${fmt(B.orders)} · ${B.count} ta`, lead(A.orders, B.orders)],
    ["Tushum (to'lovlar)", fmt(A.income), fmt(B.income), lead(A.income, B.income, "ratio")],
    ["Qarzdorlik", fmt(A.debt), fmt(B.debt), lead(A.debt, B.debt, "sum", "less")],
    ...(kassa ? [["Kassa (hozir)", sg(A.cash), sg(B.cash), lead(A.cash, B.cash)]] : []),
    ...(canProfit ? [["Sof foyda", sg(A.profit), sg(B.profit), lead(A.profit, B.profit)]] : []),
    ["O'rtacha chek", fmt(Math.round(A.avg)), fmt(Math.round(B.avg)), lead(A.avg, B.avg, "ratio")],
  ];
  const th = { padding: "9px 12px", fontSize: 12, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" };
  return (
    <Card data-testid="split-compare" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 15, borderBottom: `1px solid ${THEME.border}` }}>Yonma-yon · ikki yo'nalish alohida</div>
      <div style={{ overflowX: "auto" }} className="uvix-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontVariantNumeric: "tabular-nums", minWidth: 560 }}>
          <thead><tr style={{ borderBottom: `1px solid ${THEME.border}` }}><th style={{ ...th, textAlign: "left" }} />{LINES.map((l) => <th key={l} style={{ ...th, color: lineColor(l, THEME.isDark) }}>● {LINE_META[l].name}</th>)}<th style={{ ...th, color: THEME.muted }}>Qaysi oldinda</th></tr></thead>
          <tbody>{rows.map(([l, a, b, w]) => (
            <tr key={l} data-cmp-row={l} style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <td style={{ padding: "9px 12px", fontWeight: 600 }}>{l}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", color: String(a).startsWith("−") ? THEME.rose : undefined }}>{a}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", color: String(b).startsWith("−") ? THEME.rose : undefined }}>{b}</td>
              <td style={{ padding: "9px 12px", textAlign: "right" }}>{w}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}
export { money };
