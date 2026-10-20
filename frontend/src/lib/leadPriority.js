// leadPriority.js — lid muhimligi (Linear/Jira uslubi), keyingi ish holati va ustun ichida saralash.
// lead.priority: "urgent" | "high" | "mid" (sukut, yozilmaydi) | "low"
import { localDateStr } from "./format.js";

export const PRIORITIES = [
  { key: "urgent", label: "Shoshilinch", hint: "qizil ramka, ustunda doim tepada", rank: 0 },
  { key: "high", label: "Yuqori", hint: "yonida yozuv ham chiqadi", rank: 1 },
  { key: "mid", label: "O'rta", hint: "sukut bo'yicha", rank: 2 },
  { key: "low", label: "Past", hint: "och kulrang", rank: 3 },
];
export const priorityOf = (lead) => (PRIORITIES.some((p) => p.key === lead?.priority) ? lead.priority : "mid");
export const priorityMeta = (lead) => PRIORITIES.find((p) => p.key === priorityOf(lead));
export const PRIORITY_KEYS = { 1: "urgent", 2: "high", 3: "mid", 4: "low" };

// Lidning ochiq vazifalari (o'lchov/montaj): lidning o'zi yoki uning buyurtmalari bo'yicha, eng yaqini birinchi
export function openJobsOf(lead, jobs) {
  const ids = new Set([...(lead.orderIds || []), lead.orderId].filter(Boolean));
  return (jobs || []).filter((j) => !["done", "cancelled"].includes(j.status) && (j.leadId === lead.id || (j.orderId && ids.has(j.orderId))))
    .sort((a, b) => `${a.date || "9"}${a.time || ""}`.localeCompare(`${b.date || "9"}${b.time || ""}`));
}
// Keyingi ish: { state: "planned" | "late" | "none", job, lateDays }
export function nextActivity(lead, jobs, now = new Date()) {
  const open = openJobsOf(lead, jobs);
  const j = open[0];
  if (!j) {
    const busy = ["design", "print"].some((k) => lead[k]?.status && !["done", "unassigned"].includes(lead[k].status));
    return { state: busy ? "busy" : "none", job: null, more: 0 };
  }
  const today = localDateStr(now);
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const late = j.date && (j.date < today || (j.date === today && j.time && j.time < hm));
  const lateDays = late ? Math.max(0, Math.round((new Date(today) - new Date(j.date)) / 864e5)) : 0;
  return { state: late ? "late" : "planned", job: j, lateDays, more: open.length - 1 };
}
// Bosqichda necha kun (bosqich o'zgargan vaqtdan)
export function daysInStage(lead, now = Date.now()) {
  const t = new Date(lead.stageAt || lead.createdAt || 0).getTime();
  if (!t || isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 864e5));
}
export const stageAgeLevel = (d) => (d == null ? null : d >= 14 ? "danger" : d >= 7 ? "warn" : null);

// Ustun ichida: muhimlik → kechikkan ish → summa (katta birinchi)
export function sortLeads(list, jobs) {
  const key = new Map(list.map((l) => {
    const a = nextActivity(l, jobs);
    return [l.id, [priorityMeta(l).rank, a.state === "late" ? 0 : 1, -(Number(l.estimatedValue) || 0)]];
  }));
  return list.slice().sort((x, y) => {
    const a = key.get(x.id), b = key.get(y.id);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
}

// Mas'ul avatari: ismning 2 harfi va har xodim o'z rangida
const AV = ["#2563EB", "#0E7C6B", "#7C3AED", "#DB2777", "#EA580C", "#0891B2", "#65A30D", "#B45309", "#4F46E5", "#BE123C"];
export function avatarOf(name) {
  const n = String(name || "").trim();
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const first = n.split(/\s+/)[0] || "?";
  return { text: first.slice(0, 2).toUpperCase(), color: AV[h % AV.length] };
}
