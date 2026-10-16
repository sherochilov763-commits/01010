// jobsPrefs.js — «Vazifalar» bo'limini sozlash: ko'rinishlar, tepadagi kartalar, ro'yxat ustunlari, filtrlar.
// Saqlangan tartib + yangi qo'shilgan ustunlar (oxiriga, yoqilgan) birlashtiriladi.
export const VIEW_DEFS = [["list", "Ro'yxat"], ["board", "Doska"], ["brigade", "Brigada jadvali"], ["calendar", "Kalendar"]];
export const CARD_DEFS = [["late", "Kechikkan"], ["today", "Bugun"], ["tomorrow", "Ertaga"], ["nodate", "Sanasiz"], ["done", "Bajarildi"]];
export const COL_DEFS = [["when", "Qachon"], ["people", "Mas'ul"], ["status", "Holat"], ["address", "Manzil"], ["line", "Yo'nalish"], ["checklist", "Tekshiruv"]];
export const FILTER_DEFS = [["kinds", "Tur (O'lchov, Montaj…)"], ["person", "Mas'ul"], ["line", "Yo'nalish"], ["mine", "Mening ishlarim"]];
export const FIELD_TYPES = [
  ["text", "Matn", "Oniks 18 mm"], ["number", "Raqam", "6 m²"], ["date", "Sana", "18-okt"],
  ["select", "Tanlov", "Oniks / Shisha"], ["check", "Belgi", "✓ / —"], ["person", "Xodim", "@Bekzod"],
];
const DEFAULT_OFF = {};

function mergeList(saved, defs, group) {
  const known = new Map(defs.map(([k]) => [k, true]));
  const out = [];
  for (const x of Array.isArray(saved) ? saved : []) if (known.has(x.k) && !out.some((y) => y.k === x.k)) out.push({ k: x.k, on: !!x.on });
  for (const [k] of defs) if (!out.some((y) => y.k === k)) out.push({ k, on: !(DEFAULT_OFF[group] || []).includes(k) });
  return out;
}
export function colDefs(config) {
  return [...COL_DEFS, ...(config?.fields || []).filter((f) => !f.archived).map((f) => [`f:${f.id}`, f.name])];
}
export function filterDefs(config) {
  return [...FILTER_DEFS, ...(config?.fields || []).filter((f) => !f.archived && ["select", "check", "person"].includes(f.type)).map((f) => [`f:${f.id}`, f.name])];
}
// Saqlangan (shaxsiy yoki «hamma uchun») sozlama → to'liq, tartiblangan
export function resolvePrefs(saved, config) {
  const p = saved || config?.defaults || {};
  const columns = mergeList(p.columns, colDefs(config), "columns");
  // O'z ustuni birinchi marta qo'shilganda — yoqilgan bo'ladi (mergeList shunday qiladi)
  const filters = mergeList(p.filters, filterDefs(config), "filters").map((x) => (x.k.startsWith("f:") && !(p.filters || []).some((y) => y.k === x.k) ? { ...x, on: false } : x));
  const views = mergeList(p.views, VIEW_DEFS, "views");
  if (!views.some((v) => v.on)) views[0].on = true;
  return { views, cards: mergeList(p.cards, CARD_DEFS, "cards"), columns, filters, showDone: p.showDone !== false, compact: !!p.compact, mine: !!p.mine };
}
export const isOn = (list, k) => !!list.find((x) => x.k === k)?.on;
export function fieldsFor(config, kind) {
  return (config?.fields || []).filter((f) => !f.archived && (!f.kinds?.length || f.kinds.includes(kind)));
}
export function fmtCustom(f, v, employees = []) {
  if (v === undefined || v === null || v === "") return "";
  if (f.type === "check") return v ? "✓" : "—";
  if (f.type === "number") return Number(v).toLocaleString("ru-RU").replace(/,/g, " ");
  if (f.type === "date") { const d = new Date(v + "T00:00:00"); return isNaN(d) ? v : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`; }
  if (f.type === "person") return employees.find((e) => e.id === v)?.name.split(" ")[0] || "—";
  return String(v);
}
