// ProfitLoss.jsx — «Foyda va zarar» jadvali (UVIXPRINT | UVONYX | Jami). Endi Kassalar → «Foyda va zarar» yorlig'ida.
// Tushum — davrda kelgan to'lovlar; umumiy rasxod — har oy o'sha oy tushumi ulushida bo'linadi.
import { useContext, useMemo } from "react";
import { Card } from "../../components/ui.jsx";
import { LINE_META, WorkStatsContext, lineColor } from "../../lib/lines.js";
import { computePnlMonths } from "../../lib/pnl.js";
import { fmt } from "../../lib/format.js";
import { THEME } from "../../theme.js";

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
export const monthFull = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const periodTitle = (months) => (!months.length ? "" : months.length === 1 ? monthFull(months[0]) : `${monthFull(months[0])} — ${monthFull(months[months.length - 1])}`);

export const num = (v, neg) => (v === 0 ? "0" : `${neg && v > 0 ? "−" : v < 0 ? "−" : ""}${fmt(Math.abs(Math.round(v)))}`);
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

// Jadval qatorlari — ekran, Excel va PDF uchun bitta manba
export function pnlRows(p) {
  const sh = p.shares;
  return [
    { k: "income", l: "Tushum (to'lovlar)", v: (c) => c.income, f: (c) => num(c.income) },
    { k: "direct", l: "To'g'ridan-to'g'ri rasxod", v: (c) => -c.direct, f: (c) => num(c.direct, true) },
    ...(p.hasStaff ? [{ k: "staff", l: "Umumiy xodimlar oyligi (bajargan ishi bo'yicha)", v: (c) => -c.staff, f: (c) => num(c.staff, true) }] : []),
    { k: "common", l: `Umumiy rasxod ulushi (${Math.round(sh.UVIXPRINT * 100)}% / ${Math.round(sh.UVONYX * 100)}%)`, v: (c) => -c.common, f: (c) => num(c.common, true) },
    { k: "profit", l: "Sof foyda", v: (c) => c.profit, f: (c) => num(c.profit), strong: true },
    { k: "margin", l: "Marja", v: (c) => (c.margin == null ? null : c.margin), f: (c) => pct(c.margin), isPct: true },
    { k: "prev", l: p.months.length > 1 ? "Oldingi davr sof foyda" : "O'tgan oy sof foyda", v: (c) => c.prevProfit, f: (c) => num(c.prevProfit) },
    { k: "change", l: "Farq", v: (c) => c.diff, f: (c) => <span style={{ color: c.diff >= 0 ? THEME.greenText : THEME.rose, fontWeight: 600 }}>{c.diff > 0 ? "+" : ""}{num(c.diff)}</span> },
    { k: "debt", l: "Qarzdorlik (barcha davr)", v: (c) => c.debt, f: (c) => num(c.debt) },
  ];
}

export function usePnl(orders, transactions, months) {
  const work = useContext(WorkStatsContext);
  const key = months.join(",");
  return useMemo(() => computePnlMonths(orders, transactions, months, work), [orders, transactions, key, work]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function ProfitLoss({ orders, transactions, month, months: monthsIn, only = null }) {
  const months = monthsIn || [month];
  const p = usePnl(orders, transactions, months);
  const lines = only ? [only] : ["UVIXPRINT", "UVONYX"];
  const cols = only ? [p[only]] : [p.UVIXPRINT, p.UVONYX, p.total];
  const rows = pnlRows(p);
  const incTot = p.total.income;
  const th = { padding: "8px 12px", fontSize: 12, fontWeight: 600, color: THEME.muted, textAlign: "right", whiteSpace: "nowrap" };
  return (
    <Card data-testid="pnl" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>{periodTitle(months)}</b>
        <span style={{ fontSize: 12.5, color: THEME.muted }}>· tushgan pul bo'yicha</span>
      </div>
      <div style={{ overflowX: "auto" }} className="uvix-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontVariantNumeric: "tabular-nums", minWidth: only ? 320 : 520 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <th style={{ ...th, textAlign: "left" }} />
              {lines.map((l) => (
                <th key={l} style={th}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: lineColor(l, THEME.isDark), marginRight: 6 }} />{LINE_META[l].name}</th>
              ))}
              {!only && <th style={th}>Jami</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} data-pnl-row={r.k} style={{ borderBottom: `1px solid ${THEME.border}`, background: r.strong ? THEME.chip : undefined }}>
                <td style={{ padding: "9px 12px", fontWeight: r.strong ? 700 : 500 }}>{r.l}</td>
                {cols.map((c, i) => (
                  <td key={i} data-col={only || (i === 2 ? "total" : i === 0 ? "UVIXPRINT" : "UVONYX")} style={{ padding: "9px 12px", textAlign: "right", fontWeight: r.strong ? 700 : 500, color: r.strong && c.profit < 0 ? THEME.rose : r.strong && !only && i < 2 ? lineColor(i ? "UVONYX" : "UVIXPRINT", THEME.isDark) : undefined }}>{r.f(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!only && <>
        <div style={{ fontSize: 11.5, color: THEME.muted, margin: "10px 0 5px" }}>Tushum ulushi</div>
        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: THEME.chip }}>
          {incTot > 0 && <i style={{ width: `${(p.UVIXPRINT.income / incTot) * 100}%`, background: lineColor("UVIXPRINT", THEME.isDark) }} />}
          {incTot > 0 && <i style={{ flex: 1, background: lineColor("UVONYX", THEME.isDark) }} />}
        </div>
      </>}
    </Card>
  );
}
