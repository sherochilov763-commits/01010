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
// O'lcham birligi: mm (standart) / sm / m. Ichkarida doim metrda saqlanadi.
export const DIM_UNITS = [["mm", "mm"], ["sm", "sm"], ["m", "m"]];
export const DIM_DIV = { mm: 1000, sm: 100, m: 1 };
export function fromMeters(v, du) {
  if (!v) return "";
  if (du === "mm") return String(Math.round(v * 1000));
  if (du === "sm") return String(Math.round(v * 1000) / 10).replace(".", ",");
  return dec(v);
}
export function sizeText(it) {
  if (!(it.w && it.h)) return "";
  const du = DIM_DIV[it.du] ? it.du : "m";
  return `${fromMeters(it.w, du)}×${fromMeters(it.h, du)} ${du}`;
}
// Pozitsiya turlari: m2 — o'lcham bo'yicha, pcs — dona × narx, lump — umumiy (erkin) summa
export const ITEM_KINDS = [["m2", "m²", "m² bo'yicha (o'lcham × narx)"], ["pcs", "Dona", "Dona × narx"], ["lump", "Umumiy", "Umumiy (erkin) narx — o'lchamsiz"]];
export function computeItem(it) {
  const unit = it.unit === "lump" ? "lump" : it.unit === "pcs" ? "pcs" : "m2";
  const w = unit === "lump" ? 0 : toNum(it.w), h = unit === "lump" ? 0 : toNum(it.h);
  const qty = unit === "lump" ? 1 : Math.max(1, Math.round(toNum(it.qty) || 1));
  const isUsd = it.cur === "usd";
  const priceUsd = isUsd ? Math.max(0, round2(toNum(it.priceUsd))) : 0;
  const rate = isUsd ? Math.max(0, round2(toNum(it.rate))) : 0;
  const price = isUsd ? Math.round(priceUsd * rate) : Math.max(0, Math.round(toNum(it.price)));
  const minArea = Math.max(0, toNum(it.minArea));
  const rawArea = w > 0 && h > 0 ? round2(w * h * qty) : 0;
  const area = unit === "m2" ? Math.max(rawArea, rawArea > 0 ? minArea : 0) : rawArea;
  const units = unit === "m2" ? area : unit === "lump" ? 1 : qty;
  // Server bilan bir xil: dollar narxida summa priceUsd × kurs dan (yaxlitlangan so'm narxidan emas)
  const calcTotal = isUsd ? Math.round(units * priceUsd * rate) : Math.round(units * price);
  // Summa qo'lda o'zgartirilgan bo'lsa (yaxlitlash/chegirma)
  const manual = !!it.manualTotal && unit !== "lump" && toNum(it.manualValue ?? it.total) > 0;
  const total = manual ? Math.round(toNum(it.manualValue ?? it.total)) : calcTotal;
  const extra = isUsd ? { cur: "usd", priceUsd, rate, totalUsd: manual && rate ? round2(total / rate) : round2(units * priceUsd) } : { cur: "uzs" };
  return { ...it, ...extra, unit, w, h, qty, price, minArea, rawArea, area, total, calcTotal, manualTotal: manual, minApplied: unit === "m2" && rawArea > 0 && minArea > rawArea };
}
// Dollar summa: 104,96 $
export const usdText = (n) => `${rateText(n)} $`;
// Kurs: 12 845,32
export function rateText(n) { const [a, b] = String(round2(n)).split("."); return a.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (b ? "," + b : ""); }
export function describeItem(it) {
  if (it.unit === "lump") return [it.title && it.material ? it.material : "", "umumiy narx", it.cur === "usd" ? usdText(it.priceUsd) : ""].filter(Boolean).join(" · ");
  const size = sizeText(it);
  const usd = it.cur === "usd" ? `${usdText(it.priceUsd)}/${it.unit === "pcs" ? "dona" : "m²"}` : "";
  const each = it.unit === "pcs" && it.cur !== "usd" ? `${fmt(it.price)}/dona` : "";
  return [it.material, size, it.qty > 1 ? `${it.qty} dona` : "", each, it.area ? `${dec(it.area)} m²` : "", usd, it.manualTotal ? "summa qo'lda" : ""].filter(Boolean).join(" · ");
}
export function formulaOf(it) {
  const pr = it.cur === "usd" ? usdText(it.priceUsd) : fmt(it.price);
  if (it.unit === "lump") return it.cur === "usd" ? `${pr} × ${rateText(it.rate)}` : "Umumiy narx";
  if (it.unit === "pcs") return `${it.qty} dona × ${pr}${it.cur === "usd" ? ` = ${usdText(it.totalUsd)}` : ""}`;
  const one = round2(it.w * it.h);
  const sz = sizeText(it);
  const base = it.qty > 1 ? `${sz} = ${dec(one)} m² × ${it.qty} = ${dec(it.rawArea)} m²` : `${sz} = ${dec(it.rawArea)} m²`;
  return `${base}${it.minApplied ? ` → min ${dec(it.minArea)} m²` : ""} × ${pr}${it.cur === "usd" ? ` = ${usdText(it.totalUsd)}` : ""}`;
}
// Mijozga yuborish uchun matn (ixtiyoriy)
export function quoteText(items, { no, advancePct } = {}) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const rows = items.map((i, k) => `${k + 1}. ${i.title || i.material}${i.title && i.material && i.unit !== "lump" ? ` (${i.material})` : ""}${i.w && i.h ? `, ${sizeText(i)}` : ""}${i.qty > 1 ? ` × ${i.qty} dona` : ""} — ${money(i.total)}`);
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
