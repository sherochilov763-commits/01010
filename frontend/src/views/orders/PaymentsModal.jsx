import { usePerms } from "../../lib/perms.jsx";
import { PhotoGrid } from "../../components/PhotoViewer.jsx";
import { useState } from "react";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Field, Modal, MultiPaymentLines, getIconBtn, getInputStyle } from "../../components/ui.jsx";
import { orderBrakSum, orderDebt, orderTotalPaid } from "../../lib/finance.js";
import { money, paymentTypeLabel, todayStr, uid } from "../../lib/format.js";
import { THEME } from "../../theme.js";
import { useApprovals, PENDING_LABEL } from "../../lib/approvals.jsx";
import { ApprovalRequestModal } from "../../components/ApprovalRequestModal.jsx";

export function PaymentsModal({ order, transactions, currentUser, isAdmin, onClose, onAddPayment, onDeletePayment }) {
  const { can } = usePerms();
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([{ id: uid(), methodType: "naqd", amountStr: "" }]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [overOk, setOverOk] = useState(false); // kelishuvdan ortiq to'lov — ikkinchi bosishda (ogohlantirishdan keyin)
  const [reqFor, setReqFor] = useState(null); // { kind, payment } — operator: tasdiqqa so'rov; admin: to'g'ridan-to'g'ri tahrir
  const ap = useApprovals();

  const paid = orderTotalPaid(order);
  const debt = orderDebt(order);
  const brakSum = orderBrakSum(order, transactions);
  const payments = (order.payments || []).filter((p) => !p.deletedAt).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalNew = lines.reduce((s, l) => s + (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0), 0);

  function submit() {
    if (!date) return setError("Sanani tanlang");
    const validLines = lines.filter((l) => (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0) > 0);
    if (validLines.length === 0) return setError("Kamida bitta summani to'g'ri kiriting (0 dan katta)");
    if (totalNew > debt && !overOk) { setOverOk(true); return setError(`To'lov qarzdan ${money(totalNew - debt)} ko'p (qarz: ${money(debt)}). Summani tekshiring — to'g'ri bo'lsa, yana bir marta bosing: ortiqcha summa «ortiqcha to'langan» bo'lib ko'rinadi.`); }
    const newPayments = validLines.map((l) => ({
      id: uid(),
      amount: parseInt(l.amountStr.replace(/\s/g, ""), 10),
      date,
      paymentType: l.methodType,
      comment: comment.trim(),
      createdBy: currentUser.name,
      createdAt: new Date().toISOString(),
    }));
    onAddPayment(order.id, newPayments);
    setLines([{ id: uid(), methodType: "naqd", amountStr: "" }]);
    setComment("");
    setError("");
    setOverOk(false);
  }

  return (
    <Modal title={`To'lovlar — ${order.orderNumber}`} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>Buyurtma</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{money(order.agreementUzs)}</div>
          </Card>
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>To'langan</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: THEME.green }}>{money(paid)}</div>
          </Card>
          <Card style={{ padding: 12, background: debt > 0 ? THEME.roseBg : THEME.greenBg, border: debt > 0 ? `1.5px solid ${THEME.roseBorder}` : `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 10.5, color: debt > 0 ? THEME.rose : THEME.green, fontWeight: 700, textTransform: "uppercase" }}>Qarzdorlik</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: debt > 0 ? THEME.rose : THEME.green }}>{money(debt)}</div>
          </Card>
        </div>

        {brakSum > 0 && (
          <Card style={{ padding: 12, background: THEME.roseBg, border: `1.5px solid ${THEME.roseBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <div>
                <div style={{ fontSize: 10.5, color: THEME.rose, fontWeight: 700, textTransform: "uppercase" }}>Brak (ushbu buyurtma bo'yicha)</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: THEME.rose, marginTop: 2 }}>−{money(brakSum)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>Sof buyurtma summasi</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text, marginTop: 2 }}>{money((order.agreementUzs || 0) - brakSum)}</div>
              </div>
            </div>
          </Card>
        )}

        {(order.photos || []).length > 0 && (
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Fotolar ({order.photos.length})</div>
            <PhotoGrid photos={order.photos} title={`${order.title || order.materialType || ""} · ${order.orderNumber}`} size={72} />
          </Card>
        )}

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 8 }}>To'lovlar tarixi</div>
          {payments.length === 0 ? (
            <EmptyState text="Hali to'lov kiritilmagan" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }} className="uvix-scroll">
              {payments.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: THEME.surface, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{money(p.amount)}{p.prevAmount != null && <span title={`Avval: ${money(p.prevAmount)}${p.approvedBy ? ` · tasdiqladi: ${p.approvedBy}` : ""}`} style={{ fontSize: 11, fontWeight: 600, color: THEME.muted, marginLeft: 6 }}>(avval {money(p.prevAmount)})</span>}</div>
                    <div style={{ fontSize: 11, color: THEME.muted }}>{p.date} &middot; {paymentTypeLabel(p.paymentType)}{p.comment ? ` · ${p.comment}` : ""}</div>
                  </div>
                  {(() => {
                    const pend = ap?.forPayment(p.id);
                    if (pend) {
                      return (
                        <span data-testid="pay-pending" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: THEME.amberText, background: THEME.amberBg, borderRadius: 10, padding: "3px 8px", whiteSpace: "nowrap" }}>
                          <Clock size={12} /> {PENDING_LABEL[pend.kind]}
                          {pend.by?.id === currentUser.id && <button type="button" onClick={() => ap.cancel(pend.id).catch(() => {})} style={{ background: "none", border: 0, padding: 0, marginLeft: 4, color: THEME.amberText, textDecoration: "underline", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>bekor</button>}
                        </span>
                      );
                    }
                    if (isAdmin || can("payments.edit", "direct")) {
                      return (
                        <span style={{ display: "flex", gap: 6 }}>
                          {ap?.editPayment && <button onClick={() => setReqFor({ kind: "payment_edit", payment: p, direct: true })} aria-label="To'lovni o'zgartirish" title="O'zgartirish" className="uvix-iconbtn" style={getIconBtn()} data-testid="pay-edit"><Pencil size={13} /></button>}
                          <button onClick={() => setConfirmDel(p)} aria-label="To'lovni o'chirish" className="uvix-iconbtn" style={getIconBtn()} data-testid="pay-delete"><Trash2 size={13} color={THEME.rose} /></button>
                        </span>
                      );
                    }
                    // Operator: o'zgartirish va o'chirish — faqat admin tasdig'i bilan («Yo'q» huquqi — tugma yo'q)
                    return ap && can("payments.edit") ? (
                      <span style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setReqFor({ kind: "payment_edit", payment: p })} aria-label="O'zgartirishni so'rash" title="O'zgartirish (admin tasdig'i bilan)" className="uvix-iconbtn" style={getIconBtn()} data-testid="pay-edit"><Pencil size={13} /></button>
                        <button onClick={() => setReqFor({ kind: "payment_delete", payment: p })} aria-label="O'chirishni so'rash" title="O'chirish (admin tasdig'i bilan)" className="uvix-iconbtn" style={getIconBtn()} data-testid="pay-delete"><Trash2 size={13} color={THEME.rose} /></button>
                      </span>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px dashed ${THEME.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.mutedDark, marginBottom: 2 }}>Yangi to'lov qo'shish</div>
          <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 8 }}>
            Mijoz to'lovni bir nechta usul orqali qilgan bo'lsa (masalan qisman naqd, qisman karta), har birini alohida qator sifatida qo'shing.
          </div>
          <Field label="Sana">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...getInputStyle(), marginBottom: 10 }} />
          </Field>
          <MultiPaymentLines lines={lines} onChange={(v) => { setLines(v); setOverOk(false); }} bg={THEME.surface} />
          {lines.length > 1 && (
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, textAlign: "right", color: THEME.violet }}>
              Jami: {money(totalNew)}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Field label="Izoh (ixtiyoriy)">
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Masalan: 2-avans" style={getInputStyle()} />
            </Field>
          </div>
          {error && <div style={{ color: THEME.rose, fontSize: 12.5, marginTop: 8 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            {(isAdmin || can("payments.add")) && <Button onClick={submit}><Plus size={14} /> To'lov qo'shish</Button>}
          </div>
        </div>
      </div>
      {reqFor && (
        <ApprovalRequestModal kind={reqFor.kind} order={order} payment={reqFor.payment} direct={reqFor.direct} onClose={() => setReqFor(null)}
          onSubmit={(b) => (reqFor.direct ? ap.editPayment(order.id, reqFor.payment.id, b.amount, b.reason) : ap.request(b))} />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`${money(confirmDel.amount)} to'lovni o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => { onDeletePayment(order.id, confirmDel.id); setConfirmDel(null); }}
        />
      )}
    </Modal>
  );
}
