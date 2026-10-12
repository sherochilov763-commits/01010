// QuoteBuilder.jsx — kalkulyator + smeta (bir nechta pozitsiya). Chat panelida ham, «Yangi buyurtma» oynasida ham ishlaydi.
// Rang palitrasi tashqaridan beriladi (chatda — chat ranglari, oynada — ilova mavzusi).
import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { fmt, money } from "../../lib/format.js";
import { computeItem, dec, describeItem, formulaOf, toNum } from "../../lib/production.js";

const CUSTOM = "__custom";
const rid = () => Math.random().toString(36).slice(2, 10);
const emptyDraft = (prices) => ({ title: "", priceId: prices?.[0]?.id || CUSTOM, material: "", unit: prices?.[0]?.unit || "m2", w: "", h: "", qty: "1", price: prices?.[0] ? String(prices[0].price) : "", minArea: prices?.[0]?.minArea || 0, priceTouched: false });

export function QuoteBuilder({ items, onChange, prices = [], P, advancePct = 0, titleRef, compact }) {
  const [draft, setDraft] = useState(() => emptyDraft(prices));
  const [editingId, setEditingId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [err, setErr] = useState("");
  const pricesKey = prices.map((p) => p.id).join(",");
  // Narxlar keyin yuklansa — tanlanmagan qoralamaga birinchi materialni qo'yamiz
  useEffect(() => {
    setDraft((d) => (d.priceId === CUSTOM && !d.material && !d.price && prices.length ? { ...emptyDraft(prices), title: d.title, w: d.w, h: d.h, qty: d.qty } : d));
  }, [pricesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = prices.find((p) => p.id === draft.priceId) || null;
  const calc = computeItem({ ...draft, material: sel ? sel.material : draft.material, minArea: sel ? sel.minArea : 0, unit: sel ? sel.unit : draft.unit });
  const total = items.reduce((s, i) => s + i.total, 0);
  const totalArea = Math.round(items.reduce((s, i) => s + (i.area || 0), 0) * 100) / 100;

  const set = (patch) => { setErr(""); setDraft((d) => ({ ...d, ...patch })); };
  function pickPrice(id) {
    if (id === CUSTOM) return set({ priceId: CUSTOM, price: "", priceTouched: false });
    const p = prices.find((x) => x.id === id);
    set({ priceId: id, unit: p.unit, price: String(p.price), minArea: p.minArea, priceTouched: false });
  }
  function submit() {
    const material = sel ? sel.material : draft.material.trim();
    if (!material && !draft.title.trim()) return setErr("Nima uchun yoki materialni yozing");
    if (calc.unit === "m2" && !(calc.w > 0 && calc.h > 0)) return setErr("Eni va bo'yini kiriting");
    if (!(calc.price > 0)) return setErr("Narxni kiriting");
    if (!(calc.total > 0)) return setErr("Summa 0 — o'lchamlarni tekshiring");
    const item = { id: editingId || rid(), title: draft.title.trim(), material, priceId: sel?.id || null, unit: calc.unit, w: calc.w, h: calc.h, qty: calc.qty, price: calc.price, minArea: calc.minArea, rawArea: calc.rawArea, area: calc.area, total: calc.total };
    onChange(editingId ? items.map((i) => (i.id === editingId ? item : i)) : [...items, item]);
    setEditingId(null);
    setDraft({ ...emptyDraft(prices), priceId: draft.priceId, unit: draft.unit, price: draft.price, minArea: draft.minArea, priceTouched: draft.priceTouched });
  }
  function edit(it) {
    const p = prices.find((x) => x.id === it.priceId) || prices.find((x) => x.material === it.material);
    setEditingId(it.id);
    setDraft({ title: it.title || "", priceId: p ? p.id : CUSTOM, material: p ? "" : it.material, unit: it.unit, w: it.w ? dec(it.w) : "", h: it.h ? dec(it.h) : "", qty: String(it.qty || 1), price: String(it.price), minArea: it.minArea || 0, priceTouched: p ? it.price !== p.price : false });
    setMenu(null);
    setTimeout(() => titleRef?.current?.focus(), 0);
  }

  const inp = { height: 36, minWidth: 0, width: "100%", boxSizing: "border-box", border: `1px solid ${P.border}`, borderRadius: 8, background: P.inputBg, color: P.text, padding: "0 10px", fontSize: 14, fontFamily: "inherit", outline: "none" };
  const label = (t) => <span style={{ fontSize: 11.5, color: P.muted }}>{t}</span>;
  const btn = (primary) => ({ height: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${primary ? P.primary : P.border}`, background: primary ? P.primary : P.panel, color: primary ? P.onPrimary : P.text });
  const need = Math.ceil((total * (advancePct || 0)) / 100);

  return (
    <div data-testid="quote-builder" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ border: `1px solid ${P.border}`, borderRadius: 10, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: P.text }}><Calculator size={15} /> {editingId ? "Pozitsiyani tahrirlash" : "Kalkulyator"}</span>
          <span style={{ fontSize: 11.5, color: P.muted }}>mijozga ko'rinmaydi</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <label style={{ display: "grid", gap: 3 }}>{label("Nima uchun")}<input ref={titleRef} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Masalan: oshxona fartugi" style={inp} data-testid="q-title" /></label>
          <label style={{ display: "grid", gap: 3 }}>{label(prices.length ? "Material — narxlar ro'yxatidan" : "Material")}
            {prices.length > 0 && (
              <select value={draft.priceId} onChange={(e) => pickPrice(e.target.value)} style={inp} data-testid="q-material">
                {prices.map((p) => <option key={p.id} value={p.id}>{p.material} — {fmt(p.price)} / {p.unit === "pcs" ? "dona" : "m²"}{p.minArea ? ` (min ${dec(p.minArea)} m²)` : ""}</option>)}
                <option value={CUSTOM}>Boshqa (qo'lda)</option>
              </select>
            )}
          </label>
          {(!prices.length || draft.priceId === CUSTOM) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input value={draft.material} onChange={(e) => set({ material: e.target.value })} placeholder="Material nomi" style={inp} data-testid="q-material-custom" aria-label="Material nomi" />
              <select value={draft.unit} onChange={(e) => set({ unit: e.target.value })} style={{ ...inp, width: 96 }} aria-label="Narx birligi"><option value="m2">m² narxi</option><option value="pcs">dona narxi</option></select>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr", gap: 8, marginTop: 8 }}>
          <label style={{ display: "grid", gap: 3 }}>{label("Eni, m")}<input value={draft.w} onChange={(e) => set({ w: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="metr" style={inp} data-testid="q-w" /></label>
          <label style={{ display: "grid", gap: 3 }}>{label("Bo'yi, m")}<input value={draft.h} onChange={(e) => set({ h: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="metr" style={inp} data-testid="q-h" /></label>
          <label style={{ display: "grid", gap: 3 }}>{label("Dona")}<input value={draft.qty} onChange={(e) => set({ qty: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={inp} data-testid="q-qty" /></label>
        </div>
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 9, background: P.hover, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: P.muted, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{calc.total > 0 ? formulaOf(calc) : "O'lcham va narxni kiriting"}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <div data-testid="calc-total" style={{ fontSize: 19, fontWeight: 700, color: P.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(calc.total)}</div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: P.muted }}>
              {calc.unit === "pcs" ? "1 dona" : "1 m²"}:
              <input value={draft.price ? fmt(toNum(draft.price)) : ""} onChange={(e) => set({ price: e.target.value.replace(/\D/g, ""), priceTouched: !!sel })} inputMode="numeric" placeholder="narx" style={{ ...inp, height: 30, width: 104, fontSize: 13 }} data-testid="q-price" aria-label="Narx" />
            </label>
          </div>
          {sel && draft.priceTouched && toNum(draft.price) !== sel.price && <div style={{ fontSize: 11.5, color: P.muted, marginTop: 2 }}>Ro'yxatdagi narx: {fmt(sel.price)} — <button type="button" onClick={() => set({ price: String(sel.price), priceTouched: false })} style={{ border: 0, background: "none", color: P.link || P.primary, padding: 0, cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>qaytarish</button></div>}
          {calc.minApplied && <div style={{ fontSize: 11.5, color: P.muted, marginTop: 2 }}>Minimal maydon qo'llandi: {dec(calc.minArea)} m²</div>}
        </div>
        {err && <div role="alert" style={{ fontSize: 12.5, color: P.red, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" onClick={submit} style={{ ...btn(true), flex: 1 }} data-testid="q-add"><Plus size={16} /> {editingId ? "Saqlash" : "Smetaga qo'shish"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft(prices)); }} style={{ ...btn(false), padding: "0 14px" }}>Bekor</button>}
        </div>
      </div>

      {items.length > 0 && (
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
