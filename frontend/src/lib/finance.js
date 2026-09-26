import { DASHBOARD_WIDGET_CATALOG, DEFAULT_DASHBOARD_LAYOUT } from "../constants.js";
import { localDateStr, monthKey, todayStr } from "./format.js";

/* ---------------- ORDER / PAYMENT HELPERS (bitta joyda — source of truth) ---------------- */
export function orderTotalPaid(order) {
  return (order.payments || []).filter((p) => !p.deletedAt).reduce((s, p) => s + (p.amount || 0), 0);
}
export function orderDebt(order) {
  return Math.max(0, (order.agreementUzs || 0) - orderTotalPaid(order));
}
export function orderBrakSum(order, transactions) {
  if (!transactions || !order) return 0;
  return transactions
    .filter((t) => !t.deletedAt && t.category === "Brak" && t.relatedOrderId === order.id)
    .reduce((s, t) => s + (t.amount || 0), 0);
}
export function orderAddedValue(order, transactions) {
  const brak = orderBrakSum(order, transactions);
  return (order.agreementUzs || 0) - (order.kraskaSum || 0) - (order.materialSum || 0) - brak;
}
export function generateOrderNumber(existingOrders, dateStr) {
  const datePart = (dateStr || todayStr()).replace(/-/g, "").slice(2); // YYMMDD
  const prefix = `UV-${datePart}-`;
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
export function computeFinanceStats(orders, expenses) {
  const today = todayStr();
  const curMonth = today.slice(0, 7);
  const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

  const totalOrderValue = sum(orders, (o) => o.agreementUzs || 0);
  const totalPaid = sum(orders, (o) => orderTotalPaid(o));
  const totalDebt = sum(orders, (o) => orderDebt(o));
  const totalKraska = sum(orders, (o) => o.kraskaSum || 0);
  const totalMaterialInOrders = sum(orders, (o) => o.materialSum || 0);
  const totalAddedValue = sum(orders, (o) => orderAddedValue(o, expenses));
  const totalArea = sum(orders, (o) => o.area || 0);
  const totalAgreementUsd = sum(orders, (o) => o.agreementUsd || 0);

  const allPayments = [];
  orders.forEach((o) => (o.payments || []).forEach((p) => allPayments.push({ ...p, orderId: o.id, orderNumber: o.orderNumber, customer: o.customer })));

  const cardPaid = sum(allPayments, (p) => (p.paymentType === "karta" ? p.amount : 0));
  const cashPaid = sum(allPayments, (p) => (p.paymentType === "naqd" ? p.amount : 0));
  const bankPaid = sum(allPayments, (p) => (p.paymentType === "bank" ? p.amount : 0));
  const cardExpense = sum(expenses, (t) => (t.paymentType === "karta" ? t.amount : 0));
  const cashExpense = sum(expenses, (t) => (t.paymentType === "naqd" ? t.amount : 0));
  const bankExpense = sum(expenses, (t) => (t.paymentType === "bank" ? t.amount : 0));
  const totalExpense = sum(expenses, (t) => t.amount);

  const todayPaid = sum(allPayments, (p) => (p.date === today ? p.amount : 0));
  const todayExpense = sum(expenses, (t) => (t.date === today ? t.amount : 0));
  const monthPaid = sum(allPayments, (p) => (monthKey(p.date) === curMonth ? p.amount : 0));
  const monthExpense = sum(expenses, (t) => (monthKey(t.date) === curMonth ? t.amount : 0));

  const materialExpense = sum(expenses, (t) => (t.category === "Material" ? t.amount : 0));
  const employeeExpense = sum(expenses, (t) => (t.category === "Xodimlar" ? t.amount : 0));

  // Oldingi oy (MoM taqqoslash uchun)
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevMonthDate.toISOString().slice(0, 7);
  const prevMonthPaid = sum(allPayments, (p) => (monthKey(p.date) === prevMonth ? p.amount : 0));
  const prevMonthExpense = sum(expenses, (t) => (monthKey(t.date) === prevMonth ? t.amount : 0));

  const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
  const momChange = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0));

  return {
    totalOrderValue, totalPaid, totalDebt, totalKraska, totalMaterialInOrders, totalAddedValue,
    totalArea, totalAgreementUsd,
    cardPaid, cashPaid, bankPaid, cardExpense, cashExpense, bankExpense, totalExpense,
    cardBalance: cardPaid - cardExpense, cashBalance: cashPaid - cashExpense, bankBalance: bankPaid - bankExpense,
    totalMoney: (cardPaid - cardExpense) + (cashPaid - cashExpense) + (bankPaid - bankExpense),
    todayPaid, todayExpense, monthPaid, monthExpense, prevMonthPaid, prevMonthExpense,
    materialExpense, employeeExpense,
    allPayments,
    // --- Nisbatlar / foizlar (KPI) ---
    collectionRatePct: pct(totalPaid, totalOrderValue),
    debtSharePct: pct(totalDebt, totalOrderValue),
    addedValueMarginPct: pct(totalAddedValue, totalOrderValue),
    expenseToIncomeRatioPct: pct(totalExpense, totalPaid),
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
