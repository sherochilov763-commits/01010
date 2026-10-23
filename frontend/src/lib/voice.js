// voice.js — ovozli yordamchi javobini (server: /api/voice/command) CRM formalariga moslash.
// Bu yerda faqat sof funksiyalar (testlanadi): mijoz/xodim/buyurtmani topish va formaga beriladigan boshlang'ich qiymatlar.
import { custKey } from "./customers.js";
import { computeItem } from "./production.js";
import { orderDebt } from "./finance.js";

const rid = () => Math.random().toString(36).slice(2, 10);
const fmtNum = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const words = (s) => custKey(s).replace(/[^a-z0-9'Ѐ-ӿ ]/gi, " ").split(" ").filter((w) => w.length > 1);

// Ism o'xshashligi: to'liq teng → 3; birinchi so'z teng → 2; so'z boshi mos ("Akmal" ~ "Akmaljon") → 1
export function nameScore(said, name) {
  const a = custKey(said), b = custKey(name);
  if (!a || !b) return 0;
  if (a === b) return 3;
  const wa = words(a), wb = words(b);
  if (!wa.length || !wb.length) return 0;
  if (wa.every((w) => wb.includes(w))) return 2.5;
  if (wa[0] === wb[0]) return 2;
  if (wa.some((w) => w.length >= 3 && wb.some((x) => x.startsWith(w) || w.startsWith(x)))) return 1;
  return 0;
}

// Eng mos ism (bir nechta teng bo'lsa — hammasi): [{ item, score }]
export function bestByName(said, items, nameOf = (x) => x.name) {
  if (!said) return [];
  const scored = (items || []).map((item) => ({ item, score: nameScore(said, nameOf(item)) })).filter((x) => x.score > 0);
  const top = Math.max(0, ...scored.map((x) => x.score));
  return scored.filter((x) => x.score === top);
}

export function matchEmployees(names, employees) {
  const out = [];
  for (const n of names || []) {
    const m = bestByName(n, (employees || []).filter((e) => !e.deletedAt && !e.archived));
    if (m.length === 1 && !out.includes(m[0].item.id)) out.push(m[0].item.id);
  }
  return out;
}

// Mijoz nomini bazadagi yozilishiga keltiramiz (aniq bitta mos bo'lsa)
export function canonicalCustomer(said, customers) {
  const m = bestByName(said, customers || []);
  return m.length === 1 && m[0].score >= 2 ? m[0].item.name : said || "";
}

// ---- Buyurtma (smeta) ----
export function quoteItems(items) {
  return (items || []).map((it) => {
    const unit = it.unit === "m2" || it.unit === "pcs" ? it.unit : "lump";
    const qty = unit === "lump" ? 1 : Math.max(1, Math.round(it.qty || 1));
    const area = unit === "m2" ? (it.w || 0) * (it.h || 0) * qty : 0;
    const units = unit === "m2" ? area : qty;
    // Narx aytilmasa, lekin jami aytilsa — narxni jamidan chiqaramiz (qo'lda summa sifatida)
    let price = it.price || 0;
    let manual = false;
    if (!price && it.total) { price = units > 0 ? Math.round(it.total / units) : it.total; manual = unit !== "lump" && Math.round(price * units) !== it.total; }
    const base = { id: rid(), title: it.title || "", material: it.material || "", priceId: null, unit, w: unit === "m2" ? it.w : 0, h: unit === "m2" ? it.h : 0, du: "mm", qty, price, minArea: 0, cur: "uzs" };
    const c = computeItem(manual ? { ...base, manualTotal: true, manualValue: it.total } : base);
    return c.total > 0 ? c : null;
  }).filter(Boolean);
}

// ---- To'lov: qaysi buyurtmaga ----
// Natija: { orders: [...], exact } — bitta bo'lsa to'g'ridan-to'g'ri ochiladi, ko'p bo'lsa tanlash
export function findPaymentOrders(data, orders) {
  const live = (orders || []).filter((o) => o && !o.deletedAt);
  if (data?.orderNumber) {
    const q = String(data.orderNumber).toUpperCase().replace(/\s+/g, "");
    const hit = live.filter((o) => String(o.orderNumber || "").toUpperCase().replace(/\s+/g, "").endsWith(q));
    if (hit.length) return { orders: hit, exact: hit.length === 1 };
  }
  if (!data?.customer) return { orders: [], exact: false };
  const m = bestByName(data.customer, live, (o) => o.customer);
  const debtors = m.map((x) => x.item).filter((o) => orderDebt(o) > 0);
  // Qarzdorlari bo'lsa — faqat ular; bo'lmasa — oxirgi 5 ta buyurtmasi (ortiqcha to'lov ogohlantirishi formada)
  const pool = (debtors.length ? debtors : m.map((x) => x.item)).slice().sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
  // Summa qarzga aynan teng bo'lgan yagona buyurtma — o'sha
  if (data.amount && pool.length > 1) {
    const eq = pool.filter((o) => orderDebt(o) === data.amount);
    if (eq.length === 1) return { orders: [eq[0], ...pool.filter((o) => o !== eq[0])].slice(0, 8), exact: true };
  }
  return { orders: pool.slice(0, 8), exact: pool.length === 1 };
}

export const paymentPrefill = (data) => ({ amount: data?.amount || 0, paymentType: data?.paymentType || "naqd", date: data?.date || null, comment: data?.comment || "" });

// ---- Rasxod ----
export function expensePreset(data, employees) {
  const emp = data?.employee ? matchEmployees([data.employee], (employees || []).filter((e) => e.role !== "admin"))[0] : null;
  return {
    category: data?.category || (emp ? "Xodimlar" : undefined),
    subcategory: data?.subcategory || undefined,
    amount: data?.amount || 0,
    paymentType: data?.paymentType || "karta",
    note: data?.note || "",
    date: data?.date || undefined,
    employeeId: emp || undefined,
  };
}

// ---- Vazifa ----
export function jobPreset(data, employees) {
  const title = data?.title || (data?.customer ? data.customer : "");
  return {
    kind: data?.kind || "other",
    title: data?.customer && title && !custKey(title).includes(custKey(data.customer)) ? `${data.customer} — ${title}` : title,
    date: data?.date || "",
    time: data?.time || "",
    address: data?.address || "",
    phone: data?.phone || "",
    assigneeIds: matchEmployees(data?.assignees, employees),
  };
}

// ---- Lid ----
export const leadPrefill = (data, customers) => ({
  customer: canonicalCustomer(data?.customer, customers),
  phone: data?.phone || "",
  jobTitle: data?.jobTitle || "",
  estimatedValue: data?.estimatedValue || 0,
  source: data?.source || "",
  notes: data?.notes || "",
});

// Panelda ko'rsatiladigan qisqa xulosa
const PAY_L = { naqd: "naqd", karta: "karta", bank: "bank" };
const JOB_L = { measure: "O'lchov", install: "Montaj", deliver: "Yetkazish", other: "Vazifa" };
export const ACTION_LABEL = { order: "Yangi buyurtma", payment: "To'lov", expense: "Rasxod", job: "Vazifa", lead: "Yangi lid" };
export function summary(r) {
  const d = r?.data || {};
  const sum = (n) => (n ? `${fmtNum(n)} so'm` : "");
  if (r?.action === "order") return [d.customer, ...(d.items || []).map((i) => [i.title || i.material, i.unit === "m2" && i.w ? `${i.w}×${i.h} m` : "", i.unit === "pcs" ? `${i.qty} dona` : "", sum(i.total || (i.price && i.unit === "lump" ? i.price : 0))].filter(Boolean).join(" "))].filter(Boolean).join(" · ");
  if (r?.action === "payment") return [d.customer || d.orderNumber, sum(d.amount), PAY_L[d.paymentType]].filter(Boolean).join(" · ");
  if (r?.action === "expense") return [d.category, d.subcategory, d.employee, sum(d.amount), PAY_L[d.paymentType], d.note].filter(Boolean).join(" · ");
  if (r?.action === "job") return [JOB_L[d.kind], d.title || d.customer, d.date ? `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}${d.time ? ` ${d.time}` : ""}` : "", (d.assignees || []).join(", ")].filter(Boolean).join(" · ");
  if (r?.action === "lead") return [d.customer, d.jobTitle, sum(d.estimatedValue), d.source].filter(Boolean).join(" · ");
  return r?.reply || "";
}
