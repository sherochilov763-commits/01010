// BigExpenses.jsx — rahbar Dashboard'ida: ko'rilmagan yirik rasxodlar (oxirgi 30 kun), «Ko'rildi» bilan
import { useMemo, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Card } from "../../components/ui.jsx";
import { LineTag } from "../../components/LineSwitcher.jsx";
import { isBigExpense, useExpenseRules } from "../../lib/expenseRules.js";
import { lineOfOrder, txLine } from "../../lib/lines.js";
import { money, shortDateUz } from "../../lib/format.js";
import { THEME } from "../../theme.js";

export function BigExpenses({ list, orders, onSeen, onOpenAll }) {
  const { limit } = useExpenseRules();
  const [busy, setBusy] = useState(null);
  const lineById = useMemo(() => new Map((orders || []).map((o) => [o.id, lineOfOrder(o)])), [orders]);
  const items = useMemo(() => {
    if (!limit) return [];
    const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return (list || []).filter((t) => isBigExpense(t, limit) && !t.bigSeenAt && String(t.date || "") >= from).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [list, limit]);
  if (!items.length) return null;
  return (
    <Card data-testid="big-expenses" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: `1px solid ${THEME.border}` }}>
        <TriangleAlert size={17} color={THEME.rose} />
        <b style={{ fontSize: 15 }}>Yirik rasxodlar</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: THEME.rose, background: THEME.roseBg, borderRadius: 10, padding: "1px 8px" }}>{items.length}</span>
        <span style={{ fontSize: 12, color: THEME.dim }}>≥ {money(limit)}</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onOpenAll} style={{ background: "none", border: 0, color: THEME.violet, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Hammasi →</button>
      </div>
      {items.slice(0, 6).map((t) => (
        <div key={t.id} data-big={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderTop: `1px solid ${THEME.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{t.category}{t.subcategory && t.subcategory !== "Umumiy" ? <span style={{ color: THEME.muted, fontWeight: 500 }}>· {t.subcategory}</span> : null}<LineTag line={txLine(t, lineById)} /></div>
            <div style={{ fontSize: 12.5, color: THEME.muted }}>{shortDateUz(t.date)} · {t.createdBy || "—"}{t.note ? ` · ${t.note}` : ""}</div>
          </div>
          <b style={{ fontSize: 15, color: THEME.rose, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(t.amount)}</b>
          <button type="button" disabled={busy === t.id} onClick={() => { setBusy(t.id); onSeen?.(t.id); }} data-big-seen={t.id}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px", borderRadius: 9, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600 }}>
            <Check size={14} /> Ko'rildi
          </button>
        </div>
      ))}
    </Card>
  );
}
