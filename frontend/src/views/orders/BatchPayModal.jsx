// BatchPayModal.jsx — umumiy to'lov: mijoz bir marta to'laydi, summa uning qarzdor buyurtmalariga bo'linadi.
// Har buyurtmaning qarzi alohida to'g'ri qoladi (hisobotlar buzilmaydi); mijozga bitta kvitansiya ketadi.
import { useMemo, useState } from "react";
import { Button, Field, Modal, MultiPaymentLines, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { fmt, money, shortDateUz, todayStr, uid } from "../../lib/format.js";
import { orderDebt } from "../../lib/finance.js";
import { allocate } from "../../lib/production.js";
import { payOrdersBatch } from "../../storage.js";

const amountOf = (l) => parseInt(String(l.amountStr || "").replace(/\s/g, ""), 10) || 0;

export function BatchPayModal({ customerName, orders, onClose, onDone }) {
  const debtOrders = useMemo(() => (orders || []).filter((o) => orderDebt(o) > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.orderNumber).localeCompare(String(b.orderNumber))), [orders]);
  const totalDebt = debtOrders.reduce((s, o) => s + orderDebt(o), 0);
  const [lines, setLines] = useState([{ id: uid(), methodType: "naqd", amountStr: "" }]);
  const [mode, setMode] = useState("oldest");
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amount = lines.reduce((s, l) => s + amountOf(l), 0);
  const over = amount > totalDebt;
  const alloc = useMemo(() => (amount > 0 && !over ? allocate(amount, debtOrders.map((o) => ({ id: o.id, due: orderDebt(o) })), mode) || {} : {}), [amount, over, debtOrders, mode]);
  const left = Math.max(0, totalDebt - amount);

  async function submit() {
    setErr("");
    if (!amount) return setErr("Summani kiriting");
    if (over) return setErr("Summa jami qarzdan ko'p");
    setBusy(true);
    try {
      const r = await payOrdersBatch({ orderIds: debtOrders.map((o) => o.id), lines: lines.map((l) => ({ amount: amountOf(l), paymentType: l.methodType })).filter((l) => l.amount > 0), mode, date });
      onDone(r);
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title={`Umumiy to'lov · ${customerName}`} onClose={onClose} width={520}>
      <div data-testid="batch-pay" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, color: THEME.muted }}>{debtOrders.length} ta qarzdor buyurtma · jami qarz <b style={{ color: THEME.rose, fontVariantNumeric: "tabular-nums" }}>{money(totalDebt)}</b></div>
        <div>
          <MultiPaymentLines lines={lines} onChange={setLines} />
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setLines([{ id: uid(), methodType: lines[0]?.methodType || "naqd", amountStr: fmt(totalDebt) }])}
              style={{ height: 28, padding: "0 10px", borderRadius: 14, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Hammasini yopish: {fmt(totalDebt)}</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Taqsimot">
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={getInputStyle()} data-testid="batch-mode">
              <option value="oldest">Eng eski qarzdan</option>
              <option value="prop">Qarzga mutanosib</option>
            </select>
          </Field>
          <Field label="Sana"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={getInputStyle()} /></Field>
        </div>
        <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          {debtOrders.map((o, i) => {
            const x = alloc[o.id] || 0;
            const closes = x > 0 && x >= orderDebt(o);
            return (
              <div key={o.id} data-alloc={o.orderNumber} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i ? `1px solid ${THEME.border}` : 0, color: x ? THEME.text : THEME.dim }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontWeight: 600 }}>{o.orderNumber}</b> <span style={{ color: THEME.dim }}>· {o.title || o.materialType || shortDateUz(o.date)}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: THEME.dim }}>qarz {fmt(orderDebt(o))}</span>
                </span>
                <span style={{ color: x ? THEME.green : THEME.dim, fontWeight: x ? 600 : 400, whiteSpace: "nowrap" }}>{x ? `+${fmt(x)}` : "—"}{closes && <span style={{ fontSize: 11, fontWeight: 500 }}> ✓ yopiladi</span>}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 13, color: over ? THEME.rose : THEME.muted }}>
          {over ? `Summa jami qarzdan ${money(amount - totalDebt)} ko'p` : <>Qoladigan qarz: <b style={{ color: left ? THEME.rose : THEME.green }}>{money(left)}</b> · mijozga bitta kvitansiya ketadi</>}
        </div>
        {err && <div role="alert" style={{ color: THEME.rose, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Bekor qilish</Button>
          <Button onClick={submit} disabled={busy || !amount || over} data-testid="batch-submit" style={{ background: THEME.green, borderColor: THEME.green }}>{busy ? "Saqlanmoqda..." : `Qabul qilish${amount ? ` · ${fmt(amount)}` : ""}`}</Button>
        </div>
      </div>
    </Modal>
  );
}
