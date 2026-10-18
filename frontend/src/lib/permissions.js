// permissions.js (brauzer nusxasi; asli: backend/permissions.js — unit test bir xilligini tekshiradi) — rollar va huquqlar (48 ta, 5 tasi faqat rahbarda qulflangan). Server va brauzer bir xil ro'yxatdan foydalanadi
// (brauzer nusxasi: frontend/src/lib/permissions.js — unit test ikkalasi bir xilligini tekshiradi).
//
// Qiymat turlari:
//   scope — "none" | "own" | "line" | "all"  (qaysi ma'lumotlarni: hech biri / o'ziniki / o'z yo'nalishi / hammasi)
//   bool  — true | false
//   req   — "yes" | "req" | "no"            («So'rov» — tugma ishlaydi, lekin rahbar tasdiqlaydi)
//   limit — son (so'm), 0 — yo'q; -1 — cheksiz
// Andoza (DEFAULTS) — tizim hozir qanday ishlayotgani. Rahbar o'zgartirgani: uvix:roles = { [rol]: { [kalit]: qiymat } }.
// Xodimga istisno: employee.permOver = { [kalit]: qiymat }. Eski employee.perm (kassa/foyda/chegara) ham hisobga olinadi.
// Rahbar (admin) — hamma narsa, o'zgarmaydi.
const ROLES = ["admin", "manager", "operator", "designer", "printer", "installer"];
const GROUPS = [["sales", "Savdo"], ["finance", "Moliya"], ["production", "Ishlab chiqarish"], ["system", "Tizim"]];
const N = "none", O = "own", L = "line", A = "all";

