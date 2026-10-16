// lines.js — ikki yo'nalish (UVIXPRINT / UVONYX): ish maydoni, ranglar, rasxodni bo'lish.
// Buyurtma yo'nalishi — order.subcategory (avvaldan bor). Rasxod yo'nalishi — tx.line:
//   "UVIXPRINT" | "UVONYX" | "common" (umumiy). Yo'nalishsiz eski rasxod: buyurtmaga bog'langan bo'lsa — o'sha
//   buyurtmaning yo'nalishi, aks holda «Umumiy».
// «Umumiy» rasxod yo'nalishlarga shu oydagi tushum (to'lovlar) ulushiga qarab bo'linadi; tushum bo'lmasa — teng.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const LINES = ["UVIXPRINT", "UVONYX"];
export const ALL = "all";
export const COMMON = "common";
export const LINE_META = {
  UVIXPRINT: { key: "UVIXPRINT", name: "UVIXPRINT", short: "UV", prefix: "UV", sub: "UV bosma", color: "#1F5FD6", colorDark: "#6E9BF0" },
  UVONYX: { key: "UVONYX", name: "UVONYX", short: "ON", prefix: "ON", sub: "Oniks / shisha", color: "#0E7C6B", colorDark: "#3FB8A3" },
};
export const lineColor = (line, dark) => (LINE_META[line] ? (dark ? LINE_META[line].colorDark : LINE_META[line].color) : dark ? "#A1A1AA" : "#52525B");
export const lineOfOrder = (o) => (o?.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT");
export const numberPrefix = (line) => (line === "UVONYX" ? "ON" : "UV");

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

// Yo'nalish ko'rinishi uchun ma'lumotlar:
//   orders — shu yo'nalish buyurtmalari
//   txList — shu yo'nalish + umumiy rasxodlar (to'liq summa bilan; ro'yxatlar uchun)
//   txStats — shu yo'nalish + umumiy rasxodlarning ULUSHI (hisob-kitob: qoldiq, foyda, hisobot)
export function scopeByLine(line, orders, tx, allOrders = orders) {
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
    const share = shareOf(line, String(t.date || "").slice(0, 7), income);
    txStats.push({ ...t, amount: Math.round((t.amount || 0) * share), _share: share, _fullAmount: t.amount });
  }
  return { orders: ords, txList, txStats };
}

// ---------- Joriy yo'nalish (har xodimga, shu qurilmada eslab qolinadi) ----------
const KEY = (id) => `uvix_line:${id || "x"}`;
export function useLineState(user) {
  const isAdmin = user?.role === "admin";
  const allowed = useMemo(() => (isAdmin ? [...LINES, ALL] : LINES), [isAdmin]);
  // Standart: rahbar — ikkalasi (avvalgidek hammasini ko'radi), boshqalar — UVIXPRINT
  const def = isAdmin ? ALL : LINES[0];
  const read = useCallback(() => { try { const v = localStorage.getItem(KEY(user?.id)); return allowed.includes(v) ? v : def; } catch { return def; } }, [user?.id, allowed, def]);
  const [line, setLineRaw] = useState(read);
  useEffect(() => { setLineRaw(read()); }, [read]);
  const setLine = useCallback((v) => {
    if (!allowed.includes(v)) return;
    setLineRaw(v);
    try { localStorage.setItem(KEY(user?.id), v); } catch { /* */ }
  }, [allowed, user?.id]);
  // Ctrl+1 / Ctrl+2 (admin: Ctrl+3 — ikkalasi)
  useEffect(() => {
    if (!user) return undefined;
    const on = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i < 0 || !allowed[i]) return;
      e.preventDefault();
      setLine(allowed[i]);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [user, allowed, setLine]);
  return { line, setLine, allowed, isAll: line === ALL };
}

export const LineContext = createContext({ line: ALL, setLine: () => {}, allowed: [...LINES, ALL], isAll: true });
export const useLine = () => useContext(LineContext);
