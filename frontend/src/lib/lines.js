// lines.js — ikki yo'nalish (UVIXPRINT / UVONYX): ish maydoni, ranglar, rasxodni bo'lish.
// Buyurtma yo'nalishi — order.subcategory (avvaldan bor). Rasxod yo'nalishi — tx.line:
//   "UVIXPRINT" | "UVONYX" | "common" (umumiy). Yo'nalishsiz eski rasxod: buyurtmaga bog'langan bo'lsa — o'sha
//   buyurtmaning yo'nalishi, aks holda «Umumiy».
// «Umumiy» rasxod yo'nalishlarga shu oydagi tushum (to'lovlar) ulushiga qarab bo'linadi; tushum bo'lmasa — teng.
import { createContext, useContext, useMemo } from "react";

export const LINES = ["UVIXPRINT", "UVONYX"];
export const ALL = "all";
export const COMMON = "common";
export const LINE_META = {
  UVIXPRINT: { key: "UVIXPRINT", name: "UVIXPRINT", short: "UV", prefix: "UV", sub: "UV bosma", color: "#1F5FD6", colorDark: "#6E9BF0" },
  UVONYX: { key: "UVONYX", name: "UVONYX", short: "ON", prefix: "ON", sub: "Oniks / shisha", color: "#0E7C6B", colorDark: "#3FB8A3" },
};
// Yo'nalish sozlamalari (rahbar: Sozlamalar → Savdo → «Yo'nalishlar»): rang va raqam prefiksi.
// settings.lineProfiles = { UVIXPRINT: { color, prefix, logo, companyLine, cardNumber, cardHolder, managerPhone, managerName }, UVONYX: {...} }
const LINE_DEFAULTS = Object.fromEntries(Object.entries(LINE_META).map(([k, v]) => [k, { ...v }]));
const HEX = /^#[0-9a-fA-F]{6}$/;
export const cleanPrefix = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
const lighten = (hex, k = 0.4) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) + (255 - parseInt(hex.slice(i, i + 2), 16)) * k).toString(16).padStart(2, "0")).join("");
export function applyLineProfiles(profiles) {
  const pfx = {};
  for (const l of LINES) {
    const p = (profiles && profiles[l]) || {};
    const d = LINE_DEFAULTS[l];
    const color = HEX.test(p.color || "") ? p.color : d.color;
    pfx[l] = cleanPrefix(p.prefix).length >= 2 ? cleanPrefix(p.prefix) : d.prefix;
    Object.assign(LINE_META[l], { color, colorDark: color === d.color ? d.colorDark : lighten(color), prefix: pfx[l], short: pfx[l].slice(0, 2) });
  }
  // Ikkala yo'nalish prefiksi bir xil bo'lib qolmasin (raqamlar aralashadi)
  if (LINE_META.UVIXPRINT.prefix === LINE_META.UVONYX.prefix) { LINE_META.UVONYX.prefix = LINE_DEFAULTS.UVONYX.prefix; LINE_META.UVONYX.short = LINE_DEFAULTS.UVONYX.short; }
}
export const lineProfileOf = (settings, line) => ({ ...((settings?.lineProfiles || {})[line] || {}) });
export const lineColor = (line, dark) => (LINE_META[line] ? (dark ? LINE_META[line].colorDark : LINE_META[line].color) : dark ? "#A1A1AA" : "#52525B");
export const lineOfOrder = (o) => (o?.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT");
export const numberPrefix = (line) => LINE_META[line === "UVONYX" ? "UVONYX" : "UVIXPRINT"].prefix;

export function txLine(t, orderLineById) {
  if (t?.line === COMMON || LINES.includes(t?.line)) return t.line;
  if (t?.relatedOrderId && orderLineById?.has(t.relatedOrderId)) return orderLineById.get(t.relatedOrderId);
  return COMMON;
}

// Oy bo'yicha tushum: { "2026-10": { UVIXPRINT: 123, UVONYX: 45 } }
export function monthIncome(orders) {
  const m = {};
  for (const o of orders || []) {
    if (o.deletedAt) continue;
    const l = lineOfOrder(o);
    for (const p of o.payments || []) {
      if (p.deletedAt || !p.date) continue;
      const k = String(p.date).slice(0, 7);
      (m[k] ||= { UVIXPRINT: 0, UVONYX: 0 })[l] += p.amount || 0;
    }
  }
  return m;
}
export function shareOf(line, month, income) {
  const r = income[month];
  const total = r ? r.UVIXPRINT + r.UVONYX : 0;
  return total > 0 ? r[line] / total : 0.5;
}

// Umumiy xodim oyligi (rasxodda employeeId): shu oyda bajargan ishlari nisbatida bo'linadi.
// work = { "2026-10": { empId: { UVIXPRINT: n, UVONYX: n } } } (serverdan, /api/work-stats). Ish bo'lmasa — null.
export function workShareOf(line, t, work) {
  if (!t?.employeeId || !work) return null;
  const r = work[String(t.date || "").slice(0, 7)]?.[t.employeeId];
  const tot = r ? (r.UVIXPRINT || 0) + (r.UVONYX || 0) : 0;
  return tot > 0 ? (r[line] || 0) / tot : null;
}
export const WorkStatsContext = createContext(null);

// Yo'nalish ko'rinishi uchun ma'lumotlar:
//   orders — shu yo'nalish buyurtmalari
//   txList — shu yo'nalish + umumiy rasxodlar (to'liq summa bilan; ro'yxatlar uchun)
//   txStats — shu yo'nalish + umumiy rasxodlarning ULUSHI (hisob-kitob: qoldiq, foyda, hisobot)
export function scopeByLine(line, orders, tx, allOrders = orders, work = null) {
  if (!LINES.includes(line)) return { orders, txList: tx, txStats: tx };
  const lineById = new Map((allOrders || []).map((o) => [o.id, lineOfOrder(o)]));
  const income = monthIncome(allOrders);
  const ords = (orders || []).filter((o) => lineOfOrder(o) === line);
  const txList = [];
  const txStats = [];
  for (const t of tx || []) {
    const l = txLine(t, lineById);
    if (l === line) { txList.push(t); txStats.push(t); continue; }
    if (l !== COMMON) continue;
    txList.push(t);
    // Server xodimga umumiy rasxodni _lineShare bilan yuboradi (boshqa yo'nalish tushumini ko'rmagani uchun)
    const share = typeof t._lineShare === "number" ? t._lineShare : workShareOf(line, t, work) ?? shareOf(line, String(t.date || "").slice(0, 7), income);
    txStats.push({ ...t, amount: Math.round((t.amount || 0) * share), _share: share, _fullAmount: t.amount });
  }
  return { orders: ords, txList, txStats };
}

// ---------- Xodimning yo'nalishi (rahbar biriktiradi; xodim o'zi almashtirmaydi) ----------
// employee.line: "UVIXPRINT" | "UVONYX" | "common". Rahbar va «Umumiy» xodim — hammasi (ALL),
// qolganlar — o'z yo'nalishi (belgilanmagan eski xodim — UVIXPRINT). Server ham shunday ajratadi.
export const EMP_LINE_OPTIONS = [
  { key: "UVIXPRINT", name: "UVIXPRINT", sub: "faqat UV bosma" },
  { key: "UVONYX", name: "UVONYX", sub: "faqat oniks / shisha" },
  { key: COMMON, name: "Umumiy", sub: "ikkalasi · pechatnik, dizayner" },
];
export function lineOfUser(user) {
  if (!user) return ALL;
  if (user.role === "admin" || user.line === COMMON) return ALL;
  return user.line === "UVONYX" ? "UVONYX" : "UVIXPRINT";
}
export const empLineLabel = (e) => (e?.role === "admin" ? "Ikkalasi (rahbar)" : e?.line === COMMON ? "Umumiy" : e?.line === "UVONYX" ? "UVONYX" : "UVIXPRINT");
export function useLineState(user) {
  const line = lineOfUser(user);
  return useMemo(() => ({ line, isAll: line === ALL, allowed: line === ALL ? [...LINES, ALL] : [line], setLine: () => {} }), [line]);
}

export const LineContext = createContext({ line: ALL, setLine: () => {}, allowed: [...LINES, ALL], isAll: true });
export const useLine = () => useContext(LineContext);
