// QuoteBuilder.jsx — kalkulyator + smeta (bir nechta pozitsiya). Chat panelida ham, «Yangi buyurtma» oynasida ham ishlaydi.
// Rang palitrasi tashqaridan beriladi (chatda — chat ranglari, oynada — ilova mavzusi).
import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, ChevronDown, ChevronUp, Copy, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { fmt, money } from "../../lib/format.js";
import { computeItem, dec, describeItem, DIM_DIV, DIM_UNITS, formulaOf, fromMeters, ITEM_KINDS, rateText, toNum, usdText } from "../../lib/production.js";

const CUSTOM = "__custom";
const rid = () => Math.random().toString(36).slice(2, 10);
// Narx maydonlari: so'mda — butun son, dollarda — 2 xonali kasr ("32,8")
const priceFields = (p) => (p ? (p.cur === "usd" ? { cur: "usd", priceUsd: dec(p.price), price: "" } : { cur: "uzs", price: String(p.price), priceUsd: "" }) : { cur: "uzs", price: "", priceUsd: "" });
// Pozitsiya turi (m2 | pcs | lump): narxlar ro'yxati shu turdagi materiallar bilan cheklanadi
const pricesOf = (prices, kind) => (kind === "lump" ? [] : (prices || []).filter((p) => (p.unit === "pcs" ? "pcs" : "m2") === kind));
const KIND_KEY = "uvix:quoteKind";
const savedKind = () => { try { const v = localStorage.getItem(KIND_KEY); return ["m2", "pcs", "lump"].includes(v) ? v : "m2"; } catch { return "m2"; } };
const emptyDraft = (prices, kind = "m2") => { const first = pricesOf(prices, kind)[0]; return { title: "", priceId: first?.id || CUSTOM, material: "", unit: kind, w: "", h: "", qty: "1", ...priceFields(first), minArea: first?.minArea || 0, priceTouched: false, manualTotal: false, manualValue: "" }; };
// Kalkulyator yig'ilgan/ochiq holati — shu brauzerda eslab qolinadi
const OPEN_KEY = "uvix:quoteCalcOpen";
const savedOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; } };
// O'lcham birligi — standart mm, tanlov shu brauzerda eslab qolinadi
const DU_KEY = "uvix:quoteDimUnit";
const savedDu = () => { try { const v = localStorage.getItem(DU_KEY); return DIM_DIV[v] ? v : "mm"; } catch { return "mm"; } };
const fxHint = (fx) => {
  if (!fx) return "";
  if (fx.source === "cbu") { const d = fx.cbu?.date ? fx.cbu.date.slice(8, 10) + "." + fx.cbu.date.slice(5, 7) : ""; return `Markaziy bank${d ? ` · ${d}` : ""}`; }
  return "Sozlamalardagi kurs";
};

