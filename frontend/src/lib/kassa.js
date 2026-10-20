// kassa.js — yo'nalishlar bo'yicha alohida kassalar: UVIXPRINT / UVONYX × naqd / karta / bank.
//   Kirim — buyurtma to'lovlari (buyurtma yo'nalishi kassasiga).
//   Chiqim — rasxodlar: yo'nalish rasxodi — o'z kassasidan; umumiy rasxod — tx.paidFrom kassasidan
//   (belgilanmagan eski umumiy rasxod — UVIXPRINT). Foyda hisobida umumiy rasxod baribir ulush bo'yicha bo'linadi.
//   O'tkazma — uvix:transfers: [{ id, date, from: { line, type }, to: { line, type }, amount, note, createdBy, createdAt }]
import { COMMON, LINES, lineOfOrder, txLine } from "./lines.js";

export const PAY_TYPES = ["naqd", "karta", "bank"];
export const PAY_LABEL = { naqd: "Naqd", karta: "Karta", bank: "Bank" };
const payType = (v) => (v === "perechisleniye" ? "bank" : PAY_TYPES.includes(v) ? v : "naqd");
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

// Davr bo'yicha kassa hisoboti: boshlang'ich qoldiq (from dan oldin) → kirim / chiqim / o'tkazma (davr ichida) → yakuniy qoldiq.
// from bo'sh — boshidan; to bo'sh — bugungacha. Har kassa uchun: open + in − out + tin − tout = close.
export function kassaReport(orders, txs, transfers, { from, to } = {}) {
  const before = from ? computeKassa(orders, txs, transfers, { to: prevDay(from) }) : null;
  const upto = computeKassa(orders, txs, transfers, { to });
  const rows = {};
  const tot = { open: 0, in: 0, out: 0, tin: 0, tout: 0, close: 0 };
  for (const l of LINES) {
    rows[l] = {};
    for (const t of PAY_TYPES) {
      const a = before ? before[l][t] : blank(), b = upto[l][t];
      const r = { open: a.bal, in: b.in - a.in, out: b.out - a.out, tin: b.tin - a.tin, tout: b.tout - a.tout, close: b.bal };
      rows[l][t] = r;
      for (const k of Object.keys(tot)) tot[k] += r[k];
    }
  }
  const lineTot = (l) => PAY_TYPES.reduce((acc, t) => { for (const k of Object.keys(acc)) acc[k] += rows[l][t][k]; return acc; }, { open: 0, in: 0, out: 0, tin: 0, tout: 0, close: 0 });
  return { rows, total: tot, lines: { UVIXPRINT: lineTot("UVIXPRINT"), UVONYX: lineTot("UVONYX") } };
}
function prevDay(d) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); }

// Davrdagi barcha kassa harakatlari (vaqt bo'yicha) — «Harakatlar» yorlig'i va Excel uchun
export function kassaMoves(orders, txs, transfers, { from, to } = {}) {
  const inP = (d) => (!from || String(d || "") >= from) && (!to || String(d || "") <= to);
  const lineById = new Map((orders || []).filter(Boolean).map((o) => [o.id, lineOfOrder(o)]));
  const out = [];
  for (const o of orders || []) {
    if (!o || o.deletedAt) continue;
    for (const p of o.payments || []) if (p && !p.deletedAt && inP(p.date)) out.push({ date: p.date, at: p.createdAt || "", kind: "in", line: lineOfOrder(o), type: payType(p.paymentType), amount: Number(p.amount) || 0, title: `${o.orderNumber || ""} · ${o.customer || ""}`.trim(), who: p.createdBy || "" });
  }
  for (const t of txs || []) {
    if (!t || t.deletedAt || !inP(t.date)) continue;
    let l = txLine(t, lineById);
    if (l === COMMON) l = LINES.includes(t.paidFrom) ? t.paidFrom : "UVIXPRINT";
    out.push({ date: t.date, at: t.createdAt || "", kind: "out", line: l, type: payType(t.paymentType), amount: Number(t.amount) || 0, title: [t.category, t.subcategory, t.note].filter(Boolean).join(" · "), who: t.createdBy || "" });
  }
  for (const r of transfers || []) {
    if (!r || r.deletedAt || !inP(r.date)) continue;
    out.push({ date: r.date, at: r.createdAt || "", kind: "transfer", line: r.from?.line, type: payType(r.from?.type), toLine: r.to?.line, toType: payType(r.to?.type), amount: Number(r.amount) || 0, title: r.note || "Ichki o'tkazma", who: r.createdBy || "" });
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)));
}
