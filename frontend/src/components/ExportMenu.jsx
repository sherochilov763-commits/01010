// ExportMenu.jsx — har bo'limdagi bitta «Yuklash ▾» tugmasi: Excel yoki PDF (professional ko'rinishda).
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { THEME } from "../theme.js";

export function ExportMenu({ onExport, disabled, label = "Yuklash", testid = "export-menu" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  async function run(kind) {
    setOpen(false); setBusy(kind);
    try { await onExport(kind); } catch (e) { alert(e?.message || "Yuklashda xato"); } finally { setBusy(""); }
  }
  const item = (kind, I, l, c, sub) => (
    <button type="button" role="menuitem" data-export={kind} onClick={() => run(kind)}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", border: 0, background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderRadius: 8, color: THEME.text }}
      className="uvix-row">
      <I size={17} color={c} /><span><b style={{ fontSize: 13.5 }}>{l}</b><small style={{ display: "block", fontSize: 11.5, color: THEME.muted }}>{sub}</small></span>
    </button>
  );
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" disabled={disabled || !!busy} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} data-testid={testid}
        style={{ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap" }}>
        {busy ? <Loader2 size={15} className="uvix-spin" /> : <Download size={15} />} {label} <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 60, width: 230, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 12, boxShadow: THEME.shadowLg, padding: 5 }}>
          {item("xlsx", FileSpreadsheet, "Excel", THEME.isDark ? "#4ADE80" : "#107C41", "jadval, formulalar bilan")}
          {item("pdf", FileText, "PDF", THEME.rose, "chop etish va yuborish uchun")}
        </div>
      )}
    </div>
  );
}
