// lines.js — ikki yo'nalish (UVIXPRINT / UVONYX) bo'yicha server tomonda ajratish.
// Xodimning yo'nalishi — employee.line: "UVIXPRINT" | "UVONYX" | "common" (umumiy).
//   • Rahbar (admin) va «Umumiy» xodim — hammasini ko'radi (scope = null).
//   • Qolganlar — faqat o'z yo'nalishi; yo'nalish belgilanmagan eski xodim — UVIXPRINT.
// Buyurtma yo'nalishi — order.subcategory. Rasxod yo'nalishi — tx.line ("common" — umumiy);
// yo'nalishsiz eski rasxod: buyurtmaga bog'langan bo'lsa — o'sha buyurtmaniki, aks holda umumiy.
const LINES = ["UVIXPRINT", "UVONYX"];
const EMP_LINES = [...LINES, "common"];

const cleanEmpLine = (v) => (EMP_LINES.includes(v) ? v : undefined);
function scopeOf(user, employee) {
  if (!user || user.role === "admin") return null;
  const l = employee ? employee.line : user.line;
  if (l === "common") return null;
  return l === "UVONYX" ? "UVONYX" : "UVIXPRINT";
}
const lineOfOrder = (o) => (o?.subcategory === "UVONYX" ? "UVONYX" : "UVIXPRINT");
function txLine(t, orderLineById) {
  if (t?.line === "common" || LINES.includes(t?.line)) return t.line;
  if (t?.relatedOrderId && orderLineById?.has(t.relatedOrderId)) return orderLineById.get(t.relatedOrderId);
  return "common";
}
const lineMap = (orders) => new Map((Array.isArray(orders) ? orders : []).filter(Boolean).map((o) => [o.id, lineOfOrder(o)]));

// Oy bo'yicha tushum ulushi: { "2026-10": 0.43 } (tushum bo'lmasa — 0.5)
function sharesFor(line, orders) {
  const m = {};
  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o || o.deletedAt) continue;
    const l = lineOfOrder(o);
    for (const p of o.payments || []) {
      if (!p || p.deletedAt || !p.date) continue;
      const k = String(p.date).slice(0, 7);
      (m[k] ||= { UVIXPRINT: 0, UVONYX: 0 })[l] += Number(p.amount) || 0;
    }
  }
  const out = {};
  for (const [k, r] of Object.entries(m)) { const t = r.UVIXPRINT + r.UVONYX; out[k] = t > 0 ? r[line] / t : 0.5; }
  return out;
}

// Xodimga ko'rinadigan yozuvmi
function visible(key, item, scope, orderLineById) {
  if (!scope || !item) return true;
  if (key === "uvix:orders") return lineOfOrder(item) === scope;
  if (key === "uvix:transactions") { const l = txLine(item, orderLineById); return l === scope || l === "common"; }
  return true;
}
// Xodim o'zgartira oladigan yozuvmi (umumiy rasxod — faqat rahbar)
function editable(key, item, scope, orderLineById) {
  if (!scope || !item) return true;
  if (key === "uvix:orders") return lineOfOrder(item) === scope;
  if (key === "uvix:transactions") return txLine(item, orderLineById) === scope;
  return true;
}
const SCOPED_KEYS = new Set(["uvix:orders", "uvix:transactions"]);

// Umumiy xodim oyligi: shu oyda bajargan ishlari nisbatida (ish bo'lmasa — null, ya'ni tushum ulushi)
function workShare(line, t, work) {
  if (!t?.employeeId || !work) return null;
  const r = work[String(t.date || "").slice(0, 7)]?.[t.employeeId];
  const tot = r ? (r.UVIXPRINT || 0) + (r.UVONYX || 0) : 0;
  return tot > 0 ? (r[line] || 0) / tot : null;
}
// GET uchun: o'z yo'nalishi + umumiy rasxodlar (umumiy rasxodga _lineShare — shu oydagi ulush)
function filterForClient(key, list, scope, allOrders, work) {
  if (!scope || !SCOPED_KEYS.has(key) || !Array.isArray(list)) return list;
  const lm = lineMap(allOrders);
  const out = list.filter((x) => visible(key, x, scope, lm));
  if (key !== "uvix:transactions") return out;
  const sh = sharesFor(scope, allOrders);
  return out.map((t) => {
    if (txLine(t, lm) !== "common") return t;
    const w = workShare(scope, t, work);
    return { ...t, _lineShare: w ?? sh[String(t.date || "").slice(0, 7)] ?? 0.5 };
  });
}

// Yozish uchun: yangi/o'zgargan yozuv shu xodimga tegishli bo'lishi kerak.
// Yangi rasxod yo'nalishsiz yoki «umumiy» kelsa — xodimning yo'nalishiga yoziladi.
function prepareUpsert(key, item, oldItem, scope, orderLineById) {
  if (!scope || !SCOPED_KEYS.has(key)) return item;
  if (oldItem && !editable(key, oldItem, scope, orderLineById)) return null;
  if (key === "uvix:orders") return { ...item, subcategory: scope };
  const { _lineShare, ...t } = item;
  if (t.line !== scope) t.line = scope;
  if (t.relatedOrderId && orderLineById.has(t.relatedOrderId) && orderLineById.get(t.relatedOrderId) !== scope) delete t.relatedOrderId;
  return t;
}

// PUT (butun ro'yxat): xodim yubormagan, unga ko'rinmaydigan yozuvlar saqlanib qoladi
function mergeScopedPut(key, incoming, oldList, scope, allOrders) {
  if (!scope || !SCOPED_KEYS.has(key) || !Array.isArray(incoming) || !Array.isArray(oldList)) return incoming;
  const lm = lineMap(allOrders);
  const oldById = new Map(oldList.filter(Boolean).map((x) => [String(x.id), x]));
  const seen = new Set();
  const mine = [];
  for (const it of incoming) {
    if (!it || it.id == null) continue;
    const id = String(it.id);
    seen.add(id);
    const old = oldById.get(id);
    const p = prepareUpsert(key, it, old, scope, lm);
    mine.push(p || old);
  }
  // Xodimga ko'rinmagan (yoki tahrir qila olmaydigan va yubormagan) yozuvlar — joyida qoladi
  const kept = oldList.filter((x) => x && !seen.has(String(x.id)) && !editable(key, x, scope, lm));
  return [...mine.filter(Boolean), ...kept];
}

module.exports = { workShare, LINES, EMP_LINES, cleanEmpLine, scopeOf, lineOfOrder, txLine, lineMap, sharesFor, visible, editable, filterForClient, prepareUpsert, mergeScopedPut, SCOPED_KEYS };
