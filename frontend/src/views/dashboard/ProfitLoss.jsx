// ProfitLoss.jsx — rahbar Dashboard'i tepasidagi «Foyda va zarar» jadvali (UVIXPRINT | UVONYX | Jami)
import { useContext, useMemo } from "react";
import { Columns2 } from "lucide-react";
import { Card } from "../../components/ui.jsx";
import { LINE_META, WorkStatsContext, lineColor } from "../../lib/lines.js";
import { computePnl } from "../../lib/pnl.js";
import { fmt } from "../../lib/format.js";

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const monthFull = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
import { THEME } from "../../theme.js";

const num = (v, neg) => (v === 0 ? "0" : `${neg && v > 0 ? "−" : v < 0 ? "−" : ""}${fmt(Math.abs(Math.round(v)))}`);
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
function Change({ v }) {
  if (v == null) return <span style={{ color: THEME.dim }}>—</span>;
  const up = v >= 0;
  return <span style={{ color: up ? THEME.greenText : THEME.rose, fontWeight: 600 }}>{up ? "↑" : "↓"} {Math.abs(Math.round(v * 100))}%</span>;
}

export function ProfitLoss({ orders, transactions, month }) {
  const work = useContext(WorkStatsContext);
  const p = useMemo(() => computePnl(orders, transactions, month, work), [orders, transactions, month, work]);
  const cols = [p.UVIXPRINT, p.UVONYX, p.total];
  const sh = p.shares;
  const rows = [
    { k: "income", l: "Tushum (to'lovlar)", f: (c) => num(c.income) },
    { k: "direct", l: "To'g'ridan-to'g'ri rasxod", f: (c) => num(c.direct, true) },
    ...(p.hasStaff ? [{ k: "staff", l: <>Umumiy xodimlar oyligi <span style={{ color: THEME.dim, fontWeight: 400 }}>(bajargan ishi bo'yicha)</span></>, f: (c) => num(c.staff, true) }] : []),
    { k: "common", l: <>Umumiy rasxod ulushi <span style={{ color: THEME.dim, fontWeight: 400 }}>({Math.round(sh.UVIXPRINT * 100)}% / {Math.round(sh.UVONYX * 100)}%)</span></>, f: (c) => num(c.common, true) },
    { k: "profit", l: "Sof foyda", f: (c) => num(c.profit), strong: true },
    { k: "margin", l: "Marja", f: (c) => pct(c.margin) },
    { k: "change", l: "O'tgan oyga nisbatan", f: (c) => <Change v={c.change} /> },
    { k: "debt", l: "Qarzdorlik (hozir)", f: (c) => num(c.debt) },
  ];
  const incTot = p.total.income;
  const th = { padding: "8px 12px", fontSize: 12, fontWeight: 600, color: THEME.muted, textAlign: "right", whiteSpace: "nowrap" };
  return (
    <Card data-testid="pnl" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>{monthFull(month)} · foyda va zarar</b>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.chip, borderRadius: 7, padding: "3px 8px" }}><Columns2 size={13} /> Ikkala yo'nalish</span>
      </div>
      <div style={{ overflowX: "auto" }} className="uvix-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontVariantNumeric: "tabular-nums", minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <th style={{ ...th, textAlign: "left" }} />
              {["UVIXPRINT", "UVONYX"].map((l) => (
                <th key={l} style={th}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: lineColor(l, THEME.isDark), marginRight: 6 }} />{LINE_META[l].name}</th>
              ))}
              <th style={th}>Jami</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} data-pnl-row={r.k} style={{ borderBottom: `1px solid ${THEME.border}`, background: r.strong ? THEME.chip : undefined }}>
                <td style={{ padding: "9px 12px", fontWeight: r.strong ? 700 : 500 }}>{r.l}</td>
                {cols.map((c, i) => (
                  <td key={i} data-col={i === 2 ? "total" : i === 0 ? "UVIXPRINT" : "UVONYX"} style={{ padding: "9px 12px", textAlign: "right", fontWeight: r.strong ? 700 : 500, color: r.strong && i < 2 ? lineColor(i ? "UVONYX" : "UVIXPRINT", THEME.isDark) : undefined }}>{r.f(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: THEME.muted, margin: "10px 0 5px" }}>Tushum ulushi</div>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: THEME.chip }}>
        {incTot > 0 && <i style={{ width: `${(p.UVIXPRINT.income / incTot) * 100}%`, background: lineColor("UVIXPRINT", THEME.isDark) }} />}
        {incTot > 0 && <i style={{ flex: 1, background: lineColor("UVONYX", THEME.isDark) }} />}
      </div>
    </Card>
  );
}
