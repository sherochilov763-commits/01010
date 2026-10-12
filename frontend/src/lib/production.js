// production.js — buyurtma holati, smeta hisob-kitobi va to'lov taqsimoti (brauzer tomoni).
// Server (backend/production.js, backend/quotes.js) bilan bir xil qoidalar: bu yerda faqat oldindan ko'rsatish uchun,
// yakuniy hisob serverda qayta bajariladi.
import { THEME } from "../theme.js";
import { fmt, money } from "./format.js";

export const PROD_STAGES = ["new", "design", "printing", "ready", "delivered"];
export const PROD_LABEL = { new: "Navbatda", design: "Dizaynda", printing: "Pechatda", ready: "Tayyor", delivered: "Topshirildi" };
export function prodColors(stage) {
  switch (stage) {
    case "design": return { color: THEME.isDark ? "#B79CF5" : "#6D28D9", bg: THEME.isDark ? "rgba(139,92,246,.16)" : "#F1EBFC" };
    case "printing": return { color: THEME.isDark ? "#5CC7DA" : "#0E7490", bg: THEME.isDark ? "rgba(14,116,144,.2)" : "#E3F3F6" };
    case "ready": return { color: THEME.green, bg: THEME.greenBg };
    case "delivered": return { color: THEME.muted, bg: THEME.chip };
    case "new": return { color: THEME.amber || "#B45309", bg: THEME.amberBg || "#FDF3E3" };
    default: return { color: THEME.dim, bg: "transparent" };
  }
}

