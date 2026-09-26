import * as XLSX from "xlsx";
import { orderAddedValue, orderDebt, orderTotalPaid } from "./finance.js";
import { paymentTypeLabel } from "./format.js";

export function buildExcelWorkbook(orders, expenses, categories, rangeLabel) {
  const totalOrderUzs = orders.reduce((s, o) => s + (o.agreementUzs || 0), 0);
  const totalPaid = orders.reduce((s, o) => s + orderTotalPaid(o), 0);
  const totalDebt = orders.reduce((s, o) => s + orderDebt(o), 0);
  const totalKraska = orders.reduce((s, o) => s + (o.kraskaSum || 0), 0);
  const totalMaterialInOrders = orders.reduce((s, o) => s + (o.materialSum || 0), 0);
  const totalAddedValue = orders.reduce((s, o) => s + orderAddedValue(o, expenses), 0);
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);

  const catNames = Object.keys(categories || {});
  const catTotals = {};
  catNames.forEach((c) => (catTotals[c] = 0));
  expenses.forEach((t) => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const orderRows = orders.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((o) => ({
    "Buyurtma raqami": o.orderNumber || "", Sana: o.date, Mijoz: o.customer || "", "Sub kategoriya": o.subcategory || "",
    "Material turi": o.materialType || "", "Mas'ul menedjer": o.manager || "", "Kv/m": o.area != null ? o.area : "",
    "Umumiy buyurtma ($)": o.agreementUsd || "", "USD kursi": o.exchangeRate || "", "Umumiy buyurtma (so'm)": o.agreementUzs || "",
    "Kraska summasi": o.kraskaSum || "", "Material summasi": o.materialSum || "",
    "Qo'shilgan qiymat": orderAddedValue(o, expenses), "To'langan": orderTotalPaid(o), Qarzdorlik: orderDebt(o),
    Kommentariya: o.note || "",
  }));

  const paymentRows = [];
  orders.forEach((o) => {
    (o.payments || []).forEach((p) => {
      paymentRows.push({
        "Buyurtma raqami": o.orderNumber || "", Mijoz: o.customer || "", Sana: p.date,
        Summa: p.amount, "To'lov turi": paymentTypeLabel(p.paymentType),
        Izoh: p.comment || "", "Kim qabul qildi": p.createdBy || "",
      });
    });
  });

  const expenseRows = expenses.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => ({
    Sana: t.date, Kategoriya: t.category, Subkategoriya: t.subcategory || "",
    "To'lov turi": paymentTypeLabel(t.paymentType), Summa: t.amount, Izoh: t.note || "",
  }));

  const catRows = Object.entries(catTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([Kategoriya, Summa]) => ({ Kategoriya, Summa }));

  const summaryRows = [
    { Korsatkich: "Davr", Qiymat: rangeLabel || "Barcha vaqt" },
    { Korsatkich: "Umumiy buyurtmalar summasi", Qiymat: totalOrderUzs },
    { Korsatkich: "Jami to'langan", Qiymat: totalPaid },
    { Korsatkich: "Jami qarzdorlik", Qiymat: totalDebt },
    { Korsatkich: "Jami kraska", Qiymat: totalKraska },
    { Korsatkich: "Jami material (buyurtmalarda)", Qiymat: totalMaterialInOrders },
    { Korsatkich: "Jami qo'shilgan qiymat", Qiymat: totalAddedValue },
    { Korsatkich: "Jami rasxod", Qiymat: totalExpense },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Umumiy");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), "Buyurtmalar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows), "To'lovlar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), "Rasxodlar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), "Kategoriyalar");
  return wb;
}
export function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename);
}
