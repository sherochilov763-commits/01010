// paintStore.js — bo'yoqlar ro'yxati keshi (Rasxod formasida Kraska kirimi uchun)
import { fetchPaint } from "../storage.js";

let cache = null;
let pending = null;
export function setPaintCache(state) { cache = state; }
export function loadPaintItems(force = false) {
  if (cache && !force) return Promise.resolve(cache.items);
  if (!pending) pending = fetchPaint().then((s) => { cache = s; return s.items; }).finally(() => { pending = null; });
  return pending;
}
// Subkategoriyadan bo'yoqni taxmin qilish: "Primer" → primer, "Lak" → lak, "Tozalash vositalari" → clean
export function guessPaintItem(subcategory, items) {
  const s = String(subcategory || "").toLowerCase();
  const act = (items || []).filter((i) => i.active);
  if (s.includes("primer")) return act.find((i) => /primer/i.test(i.name))?.id || "";
  if (s.includes("lak")) return act.find((i) => /^lak/i.test(i.name))?.id || "";
  if (s.includes("tozala")) return act.find((i) => /tozala/i.test(i.name))?.id || "";
  if (s.includes("oq") || s.includes("white")) return act.find((i) => /white|oq/i.test(i.name))?.id || "";
  return "";
}
