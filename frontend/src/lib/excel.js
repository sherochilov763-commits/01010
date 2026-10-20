// excel.js — bo'limlardagi «Yuklash» (Excel / PDF) uchun umumiy funksiyalar. Hammasi exportPro.js dvigatelida:
// sarlavha bloki, rangli bosh qator, so'm formati, «JAMI» formula bilan, sarlavha qotirilgan, A4 ga sozlangan.
// xlsx (SheetJS) faqat Buyurtmalar importi (Excel'dan yuklash) uchun qoladi.
export const loadXLSX = () => import("xlsx");
import { lineOfOrder, txLine } from "./lines.js";
import { activePayments, orderAddedValue, orderDebt, orderMaterialSum, orderTotalPaid } from "./finance.js";
import { paymentTypeLabel } from "./format.js";

const pro = () => import("./exportPro.js");

// Ustun turi — sarlavhadan (so'm/summa/qarz → so'm; sana → sana; daq/kun/soni → butun; soat/m²/L → kasr)
function guessType(k, sample) {
  const s = k.toLowerCase();
  if (/sana|^date/.test(s) && !/necha/.test(s)) return "date";
  if (/so'm|summa|qarz|aylanma|to'langan|chek|qiymat|kraska summ|material summ|^kirim$|^chiqim$|rasxod|qoldiq/.test(s)) return typeof sample === "number" || sample === "" || sample == null ? "money" : "text";
  if (/\(daq\)|necha kun|buyurtmalar$|soni|kun\)$/.test(s)) return "int";
  if (/\(soat\)|m²|kv\/m|\(l\)|kurs|\(\$\)/.test(s)) return "num";
  return typeof sample === "number" ? "num" : "text";
}
function columnsFrom(rows) {
  const keys = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!k.startsWith("__") && !keys.includes(k)) keys.push(k);
  return keys.map((k) => {
    const sample = rows.find((r) => r[k] !== "" && r[k] != null)?.[k];
    const type = guessType(k, sample);
    return { key: k, label: k, type, total: type === "money" || (type === "int" && /buyurtmalar|soni/i.test(k)) ? "sum" : undefined, maxWidth: /izoh|komment|tavsif/i.test(k) ? 60 : 40 };
  });
}

// Oddiy jadval → Excel yoki PDF. opts: { kind: "xlsx"|"pdf", title, meta, totals: false, lineOf, split, kpis }
export async function exportRows(rows, sheetName, filename, opts = {}) {
  const m = await pro();
  const clean = rows.filter((r) => r && Object.keys(r).length);
  const columns = columnsFrom(clean);
  if (opts.totals === false) columns.forEach((c) => { delete c.total; });
  const base = { columns, rows: clean };
  const sections = opts.lineOf ? m.splitSections(base, clean, opts.lineOf, opts.split) : [base];
  const doc = { fileBase: String(filename).replace(/\.xlsx$/i, ""), title: opts.title || sheetName, meta: opts.meta || [], kpis: opts.kpis, user: opts.user, sheets: [{ name: sheetName, sections }] };
  return m.exportDoc(doc, opts.kind === "pdf" ? "pdf" : "xlsx");
}

// Buyurtmalar + to'lovlar + rasxodlar → bir nechta varaq (Buyurtmalar, Operatsiyalar, Rasxod, Hisobot)
export async function exportWorkbook(orders, expenses, categories, label, filename, opts = {}) {
  const m = await pro();
  const lineById = new Map(orders.map((o) => [o.id, lineOfOrder(o)]));
  const exp = (expenses || []).filter((t) => t && !t.deletedAt);
  const orderRows = orders.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((o) => ({
    __line: lineOfOrder(o),
    "Buyurtma raqami": o.orderNumber || "", Sana: o.date, Mijoz: o.customer || "", "Yo'nalish": o.subcategory || "",
    "Material turi": o.materialType || "", "Mas'ul": o.manager || "", "Kv/m": o.area != null ? o.area : "",
    "Summa (so'm)": o.agreementUzs || 0, "Kraska (so'm)": o.kraskaSum || 0, "Material (so'm)": orderMaterialSum(o, exp) || 0,
    "Qo'shilgan qiymat": orderAddedValue(o, exp), "To'langan (so'm)": orderTotalPaid(o), "Qarz (so'm)": orderDebt(o),
    Izoh: o.note || "",
  }));
  const paymentRows = [];
  orders.forEach((o) => activePayments(o).forEach((p) => paymentRows.push({ __line: lineOfOrder(o), "Buyurtma raqami": o.orderNumber || "", Mijoz: o.customer || "", Sana: p.date, "Summa (so'm)": p.amount, "To'lov turi": paymentTypeLabel(p.paymentType), Izoh: p.comment || "", "Kim qabul qildi": p.createdBy || "" })));
  paymentRows.sort((a, b) => (a.Sana < b.Sana ? 1 : -1));
  const expenseRows = exp.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => ({ __line: txLine(t, lineById), Sana: t.date, Kategoriya: t.category, Subkategoriya: t.subcategory || "", "To'lov turi": paymentTypeLabel(t.paymentType), "Summa (so'm)": t._fullAmount ?? t.amount, Izoh: t.note || "", Kim: t.createdBy || "" }));
  const catTotals = {};
  exp.forEach((t) => { catTotals[t.category || "Boshqa"] = (catTotals[t.category || "Boshqa"] || 0) + (t.amount || 0); });
  const catRows = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Kategoriya: k, "Summa (so'm)": v }));
  const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const split = !!opts.split;
  const lineOf = (r) => r.__line;
  const sheet = (name, rows) => {
    if (!rows.length) return null;
    const base = { columns: columnsFrom(rows) };
    return { name, sections: m.splitSections(base, rows, lineOf, split) };
  };
  const sheets = [sheet("Buyurtmalar", orderRows), sheet("To'lovlar", paymentRows), sheet("Rasxodlar", expenseRows), catRows.length ? { name: "Kategoriyalar", sections: [{ columns: columnsFrom(catRows), rows: catRows }] } : null].filter(Boolean);
  if (!sheets.length) sheets.push({ name: "Bo'sh", sections: [{ columns: [{ key: "x", label: "Ma'lumot yo'q" }], rows: [] }] });
  const kpis = [
    ...(orderRows.length ? [{ label: "Buyurtmalar", value: fmtM(sum(orderRows, "Summa (so'm)")) }, { label: "To'langan", value: fmtM(sum(orderRows, "To'langan (so'm)")), tone: "green" }, { label: "Qarz", value: fmtM(sum(orderRows, "Qarz (so'm)")), tone: "rose" }] : []),
    ...(expenseRows.length ? [{ label: "Rasxod", value: fmtM(sum(expenseRows, "Summa (so'm)")), tone: "rose" }] : []),
  ];
  const doc = { fileBase: String(filename).replace(/\.xlsx$/i, ""), title: label, meta: opts.meta || [], kpis: kpis.slice(0, 5), user: opts.user, sheets };
  return m.exportDoc(doc, opts.kind === "pdf" ? "pdf" : "xlsx");
}
const fmtM = (v) => { const n = Math.round(Number(v) || 0); return `${n < 0 ? "−" : ""}${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`; };
