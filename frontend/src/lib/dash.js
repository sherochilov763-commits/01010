// dash.js — yangi Dashboard hisob-kitoblari (toza funksiyalar, testlanadi).
// Davr: Bugun · Hafta (dushanbadan) · Oy boshidan · Oraliq. Har ko'rsatkich o'tgan shunday davr bilan solishtiriladi.
// Tushum — davrda KELGAN to'lovlar (o'chirilmagan); menejer — buyurtma mas'uli (order.manager).
import { activePayments, orderDebt, orderTotalPaid } from "./finance.js";
import { localDateStr } from "./format.js";

const D = (s) => new Date(`${s}T12:00:00`);
const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return localDateStr(d); };
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
export const spanDays = (from, to) => Math.round((D(to) - D(from)) / 864e5) + 1;

export function periodOf(mode, today = localDateStr(new Date()), range = {}) {
  const t = D(today);
  if (mode === "today") return { from: today, to: today, prev: { from: add(today, -1), to: add(today, -1) }, label: "Bugun" };
  if (mode === "week") {
    const dow = (t.getDay() + 6) % 7; // dushanba = 0
    const from = add(today, -dow);
    return { from, to: today, prev: { from: add(from, -7), to: add(today, -7) }, label: "Hafta" };
  }
  if (mode === "range" && range.from && range.to) {
    const [from, to] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
    const n = spanDays(from, to);
    return { from, to, prev: { from: add(from, -n), to: add(from, -1) }, label: "Oraliq" };
  }
  // Oy boshidan: 1-sanadan bugungacha; solishtirma — o'tgan oyning shu kunlari
  const y = t.getFullYear(), m = t.getMonth();
  const from = localDateStr(new Date(y, m, 1));
  const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1;
  const prevTo = localDateStr(new Date(py, pm, Math.min(t.getDate(), daysIn(py, pm))));
  return { from, to: today, prev: { from: localDateStr(new Date(py, pm, 1)), to: prevTo }, label: "Oy boshidan" };
}
const inR = (d, r) => { const x = String(d || "").slice(0, 10); return x >= r.from && x <= r.to; };
export const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? null : 0);

export function paymentsIn(orders, r) {
  const out = [];
  for (const o of orders || []) { if (!o || o.deletedAt) continue; for (const p of activePayments(o)) if (inR(p.date, r)) out.push({ ...p, order: o }); }
  return out;
}
const sumBy = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

// Davr ichida kunlik qiymatlar (grafik va kichik chiziq uchun)
export function dailySeries(items, r, dateOf, valOf) {
  const n = Math.min(spanDays(r.from, r.to), 400);
  const keys = Array.from({ length: n }, (_, i) => add(r.from, i));
  const map = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const x of items) { const k = String(dateOf(x) || "").slice(0, 10); if (k in map) map[k] += Number(valOf(x)) || 0; }
  return keys.map((k) => ({ date: k, value: map[k] }));
}

// Qarz ma'lum sanaga (o'sha kungacha ochilgan buyurtmalar − o'sha kungacha to'lovlar)
export function debtAt(orders, date) {
  let s = 0;
  for (const o of orders || []) {
    if (!o || o.deletedAt || !(o.date <= date)) continue;
    const paid = activePayments(o).filter((p) => String(p.date || "") <= date).reduce((a, p) => a + (p.amount || 0), 0);
    s += Math.max(0, (o.agreementUzs || 0) - paid);
  }
  return s;
}

