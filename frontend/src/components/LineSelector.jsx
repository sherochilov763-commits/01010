// LineSelector.jsx — umumiy yo'nalish tanlovi: «Barchasi · UVIX · ONYX · Yonma-yon».
// Kompyuterda — menyu tepasida (logotip ostida); telefonda — tepa panelda kichik belgi, bosilsa pastdan oyna.
// Faqat rahbar va «Hammasi» huquqlilar ko'radi; bitta yo'nalishga biriktirilgan xodimda — ko'rinmaydi.
import { useState } from "react";
import { Check, ChevronDown, Columns2, Layers } from "lucide-react";
import { LINE_META, SPLIT, lineColor, useLine } from "../lib/lines.js";
import { THEME } from "../theme.js";

const OPTS = [
  { v: "all", l: "Barchasi", short: "Barchasi" },
  { v: "UVIXPRINT", l: "UVIXPRINT", short: "UVIX" },
  { v: "UVONYX", l: "UVONYX", short: "ONYX" },
  { v: SPLIT, l: "Yonma-yon", short: "" },
];
const colorOf = (v) => (v === "UVIXPRINT" || v === "UVONYX" ? lineColor(v, THEME.isDark) : THEME.text);

export function LineSelector() {
  const { view, setLine, canSwitch } = useLine();
  if (!canSwitch) return null;
  return (
    <div role="radiogroup" aria-label="Yo'nalish" data-testid="line-selector"
      style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr .85fr 34px", gap: 2, background: THEME.chip, borderRadius: 11, padding: 3, margin: "0 4px 12px" }}>
      {OPTS.map((o) => {
        const on = view === o.v;
        return (
          <button key={o.v} type="button" role="radio" aria-checked={on} data-line-opt={o.v} onClick={() => setLine(o.v)}
            title={o.v === SPLIT ? "Yonma-yon — ikkala yo'nalish alohida, bir ekranda" : o.l}
            style={{ height: 30, border: 0, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center", padding: 0,
              background: on ? THEME.card : "transparent", boxShadow: on ? THEME.shadowSm : "none", color: on ? colorOf(o.v) : THEME.muted }}>
            {o.v === SPLIT ? <Columns2 size={15} /> : o.short}
          </button>
        );
      })}
    </div>
  );
}

// Tepa chiziq — tanlangan yo'nalish rangida (sahifa qaysi yo'nalishda ekani bilinib tursin)
export function LineStrip() {
  const { view, canSwitch } = useLine();
  if (!canSwitch || (view !== "UVIXPRINT" && view !== "UVONYX")) return null;
  return <div aria-hidden data-testid="line-strip" style={{ height: 3, background: lineColor(view, THEME.isDark), position: "sticky", top: 0, zIndex: 30 }} />;
}

// Telefon: tepa paneldagi kichik belgi + pastdan oyna
export function LineChip({ sums }) {
  const { view, setLine, canSwitch } = useLine();
  const [open, setOpen] = useState(false);
  if (!canSwitch) return null;
  const cur = OPTS.find((o) => o.v === view) || OPTS[0];
  const c = colorOf(view);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="line-chip" aria-label={`Yo'nalish: ${cur.l}`}
        style={{ height: 34, display: "inline-flex", alignItems: "center", gap: 4, padding: "0 10px", borderRadius: 999, border: `1.5px solid ${view === "all" || view === SPLIT ? THEME.border2 : c + "66"}`, background: view === "all" || view === SPLIT ? THEME.card : c + "14", color: c, fontFamily: "inherit", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
        {view === SPLIT ? <Columns2 size={14} /> : view === "all" ? <Layers size={14} /> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />}
        {view === SPLIT ? "" : cur.short}<ChevronDown size={13} />
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="line-sheet" style={{ width: "100%", background: THEME.card, borderRadius: "20px 20px 0 0", padding: "10px 16px calc(20px + env(safe-area-inset-bottom, 0px))", fontFamily: THEME.font }}>
            <div style={{ width: 40, height: 5, borderRadius: 3, background: THEME.border2, margin: "0 auto 12px" }} />
            <div style={{ fontWeight: 700, fontSize: 17, color: THEME.text, marginBottom: 10 }}>Yo'nalish</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {OPTS.map((o) => {
                const on = view === o.v;
                const oc = colorOf(o.v);
                return (
                  <button key={o.v} type="button" data-line-opt={o.v} onClick={() => { setLine(o.v); setOpen(false); }}
                    style={{ height: 52, borderRadius: 14, border: on ? `2px solid ${oc}` : `1px solid ${THEME.border}`, background: on ? oc + "10" : THEME.card, display: "flex", alignItems: "center", gap: 12, padding: "0 14px", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: THEME.text, cursor: "pointer" }}>
                    {o.v === SPLIT ? <Columns2 size={18} /> : o.v === "all" ? <Layers size={18} /> : <span style={{ width: 12, height: 12, borderRadius: "50%", background: oc }} />}
                    <span>{o.l}</span>
                    {o.v === SPLIT && <small style={{ fontWeight: 500, color: THEME.muted, fontSize: 12 }}>ikkalasi alohida</small>}
                    <span style={{ marginLeft: "auto", color: THEME.muted, fontWeight: 500, fontSize: 13 }}>{sums?.[o.v] || ""}</span>
                    {on && <Check size={18} color={oc} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Yo'nalish sarlavhasi («Yonma-yon» bloklari uchun)
export function LineHeader({ line, right }) {
  const c = lineColor(line, THEME.isDark);
  return (
    <div data-line-block={line} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: `4px solid ${c}`, background: c + "10", color: c, fontWeight: 800, fontSize: 14, borderRadius: "12px 12px 0 0" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{LINE_META[line]?.name || line}
      {right && <span style={{ marginLeft: "auto", color: THEME.muted, fontWeight: 600, fontSize: 12.5 }}>{right}</span>}
    </div>
  );
}