// [kalit, guruh, nomi, izoh, tur, tanlovlar (scope uchun), andoza [admin, manager, operator, designer, printer, installer], ishchilarga tegishlimi]
const RAW = [
  ["orders.view", "sales", "Buyurtmalarni ko'rish", "qaysi buyurtmalar ro'yxatda", "scope", [N, O, L, A], [A, L, O, N, N, N]],
  ["orders.create", "sales", "Buyurtma qo'shish", "", "bool", null, [1, 1, 1, 0, 0, 0]],
  ["orders.edit", "sales", "Buyurtmani tahrirlash", "", "scope", [N, O, L, A], [A, L, O, N, N, N]],
  ["orders.delete", "sales", "Buyurtmani o'chirish", "«So'rov» — rahbar tasdiqlaydi", "req", null, ["yes", "req", "req", "no", "no", "no"]],
  ["orders.price", "sales", "Narx va chegirmani o'zgartirish", "kelishilgan summani kamaytirish", "bool", null, [1, 1, 0, 0, 0, 0]],
  ["payments.add", "sales", "To'lov qabul qilish", "", "bool", null, [1, 1, 1, 0, 0, 0]],
  ["payments.edit", "sales", "To'lovni o'zgartirish / o'chirish", "«So'rov» — rahbar tasdiqlaydi", "req", null, ["yes", "req", "req", "no", "no", "no"]],
  ["invoice", "sales", "Hisob-faktura, chek chiqarish", "", "bool", null, [1, 1, 1, 0, 0, 0]],
  ["crm.view", "sales", "CRM: lidlarni ko'rish", "", "scope", [N, L, A], [A, L, L, N, N, N]],
  ["crm.edit", "sales", "CRM: bosqich, smeta → buyurtma", "", "bool", null, [1, 1, 1, 0, 0, 0]],
  ["customers.view", "sales", "Mijozlarni ko'rish", "", "scope", [N, O, L, A], [A, L, O, N, N, N]],
  ["customers.assign", "sales", "Mijozni boshqa menejerga berish", "", "bool", null, [1, 1, 0, 0, 0, 0]],
  ["customers.export", "sales", "Mijozlar bazasini eksport", "Excel", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["chats.view", "sales", "Chatlarni o'qish", "", "scope", [N, L, A], [A, L, L, N, N, N]],
  ["chats.reply", "sales", "Chatda javob yozish", "", "bool", null, [1, 1, 1, 0, 0, 0]],
  ["chats.templates", "sales", "Tezkor javob shablonlari", "tahrirlash", "bool", null, [1, 1, 0, 0, 0, 0]],
  ["custmsg.config", "sales", "Mijozga avto-xabar, qarz eslatmasi", "sozlash", "bool", null, [1, 0, 0, 0, 0, 0]],

  ["expense.add", "finance", "Rasxod kiritish", "", "bool", null, [1, 1, 1, 0, 0, 0]],
  ["expense.edit", "finance", "Rasxodni tahrirlash / o'chirish", "", "scope", [N, O, L, A], [A, L, O, N, N, N]],
  ["expense.big", "finance", "Yirik rasxodlar kartasi va chegarasi", "", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["kassa.view", "finance", "Kassa qoldiqlari", "", "scope", [N, L, A], [A, L, N, N, N, N]],
  ["kassa.transfer", "finance", "Kassalar orasida o'tkazma", "", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["report.view", "finance", "Foyda va zarar, Hisobot", "", "scope", [N, L, A], [A, L, N, N, N, N]],
  ["approve.limit", "finance", "So'rovlarni tasdiqlash", "shu summagacha (so'm)", "limit", null, [-1, 0, 0, 0, 0, 0]],
  ["report.export", "finance", "Hisobot eksport (Excel / PDF)", "", "bool", null, [1, 1, 0, 0, 0, 0]],
  ["ops.view", "finance", "Operatsiyalar jurnali", "kim nima qildi", "scope", [N, O, L, A], [A, L, O, N, N, N]],
  ["categories.manage", "finance", "Kategoriyalarni boshqarish", "", "bool", null, [1, 0, 0, 0, 0, 0]],

  ["jobs.view", "production", "Vazifalarni ko'rish", "", "scope", [N, O, L, A], [A, L, L, O, O, O], 1],
  ["jobs.manage", "production", "Vazifa berish va tahrirlash", "", "bool", null, [1, 1, 1, 0, 0, 0]],
  ["jobs.done", "production", "Vazifani yakunlash", "", "scope", [N, O, A], [A, A, A, O, O, O], 1],
  ["jobs.reopen", "production", "Yakunlangan vazifani qayta ochish", "", "bool", null, [1, 1, 0, 0, 0, 0]],
  ["jobs.config", "production", "Vazifalar ⚙️: ustunlar, holatlar, «Hamma uchun»", "", "bool", null, [1, 1, 0, 0, 0, 0]],
  ["jobs.map", "production", "Xarita", "", "bool", null, [1, 1, 1, 0, 0, 0]],
  ["geo.view", "production", "Xodimlar joyini ko'rish", "kuzatuv", "scope", [N, L, A], [A, L, N, N, N, N]],
  ["geo.config", "production", "Kuzatuvni yoqish / o'chirish", "", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["tasks.view", "production", "Dizayn / bosma ishlari", "buyurtma ichidagi", "scope", [N, O, L, A], [A, L, L, O, O, N], 1],
  ["paint.view", "production", "Bo'yoq ombori: ko'rish", "", "bool", null, [1, 1, 1, 0, 1, 0], 1],
  ["paint.edit", "production", "Bo'yoq: kirim, chiqim, sanoq", "", "bool", null, [1, 1, 0, 0, 1, 0], 1],
  ["att.view", "production", "Davomat: hammaning ro'yxati", "", "scope", [N, L, A], [A, L, N, N, N, N]],
  ["att.manage", "production", "Davomat: qo'lda tuzatish, sozlash", "", "bool", null, [1, 0, 0, 0, 0, 0]],

  ["staff.view", "system", "Xodimlarni ko'rish", "", "scope", [N, L, A], [A, L, N, N, N, N]],
  ["staff.manage", "system", "Xodim qo'shish, rol berish, PIN tiklash", "", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["sys.sales", "system", "Sozlamalar: Savdo", "narxlar, yo'nalishlar, rekvizitlar", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["sys.integrations", "system", "Integratsiyalar", "Telegram, bot — faqat rahbar", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["sys.backup", "system", "Zaxira va tiklash", "butun baza — faqat rahbar", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["sys.trash", "system", "Savatcha — o'chirilganlarni tiklash", "faqat rahbar", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["sys.journal", "system", "O'zgarishlar jurnali, tizim xatolari", "faqat rahbar", "bool", null, [1, 0, 0, 0, 0, 0]],
  ["sys.roles", "system", "Rollar va huquqlar", "faqat rahbar, o'zgarmaydi", "bool", null, [1, 0, 0, 0, 0, 0]],
];
// Faqat rahbar — xavfsizlik uchun hech kimga berilmaydi: bot tokeni, butun baza zaxirasi, o'chirilganlar, jurnal, huquqlar
const LOCKED = new Set(["sys.integrations", "sys.backup", "sys.trash", "sys.journal", "sys.roles"]);
const PERMS = RAW.map(([k, g, l, h, t, opts, def, workers]) => ({
  k, g, l, h, t, opts: opts || null, workers: !!workers,
  def: Object.fromEntries(ROLES.map((r, i) => [r, t === "bool" ? !!def[i] : def[i]])),
}));
const BY_KEY = new Map(PERMS.map((p) => [p.k, p]));
const SCOPE_RANK = { none: 0, own: 1, line: 2, all: 3 };

// Qiymatni turiga moslab tozalash (noto'g'ri bo'lsa — undefined)
function clean(p, v) {
  if (!p) return undefined;
  if (p.t === "bool") return typeof v === "boolean" ? v : undefined;
  if (p.t === "req") return ["yes", "req", "no"].includes(v) ? v : undefined;
  if (p.t === "scope") return (p.opts || []).includes(v) ? v : undefined;
  if (p.t === "limit") { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= -1 ? Math.min(n, 1e12) : undefined; }
  return undefined;
}
function cleanMap(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) { if (LOCKED.has(k)) continue; const c = clean(BY_KEY.get(k), v); if (c !== undefined) out[k] = c; }
  return out;
}
// Eski «Huquqlar» (employee.perm) → yangi kalitlar
function legacyOver(emp) {
  const p = emp?.perm; if (!p || typeof p !== "object") return {};
  const o = {};
  if (p.cash === false) o["kassa.view"] = "none";
  if (p.profit === false) o["report.view"] = "none";
  if (Number(p.approveLimit) > 0) o["approve.limit"] = Math.round(Number(p.approveLimit));
  return o;
}
function isWorkerRole(role) { return role === "designer" || role === "printer" || role === "installer"; }

// Xodimning amaldagi huquqlari: andoza → rol sozlamasi → shaxsiy istisno
function resolve(emp, rolesCfg = {}) {
  const role = ROLES.includes(emp?.role) ? emp.role : "operator";
  const out = {};
  for (const p of PERMS) out[p.k] = p.def[role];
  if (role === "admin") return out;
  const rc = cleanMap(rolesCfg?.[role]);
  const over = { ...legacyOver(emp), ...cleanMap(emp?.permOver) };
  for (const src of [rc, over]) for (const [k, v] of Object.entries(src)) {
    // Ishchi rollarga faqat ularga tegishli huquqlar (qolgani ishchi ilovasida yo'q)
    if (isWorkerRole(role) && !BY_KEY.get(k).workers) continue;
    out[k] = v;
  }
  return out;
}
const scopeOk = (have, need) => (SCOPE_RANK[have] || 0) >= (SCOPE_RANK[need] || 0);
// can(eff, "kassa.view") — bor-yo'qligi; can(eff, "orders.view", "all") — kamida shu daraja
function can(eff, key, need) {
  const p = BY_KEY.get(key); if (!p || !eff) return false;
  const v = eff[key];
  if (p.t === "bool") return !!v;
  if (p.t === "req") return need === "direct" ? v === "yes" : v === "yes" || v === "req";
  if (p.t === "scope") return need ? scopeOk(v, need) : v !== "none";
  if (p.t === "limit") return v === -1 || v > 0;
  return false;
}
function limitOk(eff, amount) { const v = eff?.["approve.limit"]; return v === -1 || (v > 0 && Number(amount) <= v); }
// Rol bo'yicha andozadan farqlar soni (sozlamada «2 ta farq»)
function diffCount(role, cfg) { const c = cleanMap(cfg); return Object.entries(c).filter(([k, v]) => BY_KEY.get(k)?.def[role] !== v).length; }

export { ROLES, GROUPS, PERMS, LOCKED, BY_KEY, resolve, can, limitOk, clean, cleanMap, legacyOver, diffCount, isWorkerRole };
