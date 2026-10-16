// jobsLib.js — «Vazifalar» uchun umumiy yordamchilar: turlar, sanalar, guruhlash, tezkor qo'shish satrini tahlil qilish.
// React'siz — unit testlarda ham ishlatiladi.
import { CalendarDays, ClipboardCheck, Palette, Printer, Ruler, Truck, Wrench } from "lucide-react";

export const JOB_KINDS = {
  measure: { l: "O'lchov", I: Ruler, c: "#6D28D9" },
  install: { l: "Montaj", I: Wrench, c: "#0E7C6B" },
  deliver: { l: "Yetkazish", I: Truck, c: "#B45309" },
  other: { l: "Boshqa", I: ClipboardCheck, c: "#52525B" },
  design: { l: "Dizayn", I: Palette, c: "#1F5FD6", ro: true },
  print: { l: "Pechat", I: Printer, c: "#0E7490", ro: true },
};
export const FIELD_KINDS = ["measure", "install", "deliver", "other"];
export const STATUS = { new: "Yangi", doing: "Jarayonda", done: "Bajarildi", cancelled: "Bekor", in_progress: "Jarayonda" };
export const WD = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
export const WD_FULL = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
export const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
export const MONTHS_CAP = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));
export const CalIcon = CalendarDays;

const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
export const today = () => iso(new Date());
export const nowHM = () => new Date().toTimeString().slice(0, 5);
export const mondayOf = (s) => { const d = new Date(s + "T00:00:00"); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); };
export const dayText = (s) => { if (!s) return ""; const d = new Date(s + "T00:00:00"); return `${d.getDate()}-${MONTHS[d.getMonth()]}`; };
export const weekdayOf = (s) => (new Date(s + "T00:00:00").getDay() + 6) % 7;
export const isOpen = (j) => !["done", "cancelled"].includes(j.status);
export const isLate = (j, t = today(), hm = nowHM()) => isOpen(j) && !!j.date && (j.date < t || (j.date === t && !!j.time && j.time < hm));
export const mapsUrl = (a) => `https://yandex.uz/maps/?text=${encodeURIComponent(a)}`;
export const hm2min = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const min2hm = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

// «bugun 14:00», «ertaga», «kecha 16:00», «18-okt»
export function whenText(j, t = today()) {
  if (!j.date) return "sanasiz";
  const d = j.date === t ? "bugun" : j.date === addDays(t, 1) ? "ertaga" : j.date === addDays(t, -1) ? "kecha" : dayText(j.date);
  return j.time ? (d === "bugun" ? j.time : `${d} ${j.time}`) : d;
}
// «1 soat 20 daqiqadan keyin» / «hozir» / «40 daqiqa oldin»
export function untilText(j, now = new Date()) {
  if (!j.date || !j.time) return "";
  const ts = new Date(`${j.date}T${j.time}:00`).getTime();
  let m = Math.round((ts - now.getTime()) / 60000);
  const past = m < 0; m = Math.abs(m);
  if (m < 5) return "hozir";
  const h = Math.floor(m / 60), mm = m % 60;
  const txt = h ? `${h} soat${mm ? ` ${mm} daqiqa` : ""}` : `${mm} daqiqa`;
  return past ? `${txt} oldin` : `${txt}dan keyin`;
}

export const byWhen = (a, b) => `${a.date || "9"}${a.time || "99"}`.localeCompare(`${b.date || "9"}${b.time || "99"}`);

// Ro'yxat guruhlari: Kechikkan / Bugun / Ertaga / Keyinroq / Sanasiz / Bajarilgan
export const GROUPS = [
  ["late", "Kechikkan"], ["today", "Bugun"], ["tomorrow", "Ertaga"], ["later", "Keyinroq"], ["nodate", "Sanasi belgilanmagan"], ["done", "Bajarilgan"],
];
export function groupOf(j, t = today(), hm = nowHM()) {
  if (!isOpen(j)) return "done";
  if (isLate(j, t, hm)) return "late";
  if (!j.date) return "nodate";
  if (j.date === t) return "today";
  if (j.date === addDays(t, 1)) return "tomorrow";
  return "later";
}
export function groupJobs(list, t = today(), hm = nowHM()) {
  const g = Object.fromEntries(GROUPS.map(([k]) => [k, []]));
  for (const j of list) g[groupOf(j, t, hm)].push(j);
  for (const k of Object.keys(g)) g[k].sort(byWhen);
  g.done.sort((a, b) => String(b.doneAt || b.date || "").localeCompare(String(a.doneAt || a.date || "")));
  return GROUPS.map(([k, l]) => [k, l, g[k]]);
}
export function weekDoneCount(list, t = today()) {
  const mon = mondayOf(t);
  return list.filter((j) => j.status === "done" && String(j.doneAt || j.date || "").slice(0, 10) >= mon).length;
}

