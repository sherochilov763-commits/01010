// quoteCalc.js — Smeta / Buyurtma hisobi (138–140-eskizlar). Yagona qoida: summa doim formula bilan.
// AYNAN SHU MANTIQ serverda ham bor: backend/quote-calc.js (tests/unit/quote-calc.test.mjs ikkalasini solishtiradi — farq bo'lsa test yiqiladi).
//
// Pozitsiya (item):
//   kind   — material | pechat | ish | montaj | dizayn
//   name   — nomi (ixtiyoriy, bo'sh bo'lsa tur nomi)
//   calc   — m2 (maydon × narx) | pcs (dona × narx) | lump (kelishilgan summa)
//   parts  — m2 uchun detallar: [{ w, h, n }] — mm, butun son; maydon = Σ w×h×n ÷ 1 000 000, 0,01 m² gacha yaxlitlanadi
//   areaFrom — m2 uchun: boshqa m2 qatorining id'si — maydon o'sha qatordan olinadi (masalan pechat ← material)
//   qty    — pcs uchun dona soni (butun)
//   cur    — uzs | usd ; price — 1 m² / 1 dona / umumiy narx (so'm — butun, $ — 0,01 gacha)
// Hisob:
//   units  = m2 → area · pcs → qty · lump → 1
//   so'm:  total = round(units × price)
//   $:     totalUsd = round2(units × price); total = totalUsd × kurs, 1 000 so'mgacha yaxlitlanadi
//   jami   = Σ total
const KINDS = ["material", "pechat", "ish", "montaj", "dizayn"];
const KIND_LABEL = { material: "Material", pechat: "Pechat", ish: "Ish", montaj: "Montaj", dizayn: "Dizayn" };
const CALCS = ["m2", "pcs", "lump"];
const LIMITS = { items: 40, parts: 60, mm: 100000, n: 100000, qty: 1000000, uzs: 1e11, usd: 1e7, rateMin: 1000, rateMax: 1e6 };

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round1000 = (x) => Math.round(x / 1000) * 1000;
const toNum = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[\s ]/g, "").replace(",", ".");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const int = (v) => { const n = toNum(v); return Number.isFinite(n) ? Math.round(n) : NaN; };

function partArea(p) { return (p.w * p.h * p.n) / 1e6; }
function ownArea(it) { return round2((it.parts || []).reduce((s, p) => s + partArea(p), 0)); }

// Tozalash: noto'g'ri maydonlar xato bilan qaytadi — { item, error }
function cleanItem(raw, idx) {
  const label = `${idx + 1}-qator`;
  if (!raw || typeof raw !== "object") return { error: `${label}: noto'g'ri` };
  const kind = KINDS.includes(raw.kind) ? raw.kind : "material";
  const calc = CALCS.includes(raw.calc) ? raw.calc : "lump";
  const cur = raw.cur === "usd" ? "usd" : "uzs";
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) : "";
  const id = typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : `i${idx + 1}`;
  const who = `${label} (${name || KIND_LABEL[kind]})`;
  const item = { id, kind, name, calc, cur };
  if (calc === "m2") {
    if (typeof raw.areaFrom === "string" && raw.areaFrom) item.areaFrom = raw.areaFrom.slice(0, 40);
    else {
      const parts = Array.isArray(raw.parts) ? raw.parts : [];
      if (!parts.length) return { error: `${who}: o'lchamlarni kiriting` };
      if (parts.length > LIMITS.parts) return { error: `${who}: detallar juda ko'p (${LIMITS.parts} tagacha)` };
      item.parts = [];
      for (const p of parts) {
        const w = int(p?.w), h = int(p?.h), n = p?.n === undefined || p?.n === "" ? 1 : int(p?.n);
        if (!(w >= 1 && w <= LIMITS.mm && h >= 1 && h <= LIMITS.mm)) return { error: `${who}: eni va bo'yini mm da kiriting` };
        if (!(n >= 1 && n <= LIMITS.n)) return { error: `${who}: detal soni noto'g'ri` };
        item.parts.push({ w, h, n });
      }
    }
  }
  if (calc === "pcs") {
    const q = int(raw.qty);
    if (!(q >= 1 && q <= LIMITS.qty)) return { error: `${who}: dona sonini kiriting` };
    item.qty = q;
  }
  const pr = toNum(raw.price);
  if (!(pr >= 0)) return { error: `${who}: narxni kiriting` };
  if (cur === "usd") { if (pr > LIMITS.usd) return { error: `${who}: narx juda katta` }; item.price = round2(pr); }
  else { if (pr > LIMITS.uzs) return { error: `${who}: narx juda katta` }; item.price = Math.round(pr); }
  if (typeof raw.note === "string" && raw.note.trim()) item.note = raw.note.trim().slice(0, 200);
  return { item };
}