// Buyurtma holati: smetadan yaratilganlarda — o'zida; eski buyurtmalarda — bog'langan lid bosqichidan
export function orderStage(order, leadByOrderId) {
  if (!order) return null;
  if (order.prodStage) return order.prodStage;
  const lead = leadByOrderId?.get(order.id);
  if (!lead) return null;
  if (lead.stage === "design") return "design";
  if (lead.stage === "printing") return "printing";
  if (lead.stage === "ready") return "ready";
  if (lead.stage === "won") return "delivered";
  return null;
}
export function legacyLeadIndex(leads) {
  const m = new Map();
  (leads || []).forEach((l) => { if (l && l.orderId && !l.deletedAt && !m.has(l.orderId)) m.set(l.orderId, l); });
  return m;
}
// Holat yonidagi qisqa izoh: kim ishlayapti, qancha vaqtdan beri
export function stageHint(order, empById, nowMs = Date.now()) {
  const st = order?.prodStage;
  const ago = (iso) => {
    if (!iso) return "";
    const m = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60000));
    if (m < 60) return `${m} daq`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} soat` : `${Math.round(h / 24)} kun`;
  };
  const who = (t) => (t?.assigneeId && empById?.get(t.assigneeId)?.name?.split(" ")[0]) || "";
  if (st === "design") { const t = order.design; if (!t) return "dizayner tayinlanmagan"; return t.status === "in_progress" ? `${who(t)} · ${ago(t.startedAt)}` : `${who(t)} · navbatda`; }
  if (st === "printing") { const t = order.print; if (!t || !t.assigneeId) return "pechatchi tayinlanmagan"; return t.status === "in_progress" ? `${who(t)} · ${ago(t.startedAt)}` : `${who(t)} · navbatda`; }
  if (st === "ready") { if (!order.readyAt) return ""; const a = ago(order.readyAt); return a === "0 daq" ? "hozirgina tayyor" : `${a}dan beri kutmoqda`; }
  if (st === "new") return "vazifa berilmagan";
  return "";
}

// ---------- Smeta pozitsiyasi ----------
export const toNum = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
export const dec = (n) => String(round2(n)).replace(".", ",");
export function computeItem(it) {
  const unit = it.unit === "pcs" ? "pcs" : "m2";
  const w = toNum(it.w), h = toNum(it.h);
  const qty = Math.max(1, Math.round(toNum(it.qty) || 1));
  const price = Math.max(0, Math.round(toNum(it.price)));
  const minArea = Math.max(0, toNum(it.minArea));
  const rawArea = w > 0 && h > 0 ? round2(w * h * qty) : 0;
  const area = unit === "m2" ? Math.max(rawArea, rawArea > 0 ? minArea : 0) : rawArea;
  const total = unit === "m2" ? Math.round(area * price) : price * qty;
  return { ...it, unit, w, h, qty, price, minArea, rawArea, area, total, minApplied: unit === "m2" && rawArea > 0 && minArea > rawArea };
}
export function describeItem(it) {
  const size = it.w && it.h ? `${dec(it.w)}×${dec(it.h)} m` : "";
  return [it.material, size, it.qty > 1 ? `${it.qty} dona` : "", it.area ? `${dec(it.area)} m²` : ""].filter(Boolean).join(" · ");
}
export function formulaOf(it) {
  if (it.unit === "pcs") return `${it.qty} dona × ${fmt(it.price)}`;
  const one = round2(it.w * it.h);
  const base = it.qty > 1 ? `${dec(one)} m² × ${it.qty} = ${dec(it.rawArea)} m²` : `${dec(it.rawArea)} m²`;
  return `${base}${it.minApplied ? ` → min ${dec(it.minArea)} m²` : ""} × ${fmt(it.price)}`;
}
// Mijozga yuborish uchun matn (ixtiyoriy)
export function quoteText(items, { no, advancePct } = {}) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const rows = items.map((i, k) => `${k + 1}. ${i.title || i.material}${i.title && i.material ? ` (${i.material})` : ""}${i.w && i.h ? `, ${dec(i.w)}×${dec(i.h)} m` : ""}${i.qty > 1 ? ` × ${i.qty} dona` : ""} — ${money(i.total)}`);
  return [`Hisob-kitob${no ? ` ${no}` : ""}:`, ...rows, `Jami: ${money(total)}`, advancePct ? `Avans (${advancePct}%): ${money(Math.ceil((total * advancePct) / 100))}` : ""].filter(Boolean).join("\n");
}

// ---------- To'lov taqsimoti (server bilan bir xil) ----------
export function allocate(amount, targets, mode = "prop") {
  const amt = Math.round(Number(amount) || 0);
  const list = (targets || []).map((t) => ({ id: t.id, due: Math.max(0, Math.round(Number(t.due) || 0)) })).filter((t) => t.due > 0);
  const totalDue = list.reduce((s, t) => s + t.due, 0);
  if (amt <= 0 || amt > totalDue) return null;
  const out = {};
  if (mode === "oldest") {
    let left = amt;
    for (const t of list) { if (left <= 0) break; const x = Math.min(left, t.due); out[t.id] = x; left -= x; }
    return out;
  }
  let used = 0;
  const parts = list.map((t) => { const raw = (amt * t.due) / totalDue; const base = Math.min(t.due, Math.floor(raw)); used += base; return { t, base, frac: raw - base }; });
  let rest = amt - used;
  parts.sort((a, b) => b.frac - a.frac);
  for (const p of parts) { if (rest <= 0) break; if (p.base < p.t.due) { p.base += 1; rest -= 1; } }
  for (const p of parts) if (p.base > 0) out[p.t.id] = p.base;
  return out;
}

// Keyingi buyurtma raqamlari (oldindan ko'rsatish; yakuniy raqamni server beradi)
export function predictNumbers(allOrders, dateStr, n) {
  const prefix = `UV-${String(dateStr).replace(/-/g, "").slice(2)}-`;
  const max = (allOrders || []).reduce((m, o) => { const s = String(o?.orderNumber || ""); return s.startsWith(prefix) ? Math.max(m, parseInt(s.slice(prefix.length), 10) || 0) : m; }, 0);
  return Array.from({ length: n }, (_, i) => `${prefix}${String(max + i + 1).padStart(3, "0")}`);
}
