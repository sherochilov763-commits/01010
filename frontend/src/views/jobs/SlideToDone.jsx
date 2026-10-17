// SlideToDone.jsx — «Surib yakunlang»: ish faqat barmoq oxirigacha surilganda yakunlanadi (Yandex Pro / Uber usuli).
// Tasodifiy bosish hech narsa qilmaydi; yarim yo'lda qo'yib yuborilsa — orqaga qaytadi.
import { useRef, useState } from "react";
import { Check, ChevronsRight } from "lucide-react";
import { THEME } from "../../theme.js";

const KNOB = 48, PAD = 4;
export function SlideToDone({ onDone, label = "Surib yakunlang", doneLabel = "Bajarildi", disabled = false, testid = "slide-done", jobId }) {
  const track = useRef(null);
  const drag = useRef(null);
  const [x, setX] = useState(0);
  const [done, setDone] = useState(false);
  const max = () => Math.max(0, (track.current?.clientWidth || 300) - KNOB - PAD * 2);
  const finish = () => { setX(max()); setDone(true); onDone?.(); };
  const down = (e) => {
    if (disabled || done) return;
    e.stopPropagation();
    drag.current = { start: e.clientX - x };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => { if (!drag.current) return; setX(Math.min(max(), Math.max(0, e.clientX - drag.current.start))); };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    if (x >= max() * 0.85) finish(); else setX(0);
  };
  const pct = max() ? x / max() : 0;
  return (
    <div ref={track} data-testid={testid} data-slide-job={jobId} onClick={(e) => e.stopPropagation()}
      style={{ position: "relative", height: KNOB + PAD * 2, borderRadius: 15, background: done ? THEME.greenSolid : THEME.greenBg, border: `1.5px solid ${done ? THEME.greenSolid : "#BFE3CB"}`, overflow: "hidden", userSelect: "none", opacity: disabled ? 0.55 : 1, flex: 1 }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: x + KNOB + PAD * 2, background: THEME.greenSolid, opacity: done ? 1 : 0.25 + pct * 0.6, transition: drag.current ? "none" : "width .2s" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: KNOB, fontWeight: 800, fontSize: 15, color: done ? "#fff" : THEME.greenText, opacity: done ? 1 : 1 - pct, pointerEvents: "none", gap: 6 }}>
        {done ? <><Check size={18} /> {doneLabel}</> : <>{label} <span style={{ letterSpacing: -2 }}>›››</span></>}
      </div>
      {!done && (
        <button type="button" role="slider" aria-label={`${label} — o'ngga suring`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} data-testid={`${testid}-knob`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setX(0); }}
          onKeyDown={(e) => { if (e.key === "End") { e.preventDefault(); finish(); } }}
          style={{ position: "absolute", left: PAD + x, top: PAD, width: KNOB, height: KNOB, borderRadius: 12, border: 0, background: THEME.greenSolid, color: "#fff", display: "grid", placeItems: "center", cursor: "grab", touchAction: "none", boxShadow: "0 3px 8px rgba(0,0,0,.2)", transition: drag.current ? "none" : "left .2s", padding: 0 }}>
          <ChevronsRight size={22} />
        </button>
      )}
    </div>
  );
}

// Pastda 5 soniyalik «Bekor qilish» (Gmail / Telegram usuli)
export function UndoToast({ title, onUndo, seconds = 5 }) {
  return (
    <div role="status" data-testid="undo-toast"
      style={{ position: "fixed", left: 12, right: 12, bottom: "calc(86px + env(safe-area-inset-bottom, 0px))", zIndex: 950, maxWidth: 460, margin: "0 auto", background: "#18181B", color: "#fff", borderRadius: 14, padding: "12px 14px 10px", boxShadow: "0 10px 28px rgba(0,0,0,.3)" }}>
      <style>{"@keyframes uvixUndo{from{transform:scaleX(1)}to{transform:scaleX(0)}}"}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14 }}>
        <Check size={17} style={{ color: "#86EFAC", flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>«{title}» bajarildi</span>
        <button type="button" onClick={onUndo} data-testid="undo-btn" style={{ border: 0, background: "none", color: "#86EFAC", fontFamily: "inherit", fontWeight: 800, fontSize: 14.5, cursor: "pointer", padding: "4px 2px", whiteSpace: "nowrap" }}>Bekor qilish</button>
      </div>
      <div style={{ height: 3, background: "#3F3F46", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
        <div style={{ height: "100%", background: "#86EFAC", transformOrigin: "left", animation: `uvixUndo ${seconds}s linear forwards` }} />
      </div>
    </div>
  );
}
