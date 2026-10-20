import { numberPrefix } from "./lines.js";
import { DASHBOARD_WIDGET_CATALOG, DEFAULT_DASHBOARD_LAYOUT } from "../constants.js";
import { localDateStr, monthKey, todayStr } from "./format.js";

/* ---------------- ORDER / PAYMENT HELPERS (bitta joyda — source of truth) ---------------- */
// O'chirilgan (savatdagi) to'lovlar hech qayerda hisoblanmaydi
export const activePayments = (order) => (order?.payments || []).filter((p) => p && !p.deletedAt);
export function orderTotalPaid(order) {
  return activePayments(order).reduce((s, p) => s + (p.amount || 0), 0);
}
export function orderDebt(order) {
  return Math.max(0, (order.agreementUzs || 0) - orderTotalPaid(order));
}
// Kelishuvdan ortiq to'langan summa (mijozga qaytariladi yoki keyingi ishga o'tadi)
export function orderOverpaid(order) {
  return Math.max(0, orderTotalPaid(order) - (order.agreementUzs || 0));
}
export function orderBrakSum(order, transactions) {
  if (!transactions || !order) return 0;
  return transactions
    .filter((t) => !t.deletedAt && t.category === "Brak" && t.relatedOrderId === order.id)
    .reduce((s, t) => s + (t.amount || 0), 0);
}
// Buyurtmaning material xarajati — unga bog'langan «Material» rasxodlaridan (rasxod tahrirlansa/o'chirilsa — shu zahoti);
// bog'langan rasxod yo'q bo'lsa — buyurtmaga yozilgan eski summa
export function orderMaterialSum(order, transactions) {
  if (!order) return 0;
  const linked = (transactions || []).filter((t) => t && !t.deletedAt && t.category === "Material" && t.relatedOrderId === order.id);
  if (linked.length) return linked.reduce((s, t) => s + (t._fullAmount ?? t.amount ?? 0), 0);
  return Number(order.materialSum) || 0;
}
export function orderAddedValue(order, transactions) {
  const brak = orderBrakSum(order, transactions);
  return (order.agreementUzs || 0) - (order.kraskaSum || 0) - orderMaterialSum(order, transactions) - brak;
}
// To'lov turi: eski «perechisleniye» — bank
export const payTypeOf = (v) => (v === "karta" ? "karta" : v === "bank" || v === "perechisleniye" ? "bank" : "naqd");

