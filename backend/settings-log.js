// settings-log.js — Sozlamalar o'zgarishlari jurnali: kim, qachon, nimani (eski → yangi).
// Pulga va ishga ta'sir qiladigan sozlamalar: narxlar, avans, kurs, davomat qoidalari, Telegram, zaxira, vaqtinchalik PIN.
// Saqlanadi: uvix:settingsLog — [{ id, at, who, section, text }] (oxirgi 1000 ta), faqat admin o'qiydi.
const KEY = "uvix:settingsLog";
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const money = (n) => `${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
const show = (v) => (v === true ? "yoqilgan" : v === false ? "o'chirilgan" : v === undefined || v === null || v === "" ? "—" : typeof v === "object" ? "…" : String(v));

const SETTINGS_LABELS = {
  usdRate: ["Savdo", "Dollar kursi (qo'lda)", (v) => `${money(v)} so'm`],
  usdRateAuto: ["Savdo", "Dollar kursi manbai", (v) => (v === false ? "qo'lda" : "Markaziy bank")],
  backupTime: ["Ma'lumotlar", "Kunlik zaxira vaqti"],
  telegramBotToken: ["Integratsiya", "Telegram bot tokeni", null, true],
  telegramChatId: ["Integratsiya", "Xodimlar guruhi Chat ID"],
  tgRoutes: ["Integratsiya", "Telegram xabar yo'nalishlari", null, true],
  tgOnboardOffer: ["Integratsiya", "Birinchi kirishda Telegram'ni ulash taklifi", (v) => (v === false ? "o'chirilgan" : "yoqilgan")],
  tgOnboardRequired: ["Integratsiya", "Telegram'ni ulash majburiy", (v) => (v ? "yoqilgan" : "o'chirilgan")],
};
const ATT_LABELS = {
  enabled: "Davomat", grace: "Imtiyoz vaqti (daq)", dailyAt: "Kunlik hisobot vaqti", photo: "«Keldim»da selfi", photoDays: "Selfi saqlash (kun)",
  autoOut: "Avtomatik «Ketdim»", outAnywhere: "«Ketdim» sexdan tashqarida", faceIdIn: "«Keldim»da Face ID", reportChatId: "Hisobot chat ID",
};

function createSettingsLog({ getStmt, upsertStmt, now = () => new Date() }) {
  const read = () => { try { const r = getStmt.get(KEY); const v = r ? JSON.parse(r.value) : []; return Array.isArray(v) ? v : []; } catch { return []; } };
  function add(who, section, texts) {
    const list = (Array.isArray(texts) ? texts : [texts]).filter(Boolean);
    if (!list.length) return;
    const at = now().toISOString();
    const cur = read();
    list.forEach((text) => cur.unshift({ id: rid(), at, who: who || "—", section, text }));
    upsertStmt.run(KEY, JSON.stringify(cur.slice(0, 1000)));
  }
  // uvix:settings — faqat ma'lum maydonlar (shovqinli/ko'rinish maydonlari yozilmaydi)
  function settingsChanged(who, prev = {}, next = {}) {
    for (const [k, [section, label, fmt, secret]] of Object.entries(SETTINGS_LABELS)) {
      const a = prev?.[k], b = next?.[k];
      if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
      const f = fmt || show;
      if (!secret && f(a) === f(b)) continue; // masalan: yo'q → standart (yoqilgan) — o'zgarish emas
      add(who, section, secret ? `${label}: ${b ? (a ? "o'zgartirildi" : "o'rnatildi") : "o'chirildi"}` : `${label}: ${f(a)} → ${f(b)}`);
    }
  }
  function salesChanged(who, prev = {}, next = {}) {
    const out = [];
    if ((prev.advancePct ?? null) !== (next.advancePct ?? null)) out.push(`Avans: ${show(prev.advancePct)}% → ${show(next.advancePct)}%`);
    const unit = (p) => `${p.cur === "usd" ? `${String(p.price).replace(".", ",")} $` : `${money(p.price)} so'm`}/${p.unit === "pcs" ? "dona" : "m²"}`;
    const pm = new Map((prev.prices || []).map((p) => [p.id, p]));
    const nm = new Map((next.prices || []).map((p) => [p.id, p]));
    for (const [id, p] of nm) {
      const o = pm.get(id);
      if (!o) { out.push(`Narx qo'shildi: ${p.material} — ${unit(p)}`); continue; }
      if (o.price !== p.price || o.cur !== p.cur || o.unit !== p.unit) out.push(`${p.material} narxi: ${unit(o)} → ${unit(p)}`);
      if ((o.minArea || 0) !== (p.minArea || 0)) out.push(`${p.material} — minimal maydon: ${o.minArea || 0} → ${p.minArea || 0} m²`);
      if (o.material !== p.material) out.push(`Material nomi: ${o.material} → ${p.material}`);
    }
    for (const [id, o] of pm) if (!nm.has(id)) out.push(`Narx o'chirildi: ${o.material}`);
    add(who, "Savdo", out);
  }
  function attendanceChanged(who, prev = {}, next = {}) {
    const out = [];
    for (const [k, label] of Object.entries(ATT_LABELS)) if (JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null)) out.push(`${label}: ${show(prev[k])} → ${show(next[k])}`);
    const ps = prev.schedule || {}, ns = next.schedule || {};
    if (ps.start !== ns.start || ps.end !== ns.end) out.push(`Ish vaqti: ${ps.start || "—"}–${ps.end || "—"} → ${ns.start}–${ns.end}`);
    if (JSON.stringify(ps.days || []) !== JSON.stringify(ns.days || [])) out.push("Ish kunlari o'zgartirildi");
    if (JSON.stringify(prev.office || null) !== JSON.stringify(next.office || null)) out.push(next.office ? `Sex joylashuvi belgilandi (radius ${next.office.radius} m)` : "Sex joylashuvi o'chirildi");
    if (JSON.stringify(prev.personal || {}) !== JSON.stringify(next.personal || {})) out.push("Xodimlarga Telegram eslatmalari o'zgartirildi");
    if (JSON.stringify(prev.overrides || {}) !== JSON.stringify(next.overrides || {})) out.push("Xodimlarning alohida jadvali o'zgartirildi");
    add(who, "Davomat", out);
  }
  return { add, read, settingsChanged, salesChanged, attendanceChanged };
}
module.exports = { createSettingsLog };