// Smeta hisobi: { items (hisoblangan), total, totalUsd, usd (bormi), area: { pechat, material }, error }
function computeQuote(rawItems, rateIn) {
  if (!Array.isArray(rawItems) || !rawItems.length) return { error: "Kamida bitta pozitsiya qo'shing" };
  if (rawItems.length > LIMITS.items) return { error: `Pozitsiyalar juda ko'p (${LIMITS.items} tagacha)` };
  const items = [];
  for (let i = 0; i < rawItems.length; i++) {
    const r = cleanItem(rawItems[i], i);
    if (r.error) return { error: r.error };
    items.push(r.item);
  }
  const ids = new Set();
  for (const it of items) { if (ids.has(it.id)) return { error: "Pozitsiya id takrorlangan" }; ids.add(it.id); }
  const usd = items.some((it) => it.cur === "usd");
  const rate = usd ? round2(toNum(rateIn)) : 0;
  if (usd && !(rate >= LIMITS.rateMin && rate <= LIMITS.rateMax)) return { error: "Dollar kursini kiriting" };
  // Maydon: avval o'z detallari bor qatorlar, keyin «… qatordan» olinganlar (zanjir yo'q — faqat o'z detalli qatordan)
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const it of items) if (it.calc === "m2" && it.parts) it.area = ownArea(it);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.calc !== "m2" || it.parts) continue;
    const src = byId.get(it.areaFrom);
    if (!src || src === it || src.calc !== "m2" || !src.parts) return { error: `${i + 1}-qator: maydon olinadigan qator topilmadi` };
    it.area = src.area;
  }
  let total = 0, totalUsd = 0;
  const area = { pechat: 0, material: 0 };
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const units = it.calc === "m2" ? it.area : it.calc === "pcs" ? it.qty : 1;
    if (it.cur === "usd") { it.totalUsd = round2(units * it.price); it.total = round1000(it.totalUsd * rate); totalUsd = round2(totalUsd + it.totalUsd); }
    else it.total = Math.round(units * it.price);
    if (!(it.total > 0)) return { error: `${i + 1}-qator (${it.name || KIND_LABEL[it.kind]}): summa 0 bo'lmasligi kerak` };
    total += it.total;
    if (it.calc === "m2" && (it.kind === "pechat" || it.kind === "material")) area[it.kind] = round2(area[it.kind] + it.area);
  }
  return { items, total, totalUsd, usd, rate, area };
}

// Qisqa tavsif (buyurtma izohi, Telegram): «Akril 3 mm — 3,26 m² × 14 $ = 586 000»
const fmtN = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fmtD = (n) => { const s = round2(n).toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); return s.replace(".", ","); };
function describeItem(it) {
  const nm = it.name || KIND_LABEL[it.kind];
  const pr = it.cur === "usd" ? `${fmtD(it.price)} $` : fmtN(it.price);
  const q = it.calc === "m2" ? `${fmtD(it.area)} m² × ${pr}` : it.calc === "pcs" ? `${it.qty} dona × ${pr}` : "";
  return `${KIND_LABEL[it.kind]}: ${nm}${q ? ` — ${q}` : ""} = ${fmtN(it.total)}`;
}

export { KINDS, KIND_LABEL, CALCS, LIMITS, round2, round1000, computeQuote, cleanItem, describeItem };
