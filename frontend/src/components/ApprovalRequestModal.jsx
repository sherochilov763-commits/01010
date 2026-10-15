// ApprovalRequestModal.jsx — operator uchun: to'lovni o'zgartirish/o'chirish, buyurtmani o'chirish yoki
// summani kamaytirish — darhol emas, admin tasdig'iga yuboriladi (sabab majburiy).
import { useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { Button, Field, Modal, getInputStyle } from "./ui.jsx";
import { fmt, money, paymentTypeLabel, shortDateUz } from "../lib/format.js";
import { THEME } from "../theme.js";

const TITLE = {
  payment_edit: "To'lovni o'zgartirish",
  payment_delete: "To'lovni o'chirish",
  order_delete: "Buyurtmani o'chirish",
  order_total: "Buyurtma summasini kamaytirish",
};

export function ApprovalRequestModal({ kind, order, payment, newTotal, direct = false, onClose, onSubmit }) {
  const [amountStr, setAmountStr] = useState(payment ? fmt(payment.amount) : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amount = parseInt(String(amountStr).replace(/\D/g, ""), 10) || 0;

  async function submit() {
    if (kind === "payment_edit" && (!amount || amount === payment.amount)) return setErr("Yangi summani kiriting");
    if (!direct && reason.trim().length < 3) return setErr("Sababni yozing");
    setBusy(true); setErr("");
    try {
      await onSubmit({ kind, orderId: order.id, paymentId: payment?.id, amount: kind === "payment_edit" ? amount : undefined, agreementUzs: kind === "order_total" ? newTotal : undefined, reason: reason.trim() });
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  const old = { textDecoration: "line-through", color: THEME.muted };
  return (
    <Modal title={TITLE[kind]} onClose={onClose} width={440}>
      <div data-testid="approval-request" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12.5, color: THEME.muted, fontVariantNumeric: "tabular-nums" }}>{order.orderNumber} · {order.customer}</div>
        {payment && (
          <Field label={kind === "payment_edit" ? "Hozirgi summa" : "O'chiriladigan to'lov"}>
            <div style={{ ...getInputStyle(), background: THEME.chip, display: "flex", alignItems: "center", ...(kind === "payment_edit" ? old : {}) }}>
              {money(payment.amount)} · {paymentTypeLabel(payment.paymentType)} · {shortDateUz(payment.date)}
            </div>
          </Field>
        )}
        {kind === "payment_edit" && (
          <Field label="Yangi summa">
            <input autoFocus value={amountStr} inputMode="numeric" data-testid="approval-amount" onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setAmountStr(d ? fmt(parseInt(d, 10)) : ""); }} style={{ ...getInputStyle(), fontWeight: 700 }} />
          </Field>
        )}
        {kind === "order_delete" && (
          <div style={{ ...getInputStyle(), background: THEME.chip, height: "auto", padding: "10px 12px", lineHeight: 1.5 }}>
            Summa: <b>{money(order.agreementUzs)}</b> · to'langan: <b>{money((order.payments || []).filter((p) => !p.deletedAt).reduce((s, p) => s + (p.amount || 0), 0))}</b>
          </div>
        )}
        {kind === "order_total" && (
          <div style={{ ...getInputStyle(), background: THEME.chip, height: "auto", padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={old}>{money(order.agreementUzs)}</span><span>→</span><b>{money(newTotal)}</b>
          </div>
        )}
        <Field label={direct ? "Izoh (ixtiyoriy)" : "Sabab (majburiy)"}>
          <textarea autoFocus={kind !== "payment_edit"} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} data-testid="approval-reason"
            placeholder={kind === "order_delete" ? "Masalan: ikki marta kiritilgan" : "Masalan: mijoz pulni qaytarib oldi, chek bekor qilindi"}
            style={{ ...getInputStyle(), height: "auto", padding: "10px 12px", resize: "vertical", fontFamily: "inherit" }} />
        </Field>
        {!direct && <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: THEME.amberBg, color: THEME.amberText, fontSize: 12.5, lineHeight: 1.45 }}>
          <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{kind === "order_delete" ? "Buyurtma" : kind === "order_total" ? "Yangi summa" : "O'zgarish"} <b>admin tasdig'idan keyin</b> kuchga kiradi. Admin Telegram'da xabar oladi.</span>
        </div>}
        {err && <div role="alert" style={{ color: THEME.rose, fontSize: 12.5 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Bekor</Button>
          <Button onClick={submit} disabled={busy} data-testid="approval-send">{direct ? "Saqlash" : <><Send size={14} /> Tasdiqlashga yuborish</>}</Button>
        </div>
      </div>
    </Modal>
  );
}