export function kpis(orders, r) {
  const pays = paymentsIn(orders, r), prevPays = paymentsIn(orders, r.prev);
  const income = sumBy(pays, (p) => p.amount), prevIncome = sumBy(prevPays, (p) => p.amount);
  const newO = (orders || []).filter((o) => !o.deletedAt && inR(o.date, r)), prevO = (orders || []).filter((o) => !o.deletedAt && inR(o.date, r.prev));
  const newSum = sumBy(newO, (o) => o.agreementUzs), prevNewSum = sumBy(prevO, (o) => o.agreementUzs);
  const debtNow = sumBy((orders || []).filter((o) => !o.deletedAt), orderDebt);
  const debtBefore = debtAt(orders, add(r.from, -1));
  const debtors = new Set((orders || []).filter((o) => !o.deletedAt && orderDebt(o) > 0).map((o) => String(o.customer || "").trim().toLowerCase())).size;
  const sparkR = spanDays(r.from, r.to) >= 5 ? r : { from: add(r.to, -6), to: r.to };
  return {
    income, prevIncome, incomeChange: pctChange(income, prevIncome), payCount: pays.length,
    incomeSpark: dailySeries(paymentsIn(orders, sparkR), sparkR, (p) => p.date, (p) => p.amount).map((x) => x.value),
    newSum, newCount: newO.length, newChange: pctChange(newSum, prevNewSum),
    newSpark: dailySeries(newO.length ? (orders || []).filter((o) => !o.deletedAt && inR(o.date, sparkR)) : [], sparkR, (o) => o.date, (o) => o.agreementUzs).map((x) => x.value),
    debtNow, debtDelta: debtNow - debtBefore, debtors,
  };
}

// Menejerlar: Bugun / Hafta / Oy boshidan (+ tanlangan oraliq), buyurtma mas'uli bo'yicha
export function managerStats(orders, today = localDateStr(new Date()), extra = null) {
  const P = { d: periodOf("today", today), w: periodOf("week", today), m: periodOf("mtd", today) };
  const map = new Map();
  const row = (name) => { if (!map.has(name)) map.set(name, { name, d: 0, w: 0, m: 0, x: 0, dc: 0, mc: 0, prevM: 0, weeks: Array(8).fill(0) }); return map.get(name); };
  const wk0 = periodOf("week", today).from;
  for (const o of orders || []) {
    if (!o || o.deletedAt) continue;
    const name = String(o.manager || "").trim() || "Belgilanmagan";
    for (const p of activePayments(o)) {
      const a = p.amount || 0, dt = String(p.date || "");
      if (inR(dt, P.d)) { row(name).d += a; row(name).dc++; }
      if (inR(dt, P.w)) row(name).w += a;
      if (inR(dt, P.m)) { row(name).m += a; row(name).mc++; }
      if (inR(dt, P.m.prev)) row(name).prevM += a;
      if (extra && inR(dt, extra)) row(name).x += a;
      // 8 haftalik chiziq: 7 — joriy hafta, 6 — o'tgan hafta ...
      const ds = dt.slice(0, 10), diff = Math.round((D(wk0) - D(ds)) / 864e5);
      const idx = diff <= 0 ? 7 : 7 - Math.ceil(diff / 7);
      if (idx >= 0 && ds <= today) row(name).weeks[idx] += a;
    }
  }
  const rows = [...map.values()].filter((r) => r.d || r.w || r.m || r.x || r.prevM).sort((a, b) => b.m - a.m || b.w - a.w);
  const total = rows.reduce((t, r) => ({ d: t.d + r.d, w: t.w + r.w, m: t.m + r.m, x: t.x + r.x, dc: t.dc + r.dc, mc: t.mc + r.mc, prevM: t.prevM + r.prevM }), { d: 0, w: 0, m: 0, x: 0, dc: 0, mc: 0, prevM: 0 });
  return { rows, total };
}

// Rasxod kategoriyalari (top-4 + Boshqa)
export function expenseBreakdown(txs, r) {
  const map = {};
  let total = 0, prev = 0;
  for (const t of txs || []) {
    if (!t || t.deletedAt || (t.type && t.type !== "chiqim")) continue;
    if (inR(t.date, r)) { map[t.category || "Boshqa"] = (map[t.category || "Boshqa"] || 0) + (t.amount || 0); total += t.amount || 0; }
    else if (inR(t.date, r.prev)) prev += t.amount || 0;
  }
  const list = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const top = list.slice(0, 4).map(([name, value]) => ({ name, value }));
  const rest = list.slice(4).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push({ name: "Boshqa", value: rest, other: true });
  return { parts: top, total, prev, change: pctChange(total, prev) };
}