// view: undefined — kalkulyator + ro'yxat (oyna); "calc" — faqat kalkulyator (chat yon paneli, «Kalkulyator» vositasi);
// "items" — faqat smeta ro'yxati («Smeta» vositasi). Bitta nusxa ikkala vositada ishlaydi — tahrirlash holati saqlanadi.
export function QuoteBuilder({ items, onChange, prices = [], fx = null, P, advancePct = 0, titleRef, compact, view, onEdit, onAdded }) {
  const showCalc = view !== "items";
  const showItems = view !== "calc";
  const fxRate = fx?.rate > 0 ? fx.rate : 0;
  const [draft, setDraft] = useState(() => ({ ...emptyDraft(prices, savedKind()), rate: fxRate ? dec(fxRate) : "", rateTouched: false }));
  const [openSaved, setOpenState] = useState(savedOpen);
  const open = view === "calc" || openSaved;
  const setOpen = (v) => { setOpenState(v); try { localStorage.setItem(OPEN_KEY, v ? "1" : "0"); } catch { /* shart emas */ } };
  const kind = draft.unit === "lump" ? "lump" : draft.unit === "pcs" ? "pcs" : "m2";
  const kindPrices = pricesOf(prices, kind);
  const [du, setDuState] = useState(savedDu);
  const div = DIM_DIV[du] || 1000;
  function setDu(next) {
    if (next === du) return;
    const conv = (v) => { const m = toNum(v) / div; return m > 0 ? fromMeters(m, next) : v; };
    setDraft((d) => ({ ...d, w: conv(d.w), h: conv(d.h) }));
    setDuState(next);
    try { localStorage.setItem(DU_KEY, next); } catch { /* shart emas */ }
  }
  const [editingId, setEditingId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [err, setErr] = useState("");
  const pricesKey = prices.map((p) => p.id).join(",");
  // Narxlar keyin yuklansa — tanlanmagan qoralamaga birinchi materialni qo'yamiz
  useEffect(() => {
    setDraft((d) => (d.priceId === CUSTOM && !d.material && !d.price && !d.priceUsd && pricesOf(prices, d.unit).length ? { ...emptyDraft(prices, d.unit), title: d.title, w: d.w, h: d.h, qty: d.qty, rate: d.rate, rateTouched: d.rateTouched } : d));
  }, [pricesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Kurs keyin yuklansa yoki yangilansa — qo'lda o'zgartirilmagan bo'lsa, yangisini qo'yamiz
  useEffect(() => {
    if (fxRate) setDraft((d) => (d.rateTouched ? d : { ...d, rate: dec(fxRate) }));
  }, [fxRate]);

  const sel = kind === "lump" ? null : kindPrices.find((p) => p.id === draft.priceId) || null;
  const calc = computeItem({ ...draft, w: kind === "m2" ? toNum(draft.w) / div : 0, h: kind === "m2" ? toNum(draft.h) / div : 0, du, material: sel ? sel.material : draft.material, minArea: sel && kind === "m2" ? sel.minArea : 0, unit: kind });
  // Turni almashtirish: shu turdagi birinchi material tanlanadi, nom va kurs saqlanadi
  function setKind(k) {
    if (k === kind) return;
    try { localStorage.setItem(KIND_KEY, k); } catch { /* shart emas */ }
    setErr("");
    setDraft((d) => ({ ...emptyDraft(prices, k), title: d.title, qty: d.qty, rate: d.rate, rateTouched: d.rateTouched, ...(k === "lump" ? { cur: d.cur, price: "", priceUsd: "" } : {}) }));
  }
  const total = items.reduce((s, i) => s + i.total, 0);
  const totalArea = Math.round(items.reduce((s, i) => s + (i.area || 0), 0) * 100) / 100;

  const set = (patch) => { setErr(""); setDraft((d) => ({ ...d, ...patch })); };
  function pickPrice(id) {
    if (id === CUSTOM) return set({ priceId: CUSTOM, price: "", priceUsd: "", priceTouched: false });
    const p = prices.find((x) => x.id === id);
    set({ priceId: id, ...priceFields(p), minArea: p.minArea, priceTouched: false, manualTotal: false, manualValue: "" });
  }
  // So'm ⇄ $ almashtirish: kiritilgan narx kurs bo'yicha o'giriladi
  function setCur(cur) {
    if (cur === draft.cur) return;
    const r = toNum(draft.rate);
    // Qiymatga tegmasdan qaytarilsa — asl narx tiklanadi (yaxlitlash xatosi to'planmasin)
    const back = draft.swap && draft.swap.cur === cur && draft.swap.after === (cur === "usd" ? draft.price : draft.priceUsd) ? draft.swap.before : null;
    if (cur === "usd") {
      const v = toNum(draft.price);
      const priceUsd = back ?? (v > 0 && r > 0 ? dec(v / r) : "");
      set({ cur, priceUsd, priceTouched: !!sel, swap: { cur: "uzs", before: draft.price, after: priceUsd } });
    } else {
      const v = toNum(draft.priceUsd);
      const price = back ?? (v > 0 && r > 0 ? String(Math.round(v * r)) : "");
      set({ cur, price, priceTouched: !!sel, swap: { cur: "usd", before: draft.priceUsd, after: price } });
    }
  }
  const listPrice = sel ? (sel.cur === "usd" ? usdText(sel.price) : fmt(sel.price)) : "";
  const priceDiffers = sel && draft.priceTouched && (draft.cur !== (sel.cur || "uzs") || (draft.cur === "usd" ? toNum(draft.priceUsd) !== sel.price : toNum(draft.price) !== sel.price));
  function submit() {
    const material = sel ? sel.material : draft.material.trim();
    if (kind === "lump" && !draft.title.trim()) return setErr("Nomini yozing (masalan: Montaj)");
    if (kind !== "lump" && !material && !draft.title.trim()) return setErr("Nima uchun yoki materialni yozing");
    if (kind === "m2" && !(calc.w > 0 && calc.h > 0)) return setErr("Eni va bo'yini kiriting");
    if (calc.cur === "usd" && !(calc.rate >= 1000)) return setErr("Dollar kursini kiriting");
    if (!(calc.price > 0)) return setErr(kind === "lump" ? "Summani kiriting" : "Narxni kiriting");
    if (!(calc.total > 0)) return setErr("Summa 0 — o'lchamlarni tekshiring");
    const item = { id: editingId || rid(), title: draft.title.trim(), material: kind === "lump" ? draft.material.trim() : material, priceId: sel?.id || null, unit: kind,
      w: Math.round(calc.w * 1000) / 1000, h: Math.round(calc.h * 1000) / 1000, du, qty: calc.qty, price: calc.price, minArea: calc.minArea, rawArea: calc.rawArea, area: calc.area, total: calc.total,
      ...(calc.manualTotal ? { manualTotal: true, calcTotal: calc.calcTotal } : {}),
      ...(calc.cur === "usd" ? { cur: "usd", priceUsd: calc.priceUsd, rate: calc.rate, totalUsd: calc.totalUsd } : {}) };
    onChange(editingId ? items.map((i) => (i.id === editingId ? item : i)) : [...items, item]);
    onAdded?.(!!editingId);
    setEditingId(null);
    setDraft({ ...emptyDraft(prices, kind), priceId: draft.priceId, cur: draft.cur, price: kind === "lump" ? "" : draft.price, priceUsd: kind === "lump" ? "" : draft.priceUsd, minArea: draft.minArea, priceTouched: draft.priceTouched, rate: draft.rate, rateTouched: draft.rateTouched });
  }
  function edit(it) {
    const ik = it.unit === "lump" ? "lump" : it.unit === "pcs" ? "pcs" : "m2";
    const p = ik === "lump" ? null : pricesOf(prices, ik).find((x) => x.id === it.priceId) || pricesOf(prices, ik).find((x) => x.material === it.material);
    setEditingId(it.id);
    setOpen(true);
    if (it.du && it.du !== du) setDuState(it.du);
    setDraft({ title: it.title || "", priceId: p ? p.id : CUSTOM, material: p ? "" : it.material, unit: ik, w: fromMeters(it.w, it.du || du), h: fromMeters(it.h, it.du || du), qty: String(it.qty || 1), minArea: it.minArea || 0,
      manualTotal: !!it.manualTotal, manualValue: it.manualTotal ? String(it.total) : "",
      ...(it.cur === "usd"
        ? { cur: "usd", priceUsd: dec(it.priceUsd), price: "", rate: dec(it.rate), rateTouched: it.rate !== fxRate, priceTouched: p ? p.cur !== "usd" || it.priceUsd !== p.price : false }
        : { cur: "uzs", price: String(it.price), priceUsd: "", rate: draft.rate, rateTouched: draft.rateTouched, priceTouched: p ? p.cur === "usd" || it.price !== p.price : false }) });
    setMenu(null);
    onEdit?.();
    setTimeout(() => titleRef?.current?.focus(), 0);
  }

  const inp = { height: 36, minWidth: 0, width: "100%", boxSizing: "border-box", border: `1px solid ${P.border}`, borderRadius: 8, background: P.inputBg, color: P.text, padding: "0 10px", fontSize: 14, fontFamily: "inherit", outline: "none" };
  const label = (t) => <span style={{ fontSize: 11.5, color: P.muted }}>{t}</span>;
  const btn = (primary) => ({ height: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${primary ? P.primary : P.border}`, background: primary ? P.primary : P.panel, color: primary ? P.onPrimary : P.text });
  const need = Math.ceil((total * (advancePct || 0)) / 100);

  return (
    <div data-testid="quote-builder" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!showCalc ? null : !open ? (
        <button type="button" onClick={() => setOpen(true)} data-testid="calc-open"
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 12px", background: P.panel, color: P.text, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <Calculator size={15} />
          <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>Kalkulyator</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, color: P.link || P.primary }}>Ochish <ChevronDown size={15} /></span>
        </button>
      ) : (
      <div data-testid="calc-card" style={{ border: `1px solid ${P.border}`, borderRadius: 10, padding: 12 }}>
        {(view !== "calc" || editingId) && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: P.text, minWidth: 0 }} title="Kalkulyator mijozga ko'rinmaydi"><Calculator size={15} /> {editingId ? "Tahrirlash" : "Kalkulyator"}</span>
          {!editingId && view !== "calc" && <button type="button" onClick={() => setOpen(false)} data-testid="calc-close" title="Kalkulyatorni yig'ish"
            style={{ display: "inline-flex", alignItems: "center", gap: 3, border: 0, background: "none", color: P.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: "2px 0", flexShrink: 0 }}>Yashirish <ChevronUp size={15} /></button>}
        </div>}
        <div role="tablist" aria-label="Pozitsiya turi" style={{ display: "flex", background: P.hover, borderRadius: 9, padding: 3, marginBottom: 10 }}>
          {ITEM_KINDS.map(([k, l, hint]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} data-testid={`q-kind-${k}`} title={hint}
              style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", height: 30, border: 0, borderRadius: 7, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: kind === k ? P.panel : "transparent", color: kind === k ? P.text : P.muted, boxShadow: kind === k ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <label style={{ display: "grid", gap: 3 }}>{label(kind === "lump" ? "Nomi" : kind === "pcs" ? "Mahsulot / nima uchun" : "Nima uchun")}<input ref={titleRef} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={kind === "lump" ? "Masalan: Montaj, dizayn xizmati" : kind === "pcs" ? "Masalan: vizitka, stend" : "Masalan: oshxona fartugi"} style={inp} data-testid="q-title" /></label>
          {kind !== "lump" && (
            <label style={{ display: "grid", gap: 3 }}>{label(kindPrices.length ? "Material — narxlar ro'yxatidan" : "Material")}
              {kindPrices.length > 0 && (
                <select value={draft.priceId} onChange={(e) => pickPrice(e.target.value)} style={inp} data-testid="q-material">
                  {kindPrices.map((p) => <option key={p.id} value={p.id}>{p.material} — {p.cur === "usd" ? usdText(p.price) : fmt(p.price)} / {p.unit === "pcs" ? "dona" : "m²"}{p.minArea && p.unit !== "pcs" ? ` (min ${dec(p.minArea)} m²)` : ""}</option>)}
                  <option value={CUSTOM}>Boshqa (qo'lda)</option>
                </select>
              )}
            </label>
          )}
          {kind !== "lump" && (!kindPrices.length || draft.priceId === CUSTOM) && (
            <input value={draft.material} onChange={(e) => set({ material: e.target.value })} placeholder="Material nomi (ixtiyoriy)" style={inp} data-testid="q-material-custom" aria-label="Material nomi" />
          )}
        </div>
        {kind === "m2" && <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 11.5, color: P.muted }}>O'lcham</span>
          <div role="group" aria-label="O'lcham birligi" style={{ display: "inline-flex", border: `1px solid ${P.border}`, borderRadius: 7, overflow: "hidden", height: 24 }}>
            {DIM_UNITS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setDu(k)} aria-pressed={du === k} data-testid={`q-du-${k}`}
                style={{ border: 0, padding: "0 9px", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: du === k ? P.primary : P.inputBg, color: du === k ? P.onPrimary : P.muted }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", gap: 8, marginTop: 4 }}>
          <label style={{ display: "grid", gap: 3 }}>{label(`Eni, ${du}`)}<input value={draft.w} onChange={(e) => set({ w: e.target.value.replace(du === "mm" ? /\D/g : /[^\d.,]/g, "") })} inputMode={du === "mm" ? "numeric" : "decimal"} placeholder={du === "mm" ? "2000" : du === "sm" ? "200" : "2"} style={inp} data-testid="q-w" /></label>
          <label style={{ display: "grid", gap: 3 }}>{label(`Bo'yi, ${du}`)}<input value={draft.h} onChange={(e) => set({ h: e.target.value.replace(du === "mm" ? /\D/g : /[^\d.,]/g, "") })} inputMode={du === "mm" ? "numeric" : "decimal"} placeholder={du === "mm" ? "1600" : du === "sm" ? "160" : "1,6"} style={inp} data-testid="q-h" /></label>
          <label style={{ display: "grid", gap: 3 }}>{label("Dona")}<input value={draft.qty} onChange={(e) => set({ qty: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={inp} data-testid="q-qty" /></label>
        </div>
        {du === "mm" && calc.w > 0 && calc.h > 0 && calc.w < 0.05 && calc.h < 0.05 && <div data-testid="q-du-hint" style={{ fontSize: 11.5, color: P.red, marginTop: 4 }}>O'lcham juda kichik ({draft.w}×{draft.h} mm). Metrda yozgan bo'lsangiz — yuqorida «m» ni tanlang.</div>}
        </>}
        {kind === "pcs" && (
          <label style={{ display: "grid", gap: 3, marginTop: 8 }}>{label("Soni, dona")}<input value={draft.qty} onChange={(e) => set({ qty: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="1" style={inp} data-testid="q-qty" /></label>
        )}
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 9, background: P.hover, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: P.muted, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{calc.total > 0 ? (calc.manualTotal ? `Hisoblangan: ${money(calc.calcTotal)} → qo'lda` : formulaOf(calc)) : kind === "lump" ? "Summani kiriting" : kind === "pcs" ? "Soni va narxni kiriting" : "O'lcham va narxni kiriting"}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            {draft.manualTotal && kind !== "lump" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input value={draft.manualValue ? fmt(toNum(draft.manualValue)) : ""} onChange={(e) => set({ manualValue: e.target.value.replace(/\D/g, "") })} inputMode="numeric" autoFocus placeholder="summa" style={{ ...inp, height: 34, width: 150, fontSize: 16, fontWeight: 700 }} data-testid="q-manual-total" aria-label="Summa (qo'lda)" />
                <span style={{ fontSize: 13, color: P.muted }}>so'm</span>
                <button type="button" onClick={() => set({ manualTotal: false, manualValue: "" })} title="Hisoblangan summaga qaytarish" data-testid="q-manual-reset" style={{ border: 0, background: "none", color: P.link || P.primary, cursor: "pointer", display: "inline-flex", padding: 2 }}><RotateCcw size={15} /></button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <div data-testid="calc-total" style={{ fontSize: 19, fontWeight: 700, color: P.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(calc.total)}</div>
                {kind !== "lump" && calc.calcTotal > 0 && <button type="button" onClick={() => set({ manualTotal: true, manualValue: String(calc.calcTotal) })} title="Summani qo'lda o'zgartirish (yaxlitlash, chegirma)" data-testid="q-manual" style={{ border: 0, background: "none", color: P.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontFamily: "inherit", padding: 0 }}><Pencil size={12} /> o'zgartirish</button>}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: P.muted, flex: "1 1 190px", justifyContent: "flex-end", minWidth: 0 }}>
              <span style={{ whiteSpace: "nowrap" }}>{kind === "lump" ? "Summa" : kind === "pcs" ? "1 dona" : "1 m²"}:</span>
              {draft.cur === "usd"
                ? <input value={draft.priceUsd} onChange={(e) => set({ priceUsd: e.target.value.replace(/[^\d.,]/g, ""), priceTouched: !!sel })} inputMode="decimal" placeholder="$" style={{ ...inp, height: 30, flex: "0 1 104px", fontSize: 13 }} data-testid="q-price-usd" aria-label="Narx, dollar" />
                : <input value={draft.price ? fmt(toNum(draft.price)) : ""} onChange={(e) => set({ price: e.target.value.replace(/\D/g, ""), priceTouched: !!sel })} inputMode="numeric" placeholder={kind === "lump" ? "summa" : "narx"} style={{ ...inp, height: 30, flex: "0 1 104px", fontSize: 13 }} data-testid="q-price" aria-label="Narx" />}
              <div role="group" aria-label="Valyuta" style={{ display: "inline-flex", border: `1px solid ${P.border}`, borderRadius: 8, overflow: "hidden", height: 30, flexShrink: 0 }}>
                {[["uzs", "so'm"], ["usd", "$"]].map(([c, l]) => (
                  <button key={c} type="button" onClick={() => setCur(c)} aria-pressed={draft.cur === c} data-testid={`q-cur-${c}`}
                    style={{ border: 0, padding: "0 9px", minWidth: 32, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: draft.cur === c ? P.primary : P.inputBg, color: draft.cur === c ? P.onPrimary : P.muted }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          {draft.cur === "usd" && (
            <div style={{ marginTop: 6, fontSize: 12, color: P.muted }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                <span style={{ whiteSpace: "nowrap" }}>Kurs: 1 $ =</span>
                <input value={draft.rate} onChange={(e) => set({ rate: e.target.value.replace(/[^\d.,]/g, ""), rateTouched: true })} inputMode="decimal" placeholder="12 700" style={{ ...inp, height: 28, flex: "0 1 110px", fontSize: 12.5 }} data-testid="q-rate" aria-label="Dollar kursi" />
                <span style={{ whiteSpace: "nowrap" }}>so'm</span>
              </div>
              <div data-testid="q-rate-src" style={{ textAlign: "right", marginTop: 3, fontSize: 11.5 }}>
                {draft.rateTouched && fxRate && toNum(draft.rate) !== fxRate
                  ? <>Qo'lda kiritildi — <button type="button" onClick={() => set({ rate: dec(fxRate), rateTouched: false })} style={{ border: 0, background: "none", color: P.link || P.primary, padding: 0, cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>{rateText(fxRate)} ga qaytarish</button></>
                  : fxRate ? fxHint(fx) : ""}
              </div>
            </div>
          )}
          {priceDiffers && <div style={{ fontSize: 11.5, color: P.muted, marginTop: 2 }}>Ro'yxatdagi narx: {listPrice} — <button type="button" onClick={() => set({ ...priceFields(sel), priceTouched: false })} style={{ border: 0, background: "none", color: P.link || P.primary, padding: 0, cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>qaytarish</button></div>}
          {calc.minApplied && <div style={{ fontSize: 11.5, color: P.muted, marginTop: 2 }}>Minimal maydon qo'llandi: {dec(calc.minArea)} m²</div>}
        </div>
        {err && <div role="alert" style={{ fontSize: 12.5, color: P.red, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" onClick={submit} style={{ ...btn(true), flex: 1 }} data-testid="q-add"><Plus size={16} /> {editingId ? "Saqlash" : "Smetaga qo'shish"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft({ ...emptyDraft(prices, kind), rate: fxRate ? dec(fxRate) : draft.rate, rateTouched: false }); }} style={{ ...btn(false), padding: "0 14px" }}>Bekor</button>}
        </div>
      </div>
      )}

      {showItems && items.length > 0 && (
        <div data-testid="quote-items" style={{ border: `1px solid ${P.border}`, borderRadius: 10, padding: compact ? 10 : 12 }}>
          {items.map((it, k) => (
            <div key={it.id} data-item={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: k ? `1px solid ${P.border}` : 0, position: "relative", background: editingId === it.id ? P.hover : "transparent" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title || it.material}</div>
                <div style={{ fontSize: 11.5, color: P.muted, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{describeItem(it)}</div>
              </div>
              <b style={{ fontSize: 13.5, fontWeight: 600, color: P.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(it.total)}</b>
              <button type="button" onClick={() => setMenu(menu === it.id ? null : it.id)} aria-label="Amallar" aria-expanded={menu === it.id} data-testid="q-item-menu"
                style={{ width: 28, height: 28, border: 0, borderRadius: 7, background: "none", color: P.muted, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}><MoreHorizontal size={16} /></button>
              {menu === it.id && (
                <>
                  <div onClick={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 330 }} />
                  <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% - 4px)", zIndex: 331, background: P.panel, border: `1px solid ${P.border}`, borderRadius: 9, boxShadow: P.shadow, padding: 4, width: 170 }}>
                    {[["Tahrirlash", Pencil, () => edit(it)], ["Nusxa olish", Copy, () => { onChange([...items, { ...it, id: rid() }]); setMenu(null); }], ["O'chirish", Trash2, () => { onChange(items.filter((x) => x.id !== it.id)); setMenu(null); if (editingId === it.id) setEditingId(null); }]].map(([l, Ic, fn]) => (
                      <button key={l} type="button" role="menuitem" onClick={fn} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 10px", border: 0, borderRadius: 6, background: "none", color: l === "O'chirish" ? P.red : P.text, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}><Ic size={14} /> {l}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${P.border}`, marginTop: 4, paddingTop: 8, display: "flex", flexDirection: "column", gap: 3, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}><span style={{ color: P.muted }}>Jami ({items.length} pozitsiya{totalArea ? ` · ${dec(totalArea)} m²` : ""})</span><b data-testid="quote-total" style={{ fontSize: 16, color: P.text, whiteSpace: "nowrap" }}>{money(total)}</b></div>
            {advancePct > 0 && <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: P.muted }}>Avans kerak ({advancePct}%)</span><span style={{ color: P.text, whiteSpace: "nowrap" }}>{money(need)}</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}
