// pnl.js — «Foyda va zarar»: yo'nalishlar bo'yicha oylik natija (rahbar uchun).
// Tushum — shu oydagi to'lovlar; to'g'ridan rasxod — yo'nalishning o'z rasxodlari;
// umumiy rasxod — oy tushumi ulushiga qarab bo'linadi (tushum bo'lmasa — teng);
// qarzdorlik — hozirgi umumiy qarz (davrdan qat'i nazar).
import { orderDebt } from "./finance.js";
import { COMMON, LINES, lineOfOrder, monthIncome, shareOf, txLine, workShareOf } from "./lines.js";

const prevMonthOf = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

function monthResult(month, orders, txs, income, lineById, work) {
  const r = {};
  for (const l of LINES) r[l] = { income: income[month]?.[l] || 0, direct: 0, common: 0, staff: 0 };
  let commonTotal = 0;
  let staffTotal = 0;
  for (const t of txs) {
    if (t.deletedAt || String(t.date || "").slice(0, 7) !== month) continue;
    const l = txLine(t, lineById);
    if (l !== COMMON) { r[l].direct += t.amount || 0; continue; }
    // Umumiy xodim oyligi — bajargan ishi nisbatida (ish bo'lmasa — tushum ulushi bilan umumiy qatorga)
    const ws = workShareOf("UVIXPRINT", t, work);
    if (ws == null) { commonTotal += t.amount || 0; continue; }
    const a = Math.round((t.amount || 0) * ws);
    r.UVIXPRINT.staff += a; r.UVONYX.staff += (t.amount || 0) - a; staffTotal += t.amount || 0;
  }
  const shares = {};
  for (const l of LINES) { shares[l] = shareOf(l, month, income); }
  // Yaxlitlash qoldig'i oxirgi yo'nalishga — jami aniq chiqsin
  r.UVIXPRINT.common = Math.round(commonTotal * shares.UVIXPRINT);
  r.UVONYX.common = commonTotal - r.UVIXPRINT.common;
  for (const l of LINES) r[l].profit = r[l].income - r[l].direct - r[l].staff - r[l].common;
  return { r, shares, commonTotal, staffTotal };
}

export function computePnl(orders, txs, month, work = null) {
  const act = (orders || []).filter((o) => !o.deletedAt);
  const lineById = new Map(act.map((o) => [o.id, lineOfOrder(o)]));
  const income = monthIncome(act);
  const cur = monthResult(month, act, txs || [], income, lineById, work);
  const prev = monthResult(prevMonthOf(month), act, txs || [], income, lineById, work);
  const debt = { UVIXPRINT: 0, UVONYX: 0 };
  for (const o of act) debt[lineOfOrder(o)] += orderDebt(o);
  const row = (l) => {
    const x = cur.r[l];
    const p = prev.r[l].profit;
    return { ...x, margin: x.income > 0 ? x.profit / x.income : null, change: p !== 0 ? (x.profit - p) / Math.abs(p) : null, prevProfit: p, diff: x.profit - p, debt: debt[l] };
  };
  const a = row("UVIXPRINT"), b = row("UVONYX");
  const tot = { income: a.income + b.income, direct: a.direct + b.direct, staff: a.staff + b.staff, common: a.common + b.common, profit: a.profit + b.profit, debt: a.debt + b.debt };
  const prevTot = prev.r.UVIXPRINT.profit + prev.r.UVONYX.profit;
  tot.margin = tot.income > 0 ? tot.profit / tot.income : null;
  tot.change = prevTot !== 0 ? (tot.profit - prevTot) / Math.abs(prevTot) : null;
  tot.prevProfit = prevTot; tot.diff = tot.profit - prevTot;
  return { month, UVIXPRINT: a, UVONYX: b, total: tot, shares: cur.shares, hasStaff: cur.staffTotal > 0 };
}

// Bir necha oy (davr) uchun: har oy alohida hisoblanib (umumiy rasxod — o'sha oy tushumi ulushida) qo'shiladi.
// months — ["2026-08","2026-09",...]. Oldingi davr — xuddi shuncha oy oldin.
export function computePnlMonths(orders, txs, months, work = null) {
  const act = (orders || []).filter((o) => !o.deletedAt);
  const lineById = new Map(act.map((o) => [o.id, lineOfOrder(o)]));
  const income = monthIncome(act);
  const add = (ms) => {
    const acc = { UVIXPRINT: { income: 0, direct: 0, common: 0, staff: 0, profit: 0 }, UVONYX: { income: 0, direct: 0, common: 0, staff: 0, profit: 0 } };
    let staffTotal = 0, commonTotal = 0;
    for (const m of ms) {
      const r = monthResult(m, act, txs || [], income, lineById, work);
      for (const l of LINES) for (const k of Object.keys(acc[l])) acc[l][k] += r.r[l][k];
      staffTotal += r.staffTotal; commonTotal += r.commonTotal;
    }
    return { acc, staffTotal, commonTotal };
  };
  const shiftMonth = (m, n) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const cur = add(months);
  const prev = add(months.map((m) => shiftMonth(m, -months.length)));
  const debt = { UVIXPRINT: 0, UVONYX: 0 };
  for (const o of act) debt[lineOfOrder(o)] += orderDebt(o);
  const row = (l) => { const x = cur.acc[l]; const p = prev.acc[l].profit; return { ...x, margin: x.income > 0 ? x.profit / x.income : null, prevProfit: p, diff: x.profit - p, debt: debt[l] }; };
  const a = row("UVIXPRINT"), b = row("UVONYX");
  const tot = { income: a.income + b.income, direct: a.direct + b.direct, staff: a.staff + b.staff, common: a.common + b.common, profit: a.profit + b.profit, debt: a.debt + b.debt, prevProfit: a.prevProfit + b.prevProfit };
  tot.margin = tot.income > 0 ? tot.profit / tot.income : null; tot.diff = tot.profit - tot.prevProfit;
  const incTot = a.income + b.income;
  const commonA = cur.acc.UVIXPRINT.common, commonB = cur.acc.UVONYX.common;
  const shares = commonA + commonB > 0 ? { UVIXPRINT: commonA / (commonA + commonB), UVONYX: commonB / (commonA + commonB) } : { UVIXPRINT: incTot ? a.income / incTot : 0.5, UVONYX: incTot ? b.income / incTot : 0.5 };
  return { months, UVIXPRINT: a, UVONYX: b, total: tot, shares, hasStaff: cur.staffTotal > 0 };
}
// Davr (from..to) → oylar ro'yxati
export function monthsBetween(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 240) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