// Dizayn/pechat vazifasini (buyurtma ichidagi) umumiy ko'rinishga keltirish
export const fromTask = (t) => ({ id: t.id, kind: t.kind, ro: true, title: `${t.taskNo} · ${t.jobTitle}`, line: t.line, date: t.deadline || null, time: null, status: t.status === "done" ? "done" : t.status === "in_progress" ? "doing" : "new", assignees: t.assigneeName ? [{ id: t.assigneeId, name: t.assigneeName }] : [], assigneeIds: t.assigneeId ? [t.assigneeId] : [], address: "", order: null, customer: t.customer, doneAt: t.doneAt || null });

// ---------- Tezkor qo'shish: «Montaj ON-261016-001 ertaga 14:00 @Bekzod @Sardor» ----------
const norm = (s) => String(s || "").toLowerCase().replace(/[ʻʼ'‘’`]/g, "").replace(/\s+/g, " ").trim();
const KIND_WORDS = { olchov: "measure", olcham: "measure", zamer: "measure", montaj: "install", ornatish: "install", yetkazish: "deliver", dostavka: "deliver", yetkazib: "deliver", vazifa: "other" };
export function parseQuick(text, { employees = [], orders = [], t = today() } = {}) {
  const out = { kind: null, orderId: null, date: null, time: null, assigneeIds: [], title: "", tokens: [] };
  const rest = [];
  for (const raw of String(text || "").split(/\s+/).filter(Boolean)) {
    const w = norm(raw);
    if (!out.kind && KIND_WORDS[w]) { out.kind = KIND_WORDS[w]; out.tokens.push({ t: "kind", v: raw }); continue; }
    if (/^[a-z]{1,4}-\d{6}-\d{2,4}$/i.test(raw)) {
      const o = orders.find((x) => String(x.orderNumber || "").toLowerCase() === raw.toLowerCase());
      if (o) { out.orderId = o.id; out.tokens.push({ t: "order", v: o.orderNumber }); continue; }
    }
    if (w === "bugun") { out.date = t; out.tokens.push({ t: "date", v: raw }); continue; }
    if (w === "ertaga") { out.date = addDays(t, 1); out.tokens.push({ t: "date", v: raw }); continue; }
    if (w === "indinga") { out.date = addDays(t, 2); out.tokens.push({ t: "date", v: raw }); continue; }
    let m = /^(\d{1,2})[./](\d{1,2})$/.exec(raw);
    if (m && Number(m[1]) <= 31 && Number(m[2]) <= 12) {
      const y = Number(t.slice(0, 4));
      let d = `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
      if (d < addDays(t, -60)) d = `${y + 1}${d.slice(4)}`;
      out.date = d; out.tokens.push({ t: "date", v: raw }); continue;
    }
    m = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) { out.time = `${pad(Number(m[1]))}:${m[2]}`; out.tokens.push({ t: "time", v: raw }); continue; }
    if (raw.startsWith("@") && raw.length > 1) {
      const q = norm(raw.slice(1));
      const e = employees.find((x) => norm(x.name).split(" ")[0] === q) || employees.find((x) => norm(x.name).startsWith(q));
      if (e) { if (!out.assigneeIds.includes(e.id)) out.assigneeIds.push(e.id); out.tokens.push({ t: "person", v: "@" + e.name.split(" ")[0] }); continue; }
    }
    rest.push(raw);
  }
  out.title = rest.join(" ").trim();
  if (out.time && !out.date) out.date = t;
  return out;
}