export const PAY_KEYS = ["naqd", "karta", "bank"];
const ptype = (v) => (v === "karta" ? "karta" : v === "bank" || v === "perechisleniye" ? "bank" : "naqd");
export function payTypes(orders, r) {
  const cur = { naqd: { sum: 0, n: 0 }, karta: { sum: 0, n: 0 }, bank: { sum: 0, n: 0 } }, prev = { naqd: 0, karta: 0, bank: 0 };
  for (const p of paymentsIn(orders, r)) { const k = ptype(p.paymentType); cur[k].sum += p.amount || 0; cur[k].n++; }
  for (const p of paymentsIn(orders, r.prev)) prev[ptype(p.paymentType)] += p.amount || 0;
  const tot = PAY_KEYS.reduce((s, k) => s + cur[k].sum, 0), ptot = PAY_KEYS.reduce((s, k) => s + prev[k], 0);
  return { cur, total: tot, share: Object.fromEntries(PAY_KEYS.map((k) => [k, tot ? Math.round((cur[k].sum / tot) * 100) : 0])), prevShare: ptot ? Object.fromEntries(PAY_KEYS.map((k) => [k, Math.round((prev[k] / ptot) * 100)])) : null };
}

// Qarzdorlik yoshi: buyurtma sanasidan beri 0–7 / 8–30 / 30+ kun
export function debtAging(orders, today = localDateStr(new Date())) {
  const b = [0, 0, 0];
  const cust = new Map();
  for (const o of orders || []) {
    if (!o || o.deletedAt) continue;
    const d = orderDebt(o);
    if (d <= 0) continue;
    const age = Math.max(0, spanDays(String(o.date || today).slice(0, 10), today) - 1);
    b[age <= 7 ? 0 : age <= 30 ? 1 : 2] += d;
    const k = String(o.customer || "Noma'lum").trim();
    const c = cust.get(k) || { name: k, debt: 0, days: 0 };
    c.debt += d; c.days = Math.max(c.days, age); cust.set(k, c);
  }
  return { buckets: b, total: b[0] + b[1] + b[2], top: [...cust.values()].sort((a, c) => c.debt - a.debt).slice(0, 4), count: cust.size };
}

// Ishlab chiqarish: bosqichlar, o'rtacha bajarish muddati, uzoq turib qolgan, bosilgan m²
export function production(orders, r, stageOf, today = localDateStr(new Date())) {
  const counts = {};
  let stuck = 0, doneN = 0, doneDays = 0, area = 0;
  for (const o of orders || []) {
    if (!o || o.deletedAt) continue;
    const st = stageOf ? stageOf(o) : o.prodStage || "new";
    if (st && st !== "delivered") counts[st] = (counts[st] || 0) + 1;
    if (st && !["ready", "install", "delivered"].includes(st) && o.date && spanDays(o.date, today) - 1 >= 7) stuck++;
    const readyAt = o.readyAt || o.stageAt?.ready || (["ready", "delivered", "install"].includes(st) ? o.deliveredAt : null);
    if (readyAt && inR(readyAt, r)) {
      area += Number(o.area) || 0;
      const start = o.createdAt || o.date;
      if (start) { doneN++; doneDays += Math.max(0, (new Date(readyAt) - new Date(start)) / 864e5); }
    }
  }
  return { counts, stuck, avgDays: doneN ? Math.round((doneDays / doneN) * 10) / 10 : null, area: Math.round(area * 10) / 10, done: doneN };
}

// Mijozlar va chek: o'rtacha chek, yig'ilgan %, yangi/qaytgan mijozlar
export function customerStats(orders, r) {
  const firstDate = new Map();
  for (const o of orders || []) { if (!o || o.deletedAt) continue; const k = String(o.customer || "").trim().toLowerCase(); if (!firstDate.has(k) || o.date < firstDate.get(k)) firstDate.set(k, o.date); }
  const cur = (orders || []).filter((o) => !o.deletedAt && inR(o.date, r));
  const prevO = (orders || []).filter((o) => !o.deletedAt && inR(o.date, r.prev));
  const sum = sumBy(cur, (o) => o.agreementUzs), paid = sumBy(cur, orderTotalPaid);
  const custs = new Set(cur.map((o) => String(o.customer || "").trim().toLowerCase()));
  let fresh = 0; custs.forEach((k) => { if (inR(firstDate.get(k), r)) fresh++; });
  const avg = cur.length ? sum / cur.length : 0, prevAvg = prevO.length ? sumBy(prevO, (o) => o.agreementUzs) / prevO.length : 0;
  return { avg, avgChange: pctChange(avg, prevAvg), collected: sum > 0 ? Math.min(100, Math.round((paid / sum) * 100)) : null, fresh, returning: custs.size - fresh, customers: custs.size };
}

