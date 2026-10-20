// ApprovalsCard.jsx — admin uchun: xodimlarning tasdiqlash so'rovlari (to'lov o'zgartirish/o'chirish,
// buyurtmani o'chirish, summani kamaytirish). Bir bosishda tasdiqlash yoki rad etish.
import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { fmt, money, paymentTypeLabel, shortDateUz } from "../lib/format.js";
import { THEME } from "../theme.js";
import { APPROVAL_TITLE } from "../lib/approvals.jsx";

const timeOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }); };

export function ApprovalsCard({ approvals, onDecide, showToast }) {
  const [busy, setBusy] = useState(null);
  const items = approvals.decidable || approvals.pending;
  if (!items.length) return null;
  async function act(r, action) {
    setBusy(r.id + action);
    try {
      await onDecide(r.id, action);
      showToast?.(action === "approve" ? `Tasdiqlandi: ${r.orderNumber}` : `Rad etildi: ${r.orderNumber}`);
    } catch (e) { showToast?.(e.message); }
    setBusy(null);
  }
  return (
    <section data-testid="approvals-card" aria-label="Tasdiqlash so'rovlari" className="uvix-approvals"
      style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: THEME.radius + 4, marginBottom: 16, overflow: "hidden", boxShadow: THEME.shadowSm }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${THEME.border}` }}>
        <ShieldCheck size={18} />
        <b style={{ fontSize: 15 }}>Tasdiqlash so'rovlari</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: THEME.roseText, background: THEME.roseBg, borderRadius: 10, padding: "1px 8px" }}>{items.length}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: THEME.dim }} className="uvix-hide-mobile">{approvals.isAdmin ? "Faqat admin ko'radi" : "Sizning tasdiqlash chegarangiz doirasida"}</span>
      </div>
      {items.map((r) => {
        const diff = r.kind === "payment_edit" ? r.new.amount - r.old.amount : r.kind === "order_total" ? r.new.agreementUzs - r.old.agreementUzs : null;
        return (
          <div key={r.id} data-approval={r.id} className="uvix-approval-row" style={{ display: "flex", gap: 14, padding: "14px 18px", borderTop: `1px solid ${THEME.border}` }}>
            <Avatar name={r.by?.name} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}><b style={{ fontWeight: 600 }}>{r.by?.name}</b> {APPROVAL_TITLE[r.kind]}</div>
              <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                {[r.orderNumber, r.customer, r.old?.date ? `${shortDateUz(r.old.date)}, ${paymentTypeLabel(r.old.paymentType)}` : null, timeOf(r.at)].filter(Boolean).join(" · ")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
                {r.kind === "payment_edit" && <><s style={{ color: THEME.muted, fontWeight: 600 }}>{fmt(r.old.amount)}</s><span>→</span><b style={{ fontSize: 15 }}>{money(r.new.amount)}</b></>}
                {r.kind === "order_total" && <><s style={{ color: THEME.muted, fontWeight: 600 }}>{fmt(r.old.agreementUzs)}</s><span>→</span><b style={{ fontSize: 15 }}>{money(r.new.agreementUzs)}</b></>}
                {r.kind === "payment_delete" && <b style={{ fontSize: 15 }}>{money(r.old.amount)}</b>}
                {r.kind === "order_delete" && <span style={{ fontSize: 13.5 }}><b>{money(r.old.agreementUzs)}</b> <span style={{ color: THEME.muted }}>({money(r.old.paid)} to'langan)</span></span>}
                {diff != null && <span style={{ fontSize: 12, fontWeight: 700, color: THEME.roseText, background: THEME.roseBg, borderRadius: 10, padding: "1px 8px" }}>{diff > 0 ? "+" : "−"}{fmt(Math.abs(diff))}</span>}
              </div>
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: THEME.chip, fontSize: 13, color: THEME.text, overflowWrap: "anywhere" }}>«{r.reason}»</div>
            </div>
            <div className="uvix-approval-actions" style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, width: 140 }}>
              <button type="button" disabled={!!busy} onClick={() => act(r, "approve")} data-testid="approve"
                style={{ height: 38, borderRadius: 10, border: 0, background: THEME.greenSolid, color: "#fff", fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontFamily: "inherit", opacity: busy === r.id + "approve" ? 0.6 : 1 }}>
                <Check size={16} /> Tasdiqlash
              </button>
              <button type="button" disabled={!!busy} onClick={() => act(r, "reject")} data-testid="reject"
                style={{ height: 38, borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", opacity: busy === r.id + "reject" ? 0.6 : 1 }}>
                Rad etish
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export const APPROVALS_CSS = () => `
  @media (max-width: 640px) {
    .uvix-approval-row { flex-wrap: wrap; }
    .uvix-approval-actions { width: 100% !important; flex-direction: row !important; padding-left: 50px; }
    .uvix-approval-actions button { flex: 1; }
  }
`;
