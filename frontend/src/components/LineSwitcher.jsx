// LineSwitcher.jsx — yo'nalishni almashtirish (UVIXPRINT / UVONYX / admin uchun «Ikkalasi»).
// variant="card" — menyu tepasidagi katta rangli karta; variant="pill" — telefonda va tepa paneldagi ixcham yorliq.
// Tanlov oynasi: kompyuterda — karta ostida ochiladigan panel, telefonda — pastdan varaq.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Columns2 } from "lucide-react";
import { ALL, LINE_META, lineColor, useLine } from "../lib/lines.js";
import { useBackToClose } from "../lib/history.js";
import { THEME } from "../theme.js";

function Logo({ line, size = 34 }) {
  const all = line === ALL;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size * 0.28, flexShrink: 0, display: "grid", placeItems: "center", fontWeight: 800, fontSize: size * 0.38, color: "#fff",
      background: all ? `linear-gradient(135deg, ${LINE_META.UVIXPRINT.color} 50%, ${LINE_META.UVONYX.color} 50%)` : lineColor(line) }}>
      {all ? "" : LINE_META[line].short}
    </span>
  );
}
const titleOf = (line) => (line === ALL ? "Ikkalasi" : LINE_META[line].name);

export function LineSwitcher({ variant = "card", counts = {}, onSwitched }) {
  const { line, setLine, allowed } = useLine();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const sheet = variant === "pill";
  useBackToClose(open && sheet, () => setOpen(false));
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (allowed.length < 2) return null;
  const pick = (v) => { setOpen(false); if (v !== line) { setLine(v); onSwitched?.(v); } };
  const color = line === ALL ? THEME.text : lineColor(line, THEME.isDark);

  const options = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {allowed.filter((v) => v !== ALL).map((v, i) => {
        const on = v === line;
        const c = lineColor(v, THEME.isDark);
        return (
          <button key={v} type="button" onClick={() => pick(v)} data-line-option={v} aria-pressed={on}
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: sheet ? 14 : 12, borderRadius: 16, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: THEME.text,
              background: THEME.card, border: `2px solid ${on ? c : THEME.border}`, boxShadow: on ? `0 0 0 4px ${c}22` : "none" }}>
            <Logo line={v} size={sheet ? 46 : 40} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", fontSize: sheet ? 17 : 15.5 }}>{LINE_META[v].name}</b>
              <small style={{ display: "block", fontSize: 12.5, color: THEME.muted, marginTop: 1 }}>{LINE_META[v].sub}{counts[v] != null ? ` · ${counts[v]} ochiq buyurtma` : ""}</small>
            </span>
            {on ? <Check size={20} color={c} /> : !sheet && <kbd style={{ fontSize: 11, color: THEME.dim, fontFamily: "ui-monospace, monospace" }}>Ctrl {i + 1}</kbd>}
          </button>
        );
      })}
      {allowed.includes(ALL) && (
        <button type="button" onClick={() => pick(ALL)} data-line-option="all" aria-pressed={line === ALL}
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: THEME.text,
            background: line === ALL ? THEME.chip : "transparent", border: `1px dashed ${THEME.border2}` }}>
          <Columns2 size={20} color={THEME.muted} />
          <span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 14.5 }}>Ikkalasi</b><small style={{ fontSize: 12, color: THEME.muted }}>faqat rahbar · umumiy ko'rinish va taqqoslash</small></span>
          {line === ALL && <Check size={18} />}
        </button>
      )}
    </div>
  );

  if (variant === "pill") {
    return (
      <>
        <button type="button" className="uvix-line-pill" onClick={() => setOpen(true)} data-testid="line-pill" aria-label={`Yo'nalish: ${titleOf(line)}. Almashtirish`}
          style={{ height: 36, padding: "0 10px 0 5px", borderRadius: 999, border: `1px solid ${line === ALL ? THEME.border2 : color + "55"}`, background: line === ALL ? THEME.card : color + "18", color: line === ALL ? THEME.text : color,
            alignItems: "center", gap: 7, fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, cursor: "pointer", flexShrink: 0 }}>
          <Logo line={line} size={26} />{titleOf(line)}<ChevronsUpDown size={14} />
        </button>
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(9,9,11,.4)" }} />
            <div role="dialog" aria-modal="true" aria-label="Yo'nalishni tanlash" data-testid="line-sheet"
              style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 401, background: THEME.surface, color: THEME.text, borderRadius: "22px 22px 0 0", padding: "12px 16px calc(20px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -12px 40px rgba(0,0,0,.25)", maxWidth: 560, margin: "0 auto" }}>
              <div style={{ width: 40, height: 5, borderRadius: 3, background: THEME.border2, margin: "0 auto 14px" }} />
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Qaysi yo'nalishda ishlaysiz?</div>
              {options}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <button type="button" ref={btnRef} onClick={() => { setRect(btnRef.current?.getBoundingClientRect() || null); setOpen((v) => !v); }} data-testid="line-card" aria-expanded={open} aria-label={`Yo'nalish: ${titleOf(line)}. Almashtirish`}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          border: line === ALL ? `1px solid ${THEME.border2}` : 0, color: line === ALL ? THEME.text : "#fff", background: line === ALL ? THEME.card : lineColor(line) }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, background: line === ALL ? "transparent" : "rgba(255,255,255,.2)", flexShrink: 0 }}>
          {line === ALL ? <Logo line={ALL} size={30} /> : LINE_META[line].short}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block", fontSize: 15 }}>{titleOf(line)}</b>
          <small style={{ display: "block", fontSize: 11.5, opacity: 0.85 }}>Yo'nalishni almashtirish</small>
        </span>
        <ChevronsUpDown size={18} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 300 }} />
          <div role="dialog" aria-label="Yo'nalishni tanlash" data-testid="line-menu"
            style={{ position: "fixed", left: Math.max(8, rect?.left ?? 12), top: (rect?.bottom ?? 60) + 8, width: Math.min(340, window.innerWidth - 16), zIndex: 301, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 18, boxShadow: THEME.shadowLg, padding: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: THEME.text }}>Qaysi yo'nalishda ishlaysiz?</div>
            {options}
          </div>
        </>
      )}
    </div>
  );
}

// Kichik belgi (rasxod/buyurtma qatorlarida): «UVONYX», «Umumiy»
export function LineTag({ line, share }) {
  const common = line === "common";
  const c = common ? THEME.muted : lineColor(line, THEME.isDark);
  return (
    <span data-line-tag={line} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 20, padding: "0 7px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.2, whiteSpace: "nowrap",
      color: c, background: common ? THEME.chip : c + "1F" }}>
      {common ? "Umumiy" : LINE_META[line]?.name || line}{common && share != null ? ` · ${Math.round(share * 100)}%` : ""}
    </span>
  );
}

export const LINE_CSS = `
  .uvix-line-pill { display: none; }
  @media (max-width: 860px) { .uvix-line-pill { display: inline-flex; } }
  .uvix-layout-rail .uvix-line-pill, .uvix-layout-top .uvix-line-pill { display: inline-flex; }
  .uvix-line-stripe { position: fixed; left: 0; right: 0; top: 0; height: 4px; z-index: 160; pointer-events: none; }
`;