// «Oylik xarajatlar»: doimiy xarajatlar (rahbar kiritadi) qoplandimi.
// topildi = oy boshidan tushgan pul − o'zgaruvchan xarajat (Material, Kraska, Brak); kerak = doimiylar (to'langani rejadan ko'p bo'lsa — to'langani)
export const VARIABLE_CATS = ["Material", "Kraska", "Brak"];
export function fixedCosts(items, orders, txs, today = localDateStr(new Date()), share = 1) {
  const t = D(today); const y = t.getFullYear(), m = t.getMonth();
  const from = localDateStr(new Date(y, m, 1)), monthEnd = localDateStr(new Date(y, m + 1, 0));
  const r = { from, to: today };
  const tx = (txs || []).filter((x) => x && !x.deletedAt && (!x.type || x.type === "chiqim") && inR(x.date, { from, to: monthEnd }));
  const rows = (items || []).filter((x) => x && x.name && x.amount > 0).map((x) => {
    const plan = Math.round((Number(x.amount) || 0) * share);
    const spent = tx.filter((e) => e.category === x.category && (!x.subcategory || e.subcategory === x.subcategory)).reduce((s, e) => s + (e.amount || 0), 0);
    return { ...x, plan, spent, need: Math.max(plan, spent), status: spent >= plan * 0.95 ? "paid" : spent > 0 ? "part" : "wait" };
  });
  const need = rows.reduce((s, x) => s + x.need, 0);
  const pays = paymentsIn(orders, r);
  const variable = tx.filter((e) => VARIABLE_CATS.includes(e.category) && inR(e.date, r));
  // kunma-kun yig'ib, qachon «kerak»dan oshganini topamiz
  const days = dailySeries(pays, r, (p) => p.date, (p) => p.amount);
  const vdays = dailySeries(variable, r, (e) => e.date, (e) => e.amount);
  let acc = 0, coveredOn = null;
  days.forEach((d, i) => { acc += d.value - vdays[i].value; if (coveredOn == null && need > 0 && acc >= need) coveredOn = d.date; });
  const found = acc;
  const elapsed = days.length, left = spanDays(today, monthEnd) - 1;
  const perDay = elapsed ? found / elapsed : 0;
  const remain = Math.max(0, need - found);
  const eta = !coveredOn && remain > 0 && perDay > 0 ? add(today, Math.ceil(remain / perDay)) : null;
  return { rows, need, found, income: sumBy(pays, (p) => p.amount), variable: sumBy(variable, (e) => e.amount), coveredOn, remain, extra: Math.max(0, found - need), pct: need > 0 ? Math.min(100, Math.round((found / need) * 100)) : 0, eta: eta && eta <= monthEnd ? eta : eta ? "keyingi oy" : null, daysLeft: left, perDay };
}

// Ixtiyoriy: oy oxiri prognozi, material bo'yicha tushum
export function forecast(orders, today = localDateStr(new Date())) {
  const r = periodOf("mtd", today);
  const t = D(today);
  const income = sumBy(paymentsIn(orders, r), (p) => p.amount);
  const elapsed = t.getDate(), total = daysIn(t.getFullYear(), t.getMonth());
  const prevMonthAll = (() => { const py = t.getMonth() === 0 ? t.getFullYear() - 1 : t.getFullYear(), pm = t.getMonth() === 0 ? 11 : t.getMonth() - 1; return sumBy(paymentsIn(orders, { from: localDateStr(new Date(py, pm, 1)), to: localDateStr(new Date(py, pm, daysIn(py, pm))) }), (p) => p.amount); })();
  return { income, projected: Math.round((income / elapsed) * total), elapsed, total, prevMonth: prevMonthAll };
}
export function topMaterials(orders, r) {
  const map = {};
  for (const o of orders || []) { if (o.deletedAt || !inR(o.date, r)) continue; const k = o.materialType || "Boshqa"; const x = map[k] || { name: k, sum: 0, area: 0, n: 0 }; x.sum += o.agreementUzs || 0; x.area += Number(o.area) || 0; x.n++; map[k] = x; }
  return Object.values(map).sort((a, b) => b.sum - a.sum).slice(0, 5);
}
