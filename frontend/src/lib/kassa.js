// kassa.js — yo'nalishlar bo'yicha alohida kassalar: UVIXPRINT / UVONYX × naqd / karta / bank.
//   Kirim — buyurtma to'lovlari (buyurtma yo'nalishi kassasiga).
//   Chiqim — rasxodlar: yo'nalish rasxodi — o'z kassasidan; umumiy rasxod — tx.paidFrom kassasidan
//   (belgilanmagan eski umumiy rasxod — UVIXPRINT). Foyda hisobida umumiy rasxod baribir ulush bo'yicha bo'linadi.
//   O'tkazma — uvix:transfers: [{ id, date, from: { line, type }, to: { line, type }, amount, note, createdBy, createdAt }]
import { COMMON, LINES, lineOfOrder, txLine } from "./lines.js";

export const PAY_TYPES = ["naqd", "karta", "bank"];
export const PAY_LABEL = { naqd: "Naqd", karta: "Karta", bank: "Bank" };
const payType = (v) => (PAY_TYPES.includes(v) ? v : "naqd");
const blank = () => ({ in: 0, out: 0, tin: 0, tout: 0, bal: 0 });

export function computeKassa(orders, txs, transfers, { to } = {}) {
  const k = {};
  for (const l of LINES) { k[l] = {}; for (const t of PAY_TYPES) k[l][t] = blank(); }
  const ok = (d) => !to || String(d || "") <= to;
  const lineById = new Map((orders || []).filter(Boolean).map((o) => [o.id, lineOfOrder(o)]));
  for (const o of orders || []) {
    if (!o || o.deletedAt) continue;
    const l = lineOfOrder(o);
    for (const p of o.payments || []) if (p && !p.deletedAt && ok(p.date)) k[l][payType(p.paymentType)].in += Number(p.amount) || 0;
  }
  for (const t of txs || []) {
    if (!t || t.deletedAt || !ok(t.date)) continue;
    let l = txLine(t, lineById);
    if (l === COMMON) l = LINES.includes(t.paidFrom) ? t.paidFrom : "UVIXPRINT";
    k[l][payType(t.paymentType)].out += Number(t.amount) || 0;
  }
  for (const r of transfers || []) {
    if (!r || r.deletedAt || !ok(r.date)) continue;
    const a = Number(r.amount) || 0;
    if (LINES.includes(r.from?.line)) k[r.from.line][payType(r.from.type)].tout += a;
    if (LINES.includes(r.to?.line)) k[r.to.line][payType(r.to.type)].tin += a;
  }
  for (const l of LINES) for (const t of PAY_TYPES) { const x = k[l][t]; x.bal = x.in - x.out + x.tin - x.tout; }
  const total = (l) => PAY_TYPES.reduce((s, t) => s + k[l][t].bal, 0);
  return { ...k, totals: { UVIXPRINT: total("UVIXPRINT"), UVONYX: total("UVONYX"), all: total("UVIXPRINT") + total("UVONYX") } };
}
