// pnl.js — «Foyda va zarar»: yo'nalishlar bo'yicha oylik natija (rahbar uchun).
// Tushum — shu oydagi to'lovlar; to'g'ridan rasxod — yo'nalishning o'z rasxodlari;
// umumiy rasxod — oy tushumi ulushiga qarab bo'linadi (tushum bo'lmasa — teng);
// qarzdorlik — hozirgi umumiy qarz (davrdan qat'i nazar).
import { orderDebt } from "./finance.js";
import { COMMON, LINES, lineOfOrder, monthIncome, shareOf, txLine } from "./lines.js";

const prevMonthOf = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

function monthResult(month, orders, txs, income, lineById) {
  const r = {};
  for (const l of LINES) r[l] = { income: income[month]?.[l] || 0, direct: 0, common: 0 };
  let commonTotal = 0;
  for (const t of txs) {
    if (t.deletedAt || String(t.date || "").slice(0, 7) !== month) continue;
    const l = txLine(t, lineById);
    if (l === COMMON) commonTotal += t.amount || 0;
    else r[l].direct += t.amount || 0;
  }
  const shares = {};
  for (const l of LINES) { shares[l] = shareOf(l, month, income); }
  // Yaxlitlash qoldig'i oxirgi yo'nalishga — jami aniq chiqsin
  r.UVIXPRINT.common = Math.round(commonTotal * shares.UVIXPRINT);
  r.UVONYX.common = commonTotal - r.UVIXPRINT.common;
  for (const l of LINES) r[l].profit = r[l].income - r[l].direct - r[l].common;
  return { r, shares, commonTotal };
}

export function computePnl(orders, txs, month) {
  const act = (orders || []).filter((o) => !o.deletedAt);
  const lineById = new Map(act.map((o) => [o.id, lineOfOrder(o)]));
  const income = monthIncome(act);
  const cur = monthResult(month, act, txs || [], income, lineById);
  const prev = monthResult(prevMonthOf(month), act, txs || [], income, lineById);
  const debt = { UVIXPRINT: 0, UVONYX: 0 };
  for (const o of act) debt[lineOfOrder(o)] += orderDebt(o);
  const row = (l) => {
    const x = cur.r[l];
    const p = prev.r[l].profit;
    return { ...x, margin: x.income > 0 ? x.profit / x.income : null, change: p !== 0 ? (x.profit - p) / Math.abs(p) : null, debt: debt[l] };
  };
  const a = row("UVIXPRINT"), b = row("UVONYX");
  const tot = { income: a.income + b.income, direct: a.direct + b.direct, common: a.common + b.common, profit: a.profit + b.profit, debt: a.debt + b.debt };
  const prevTot = prev.r.UVIXPRINT.profit + prev.r.UVONYX.profit;
  tot.margin = tot.income > 0 ? tot.profit / tot.income : null;
  tot.change = prevTot !== 0 ? (tot.profit - prevTot) / Math.abs(prevTot) : null;
  return { month, UVIXPRINT: a, UVONYX: b, total: tot, shares: cur.shares };
}
