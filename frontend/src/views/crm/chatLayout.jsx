// chatLayout.jsx — Chat oynasi panellari: kenglikni surib o'zgartirish, yashirish, to'liq ekran.
// Tanlovlar shu brauzerda eslab qolinadi (har kim o'zi uchun sozlaydi).
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "uvix-chat-layout-v1";
export const LIST_W = { min: 220, max: 480, def: 300 };
export const INFO_W = { min: 240, max: 440, def: 280 };
const MIDDLE_MIN = 360;
const DEFAULTS = { listW: LIST_W.def, infoW: INFO_W.def, listHidden: false, infoHidden: false };

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && typeof v === "object" ? { ...DEFAULTS, ...v } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useChatLayout() {
  const [layout, setLayout] = useState(load);
  const [fullscreen, setFullscreen] = useState(false); // eslab qolinmaydi — har safar oddiy rejimda ochiladi
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* xususiy rejim */ }
  }, [layout]);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);
  const update = useCallback((patch) => setLayout((l) => ({ ...l, ...(typeof patch === "function" ? patch(l) : patch) })), []);
  return { layout, update, fullscreen, setFullscreen };
}

/**
 * Panellar orasidagi surgich. side="left" — chap panel kengligi (o'ngga sursa kattalashadi),
 * side="right" — o'ng panel (chapga sursa kattalashadi). Ikki marta bosish — standart o'lcham.
 */
export function Resizer({ side, width, onChange, containerRef, otherWidth, color = "#101921", accent = "#0088CC" }) {
  const [drag, setDrag] = useState(false);
  const start = useRef(null);
  const limits = side === "left" ? LIST_W : INFO_W;
  const maxByContainer = () => {
    const total = containerRef.current?.clientWidth || 99999;
    return Math.min(limits.max, total - (otherWidth || 0) - MIDDLE_MIN);
  };
  const set = (w) => onChange(Math.max(limits.min, Math.min(maxByContainer(), Math.round(w))));

  function onPointerDown(e) {
    e.preventDefault();
    start.current = { x: e.clientX, w: width };
    setDrag(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    set(side === "left" ? start.current.w + dx : start.current.w - dx);
  }
  function onPointerUp() {
    start.current = null;
    setDrag(false);
  }
  function onKeyDown(e) {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === "ArrowLeft") { e.preventDefault(); set(width + (side === "left" ? -step : step)); }
    if (e.key === "ArrowRight") { e.preventDefault(); set(width + (side === "left" ? step : -step)); }
    if (e.key === "Home" || e.key === "Enter") { e.preventDefault(); set(limits.def); }
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "left" ? "Suhbatlar ro'yxati kengligi" : "Mijoz paneli kengligi"}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Surib kengligini o'zgartiring · ikki marta bosing — standart o'lcham"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => set(limits.def)}
      onKeyDown={onKeyDown}
      className="uc-resizer"
      style={{ width: 7, flexShrink: 0, cursor: "col-resize", position: "relative", background: color, touchAction: "none", zIndex: 2 }}
    >
      <span style={{ position: "absolute", top: 0, bottom: 0, left: 3, width: 1, background: drag ? accent : "transparent", transition: "background .12s" }} />
      {drag && <style>{`body{cursor:col-resize!important;user-select:none!important}`}</style>}
    </div>
  );
}

export const LAYOUT_CSS = `
  .uc-resizer:hover > span, .uc-resizer:focus-visible > span { background: #0088CC !important; }
  .uc-resizer:focus-visible { outline: none; }
  .uc-tool { width: 36px; height: 36px; border-radius: 10px; border: 0; background: none; color: #6D7F91; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
  .uc-tool:hover { background: #202B36; color: #E4ECF2; }
  .uc-tool[aria-pressed="true"] { color: #6AB3F3; }
`;