export function generateOrderNumber(existingOrders, dateStr, line) {
  const datePart = (dateStr || todayStr()).replace(/-/g, "").slice(2); // YYMMDD
  const prefix = `${numberPrefix(line)}-${datePart}-`; // yo'nalish bo'yicha: UV-… / ON-… (prefiks — sozlamadan)
  const sameDay = existingOrders.filter((o) => (o.orderNumber || "").startsWith(prefix));
  const seq = String(sameDay.length + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}
export function getEffectiveDashboardLayout(settings) {
  const saved = settings?.dashboardLayout;
  const base = Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_DASHBOARD_LAYOUT;
  const known = new Set(base.map((w) => w.id));
  const extra = DASHBOARD_WIDGET_CATALOG.filter((w) => !known.has(w.id)).map((w) => ({ id: w.id, visible: false, size: w.defaultSize }));
  return [...base, ...extra].map((w) => ({ ...w, size: w.size || DASHBOARD_WIDGET_CATALOG.find((c) => c.id === w.id)?.defaultSize || "md" }));
}

/* ---------------- DASHBOARD ---------------- */

/* ---------------- FINANCE STATS (bitta manba — Dashboard, Hisobot, Excel barchasi shundan foydalanadi) ---------------- */
// Dashboard ko'rsatkichlari.
//  • Buyurtmaga oid (summa, qarz, kraska, material, qo'shilgan qiymat, kvadrat) — davrda OCHILGAN buyurtmalar;
//  • Pulga oid (to'lovlar, bugungi/oylik to'lov, grafiklar) — davrda KELGAN to'lovlar (buyurtma qachon ochilganidan qat'i nazar);
//  • O'chirilgan to'lovlar hisoblanmaydi.
// orders — davr bo'yicha filtrlangan buyurtmalar; opts.payOrders — to'lovlar olinadigan barcha buyurtmalar; opts.from/to — davr.
export function computeFinanceStats(orders, expenses, opts = {}) {
  const today = todayStr();
  const curMonth = today.slice(0, 7);
  const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
  const inP = (d) => (!opts.from || String(d || "") >= opts.from) && (!opts.to || String(d || "") <= opts.to);
  const exp = (expenses || []).filter((t) => t && !t.deletedAt);

  const totalOrderValue = sum(orders, (o) => o.agreementUzs || 0);
  const totalPaid = sum(orders, (o) => orderTotalPaid(o));
  const totalDebt = sum(orders, (o) => orderDebt(o));
  const totalOverpaid = sum(orders, (o) => orderOverpaid(o));
  const totalKraska = sum(orders, (o) => o.kraskaSum || 0);
  const totalMaterialInOrders = sum(orders, (o) => orderMaterialSum(o, exp));
  const totalAddedValue = sum(orders, (o) => orderAddedValue(o, exp));
  const totalArea = sum(orders, (o) => o.area || 0);
  const totalAgreementUsd = sum(orders, (o) => o.agreementUsd || 0);

  // Barcha (o'chirilmagan) to'lovlar — keyin davr bo'yicha
  const everyPayment = [];
  (opts.payOrders || orders).forEach((o) => { if (o && !o.deletedAt) activePayments(o).forEach((p) => everyPayment.push({ ...p, orderId: o.id, orderNumber: o.orderNumber, customer: o.customer })); });
  const allPayments = everyPayment.filter((p) => inP(p.date));

  const byType = (arr, field, t) => sum(arr, (x) => (payTypeOf(x[field]) === t ? x.amount : 0));
  const cardPaid = byType(allPayments, "paymentType", "karta");
  const cashPaid = byType(allPayments, "paymentType", "naqd");
  const bankPaid = byType(allPayments, "paymentType", "bank");
  const cardExpense = byType(exp, "paymentType", "karta");
  const cashExpense = byType(exp, "paymentType", "naqd");
  const bankExpense = byType(exp, "paymentType", "bank");
  const totalExpense = sum(exp, (t) => t.amount);
  const periodPaid = sum(allPayments, (p) => p.amount);

  // «Bugun» va «shu oy» — davr filtridan qat'i nazar (kartalar nomi shunday)
  const todayPaid = sum(everyPayment, (p) => (p.date === today ? p.amount : 0));
  const todayExpense = sum(exp, (t) => (t.date === today ? t.amount : 0));
  const monthPaid = sum(everyPayment, (p) => (monthKey(p.date) === curMonth ? p.amount : 0));
  const monthExpense = sum(opts.allExpenses || exp, (t) => (!t.deletedAt && monthKey(t.date) === curMonth ? t.amount : 0));

  const materialExpense = sum(exp, (t) => (t.category === "Material" ? t.amount : 0));
  const employeeExpense = sum(exp, (t) => (t.category === "Xodimlar" || t.category === "Ish haqi" ? t.amount : 0));

  // Oldingi oy (MoM) — mahalliy sana bilan (UTC ga o'girilmaydi)
  const now = new Date();
  const prevMonth = localDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
  const prevMonthPaid = sum(everyPayment, (p) => (monthKey(p.date) === prevMonth ? p.amount : 0));
  const prevMonthExpense = sum(opts.allExpenses || exp, (t) => (!t.deletedAt && monthKey(t.date) === prevMonth ? t.amount : 0));

  const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
  const momChange = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0));

  return {
    totalOrderValue, totalPaid, totalDebt, totalOverpaid, totalKraska, totalMaterialInOrders, totalAddedValue,
    totalArea, totalAgreementUsd,
    cardPaid, cashPaid, bankPaid, cardExpense, cashExpense, bankExpense, totalExpense, periodPaid,
    todayPaid, todayExpense, monthPaid, monthExpense, prevMonthPaid, prevMonthExpense,
    materialExpense, employeeExpense,
    allPayments,
    collectionRatePct: Math.min(100, pct(totalPaid, totalOrderValue)),
    debtSharePct: pct(totalDebt, totalOrderValue),
    addedValueMarginPct: pct(totalAddedValue, totalOrderValue),
    expenseToIncomeRatioPct: pct(totalExpense, periodPaid),
    momPaymentGrowthPct: momChange(monthPaid, prevMonthPaid),
    momExpenseGrowthPct: momChange(monthExpense, prevMonthExpense),
    cardSharePct: pct(cardPaid, cardPaid + cashPaid + bankPaid),
    cashSharePct: pct(cashPaid, cardPaid + cashPaid + bankPaid),
    bankSharePct: pct(bankPaid, cardPaid + cashPaid + bankPaid),
  };
}
export function periodRange(period, customFrom, customTo) {
  const now = new Date();
  const fmtD = (d) => localDateStr(d);
  if (period === "today") return { from: fmtD(now), to: fmtD(now) };
  if (period === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: fmtD(y), to: fmtD(y) };
  }
  if (period === "week") {
    const day = now.getDay() || 7;
    const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
    return { from: fmtD(monday), to: fmtD(now) };
  }
  if (period === "month") {
    return { from: fmtD(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtD(now) };
  }
  if (period === "lastMonth") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmtD(first), to: fmtD(last) };
  }
  if (period === "year") {
    return { from: fmtD(new Date(now.getFullYear(), 0, 1)), to: fmtD(now) };
  }
  return { from: customFrom || fmtD(now), to: customTo || fmtD(now) };
}
