// quoteLegacy.js — eski smeta pozitsiyalarini (2026-10 gacha: unit m2/pcs/lump, o'lcham metrda) yangi
// Smeta / Buyurtma qatorlariga (quoteCalc.js) o'girish. Summa o'zgarmasligi kafolatlanadi: minimal maydon yoki
// qo'lda o'zgartirilgan summa bo'lsa — qator «kelishilgan summa» bo'lib o'tadi.
const rid = () => Math.random().toString(36).slice(2, 10);
const mm = (m) => Math.round((Number(m) || 0) * 1000);

export function legacyItemToV2(it) {
  const name = [it.title, it.material].filter(Boolean).join(" — ") || it.title || it.material || "";
  const isUsd = it.cur === "usd";
  const lump = { id: it.id || rid(), kind: "material", name, calc: "lump", cur: "uzs", price: String(Math.round(it.total || 0)) };
  if (it.unit === "lump" || it.manualTotal) return isUsd && !it.manualTotal ? { ...lump, cur: "usd", price: String(it.priceUsd || 0) } : lump;
  if (it.unit === "m2") {
    if (!(it.w > 0 && it.h > 0) || (it.area && it.rawArea && it.area !== it.rawArea)) return lump;
    return { id: it.id || rid(), kind: "material", name, calc: "m2", cur: isUsd ? "usd" : "uzs", price: String(isUsd ? it.priceUsd : it.price), parts: [{ w: String(mm(it.w)), h: String(mm(it.h)), n: String(it.qty || 1) }] };
  }
  return { id: it.id || rid(), kind: "material", name, calc: "pcs", cur: isUsd ? "usd" : "uzs", price: String(isUsd ? it.priceUsd : it.price), qty: String(it.qty || 1) };
}

// Smeta (lead.quote) → qatorlar va kurs. v2 bo'lsa — o'zi (qatorlar qatorga o'xshash ko'rinishda).
export function quoteToRows(q) {
  if (!q || !Array.isArray(q.items)) return { rows: [], rate: 0 };
  if (q.v === 2) {
    return {
      rate: q.rate || 0,
      rows: q.items.map((it) => ({
        id: it.id, kind: it.kind, name: it.name || "", calc: it.calc, cur: it.cur, price: String(it.price ?? ""),
        ...(it.calc === "pcs" ? { qty: String(it.qty) } : {}),
        ...(it.calc === "m2" ? (it.areaFrom ? { areaFrom: it.areaFrom } : { parts: (it.parts || []).map((p) => ({ w: String(p.w), h: String(p.h), n: String(p.n) })) }) : {}),
      })),
    };
  }
  const usd = q.items.find((it) => it.cur === "usd" && it.rate > 0);
  return { rows: q.items.map(legacyItemToV2), rate: usd ? usd.rate : 0 };
}

// Ovozli yordamchi: { title, material, unit, w, h (m), qty, price, total } → qatorlar
export function voiceItemsToRows(items) {
  return (items || []).map((it) => {
    const name = [it.title, it.material].filter(Boolean).join(" — ");
    const unit = it.unit === "m2" || it.unit === "pcs" ? it.unit : "lump";
    const qty = Math.max(1, Math.round(it.qty || 1));
    if (!it.price && it.total) return { id: rid(), kind: "material", name, calc: "lump", cur: "uzs", price: String(Math.round(it.total)) };
    if (!it.price) return null;
    if (unit === "m2" && it.w > 0 && it.h > 0) return { id: rid(), kind: "material", name, calc: "m2", cur: "uzs", price: String(Math.round(it.price)), parts: [{ w: String(mm(it.w)), h: String(mm(it.h)), n: String(qty) }] };
    if (unit === "pcs") return { id: rid(), kind: "material", name, calc: "pcs", cur: "uzs", price: String(Math.round(it.price)), qty: String(qty) };
    return { id: rid(), kind: "material", name, calc: "lump", cur: "uzs", price: String(Math.round(it.price)) };
  }).filter(Boolean);
}
