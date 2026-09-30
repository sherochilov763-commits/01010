// SaveStatus.jsx — "Saqlanmoqda / Saqlandi / Saqlanmadi" ko'rsatkichi (ekranning pastki chap burchagi)
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CloudOff, Loader2, RotateCw, X } from "lucide-react";
import { retryNow, subscribeSaveStatus } from "../lib/kv.js";
import { THEME } from "../theme.js";

export function SaveStatus() {
  const [st, setSt] = useState({ state: "idle" });
  const [visible, setVisible] = useState(false);
  const [dismissedErr, setDismissedErr] = useState("");
  const timer = useRef(null);

  useEffect(() => subscribeSaveStatus((s) => {
    setSt(s);
    clearTimeout(timer.current);
    if (s.state === "saving") timer.current = setTimeout(() => setVisible(true), 700); // tez saqlanishda miltillamasin
    else if (s.state === "saved") timer.current = setTimeout(() => setVisible(false), 1600);
    else if (s.state === "offline" || s.state === "error") setVisible(true);
  }), []);

  if (!visible || st.state === "idle" || (st.state === "error" && dismissedErr === st.error)) return null;
  const tone = st.state === "offline" ? { bg: "#3A2A05", fg: "#FFD27A", bd: "#7A5A12" }
    : st.state === "error" ? { bg: THEME.roseBg, fg: THEME.roseText, bd: THEME.roseBorder }
    : { bg: THEME.card, fg: THEME.text, bd: THEME.border };
  return (
    <div role="status" aria-live="polite" className="uvix-savestatus" style={{
      position: "fixed", left: 16, bottom: 16, zIndex: 260, display: "flex", alignItems: "center", gap: 10, maxWidth: "calc(100vw - 32px)",
      padding: "10px 14px", borderRadius: 14, background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`,
      boxShadow: "0 12px 32px rgba(0,0,0,.25)", fontSize: 13.5, fontWeight: 600,
    }}>
      {st.state === "saving" && <><Loader2 size={16} className="uvix-spin" /> Saqlanmoqda…</>}
      {st.state === "saved" && <><Check size={16} color={THEME.green} /> Saqlandi</>}
      {st.state === "offline" && (
        <>
          <CloudOff size={17} style={{ flexShrink: 0 }} />
          <span>Saqlanmadi: {st.error}. O'zgarishlar yo'qolmaydi — o'zi qayta yuboriladi.</span>
          <button type="button" onClick={retryNow} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${tone.bd}`, background: "transparent", color: tone.fg, borderRadius: 9, padding: "5px 10px", cursor: "pointer", font: "inherit", flexShrink: 0 }}>
            <RotateCw size={14} /> Qayta urinish
          </button>
        </>
      )}
      {st.state === "error" && (
        <>
          <AlertTriangle size={17} style={{ flexShrink: 0 }} />
          <span>{st.error}</span>
          <button type="button" aria-label="Yopish" onClick={() => setDismissedErr(st.error)} style={{ border: 0, background: "none", color: tone.fg, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}><X size={16} /></button>
        </>
      )}
      <style>{`.uvix-spin{animation:uvix-spin .9s linear infinite}@keyframes uvix-spin{to{transform:rotate(360deg)}}
        @media (max-width: 768px){ .uvix-savestatus{ left: 12px !important; bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important; } }`}</style>
    </div>
  );
}
