import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, getIconBtn } from "../../components/ui.jsx";
import { money } from "../../lib/format.js";
import { THEME } from "../../theme.js";

export function TrashSection({ orders, transactions, onRestoreOrder, onPermanentDeleteOrder, onRestoreTransaction, onPermanentDeleteTransaction, onRestorePayment, onPermanentDeletePayment }) {
  const [confirmPerm, setConfirmPerm] = useState(null); // { kind, item, orderId? }
  const deletedOrders = orders.filter((o) => o.deletedAt).sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  const deletedTx = transactions.filter((t) => t.deletedAt).sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  const deletedPayments = [];
  orders.forEach((o) => {
    (o.payments || []).filter((p) => p.deletedAt).forEach((p) => {
      deletedPayments.push({ ...p, orderId: o.id, orderNumber: o.orderNumber, customer: o.customer });
    });
  });
  deletedPayments.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));

  const totalCount = deletedOrders.length + deletedTx.length + deletedPayments.length;

  function confirmPermanent() {
    const { kind, item } = confirmPerm;
    if (kind === "order") onPermanentDeleteOrder(item);
    if (kind === "tx") onPermanentDeleteTransaction(item);
    if (kind === "payment") onPermanentDeletePayment(item.orderId, item.id);
    setConfirmPerm(null);
  }

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Chiqindi qutisi</div>
      <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14 }}>
        O'chirilgan buyurtma, rasxod va to'lovlar shu yerda 30 kun (yoki siz butunlay o'chirmaguningizcha) saqlanadi — tasodifiy o'chirishdan qo'rqmasdan ishlashingiz mumkin.
      </div>

      {totalCount === 0 ? (
        <EmptyState text="Chiqindi qutisi bo'sh" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {deletedOrders.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.mutedDark, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Buyurtmalar ({deletedOrders.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {deletedOrders.map((o) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: THEME.surface, borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{o.orderNumber} <span style={{ fontWeight: 500, color: THEME.muted }}>&middot; {o.customer}</span></div>
                      <div style={{ fontSize: 11, color: THEME.muted }}>{money(o.agreementUzs)} &middot; o'chirgan: {o.deletedBy || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button variant="ghost" onClick={() => onRestoreOrder(o)} style={{ padding: "6px 10px", fontSize: 12 }}>Tiklash</Button>
                      <button onClick={() => setConfirmPerm({ kind: "order", item: o })} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deletedTx.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.mutedDark, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Rasxodlar ({deletedTx.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {deletedTx.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: THEME.surface, borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{money(t.amount)} <span style={{ fontWeight: 500, color: THEME.muted }}>&middot; {t.category}</span></div>
                      <div style={{ fontSize: 11, color: THEME.muted }}>{t.date} &middot; o'chirgan: {t.deletedBy || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button variant="ghost" onClick={() => onRestoreTransaction(t)} style={{ padding: "6px 10px", fontSize: 12 }}>Tiklash</Button>
                      <button onClick={() => setConfirmPerm({ kind: "tx", item: t })} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deletedPayments.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: THEME.mutedDark, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>To'lovlar ({deletedPayments.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {deletedPayments.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: THEME.surface, borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{money(p.amount)} <span style={{ fontWeight: 500, color: THEME.muted }}>&middot; {p.orderNumber} ({p.customer})</span></div>
                      <div style={{ fontSize: 11, color: THEME.muted }}>{p.date} &middot; o'chirgan: {p.deletedBy || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button variant="ghost" onClick={() => onRestorePayment(p.orderId, p.id)} style={{ padding: "6px 10px", fontSize: 12 }}>Tiklash</Button>
                      <button onClick={() => setConfirmPerm({ kind: "payment", item: p })} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {confirmPerm && (
        <ConfirmDialog
          message="Bu yozuvni BUTUNLAY o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi."
          onCancel={() => setConfirmPerm(null)}
          onConfirm={confirmPermanent}
        />
      )}
    </Card>
  );
}
