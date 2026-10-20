// kv-validate.js — /api/kv ga yoziladigan qiymatni saqlashdan OLDIN tekshirish.
//
// Avval noto'g'ri qiymat (masalan oddiy so'z yoki buzilgan JSON) tekshiruvlarni chetlab o'tib,
// to'g'ridan-to'g'ri bazaga yozilardi: operator (yoki frontenddagi bitta xato) butun buyurtmalar,
// lidlar yoki mijozlar ro'yxatini bitta so'z bilan almashtirib yuborishi mumkin edi.
// Endi: qiymat har doim haqiqiy JSON bo'lishi shart, ro'yxat kalitlari — massiv, sozlama kalitlari — obyekt.

const ARRAY_KEYS = new Set([
  "uvix:orders", "uvix:transactions", "uvix:leads", "uvix:customers",
  "uvix:audit", "uvix:employees", "uvix:transfers",
]);
const OBJECT_KEYS = new Set(["uvix:settings", "uvix:categories", "uvix:appearance"]);

/** { ok: true, parsed } yoki { ok: false, error, message } */
function validateKvValue(key, value) {
  if (typeof value !== "string") return { ok: false, error: "value_must_be_string", message: "Qiymat matn (JSON) bo'lishi kerak" };
  let parsed;
  try { parsed = JSON.parse(value); } catch {
    return { ok: false, error: "invalid_json", message: "Ma'lumot buzilgan (JSON emas) — saqlanmadi" };
  }
  if (ARRAY_KEYS.has(key)) {
    if (!Array.isArray(parsed)) return { ok: false, error: "must_be_array", message: "Bu bo'lim ro'yxat bo'lishi kerak — saqlanmadi" };
  }
  if (OBJECT_KEYS.has(key) && (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))) {
    return { ok: false, error: "must_be_object", message: "Bu sozlama obyekt bo'lishi kerak — saqlanmadi" };
  }
  return { ok: true, parsed };
}

module.exports = { validateKvValue, ARRAY_KEYS, OBJECT_KEYS };
