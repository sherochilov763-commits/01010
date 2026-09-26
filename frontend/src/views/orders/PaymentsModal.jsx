import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Field, Modal, MultiPaymentLines, getIconBtn, getInputStyle } from "../../components/ui.jsx";
import { orderBrakSum, orderDebt, orderTotalPaid } from "../../lib/finance.js";
import { money, paymentTypeLabel, todayStr, uid } from "../../lib/format.js";
import { THEME } from "../../theme.js";

export function PaymentsModal({ order, transactions, currentUser, isAdmin, onClose, onAddPayment, onDeletePayment }) {
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([{ id: uid(), methodType: "naqd", amountStr: "" }]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const paid = orderTotalPaid(order);
  const debt = orderDebt(order);
  const brakSum = orderBrakSum(order, transactions);
  const payments = (order.payments || []).filter((p) => !p.deletedAt).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalNew = lines.reduce((s, l) => s + (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0), 0);

  function submit() {
    if (!date) return setError("Sanani tanlang");
    const validLines = lines.filter((l) => (parseInt((l.amountStr || "").replace(/\s/g, ""), 10) || 0) > 0);
    if (validLines.length === 0) return setError("Kamida bitta summani to'g'ri kiriting (0 dan katta)");
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
  }

  return (
    <Modal title={`To'lovlar — ${order.orderNumber}`} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>Buyurtma</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{money(order.agreementUzs)}</div>
          </Card>
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>To'langan</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: THEME.green }}>{money(paid)}</div>
          </Card>
          <Card style={{ padding: 12, background: debt > 0 ? THEME.roseBg : THEME.greenBg, border: debt > 0 ? `1.5px solid ${THEME.roseBorder}` : `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 10.5, color: debt > 0 ? THEME.rose : THEME.green, fontWeight: 700, textTransform: "uppercase" }}>Qarzdorlik</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: debt > 0 ? THEME.rose : THEME.green }}>{money(debt)}</div>
          </Card>
        </div>

        {brakSum > 0 && (
          <Card style={{ padding: 12, background: THEME.roseBg, border: `1.5px solid ${THEME.roseBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <div>
                <div style={{ fontSize: 10.5, color: THEME.rose, fontWeight: 700, textTransform: "uppercase" }}>Brak (ushbu buyurtma bo'yicha)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: THEME.rose, marginTop: 2 }}>−{money(brakSum)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase" }}>Sof buyurtma summasi</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text, marginTop: 2 }}>{money((order.agreementUzs || 0) - brakSum)}</div>
              </div>
            </div>
          </Card>
        )}

        {(order.photos || []).length > 0 && (
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Fotolar ({order.photos.length})</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
              {order.photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${THEME.border}`, display: "block" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </a>
              ))}
            </div>
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
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{money(p.amount)}</div>
                    <div style={{ fontSize: 11, color: THEME.muted }}>{p.date} &middot; {paymentTypeLabel(p.paymentType)}{p.comment ? ` · ${p.comment}` : ""}</div>
                  </div>
                  {(isAdmin || p.createdBy === currentUser.name) && (
                    <button onClick={() => setConfirmDel(p)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={13} color={THEME.rose} /></button>
                  )}
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
          <MultiPaymentLines lines={lines} onChange={setLines} bg={THEME.surface} />
          {lines.length > 1 && (
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8, textAlign: "right", color: THEME.violet }}>
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
            <Button onClick={submit}><Plus size={14} /> To'lov qo'shish</Button>
          </div>
        </div>
      </div>
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
