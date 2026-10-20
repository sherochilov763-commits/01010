// PhotoViewer.jsx — buyurtma rasmlari va chizmalarini to'liq ekranda ko'rish: kattalashtirish (g'ildirak, ikki marta bosish,
// telefonda ikki barmoq), surib ko'rish, ← → yoki chapga/o'ngga surib keyingi rasm, asl faylni ochish.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, X } from "lucide-react";
import { THEME } from "../theme.js";
import { useBackToClose } from "../lib/history.js";

const MAX = 6;
export function PhotoViewer({ photos, index = 0, title = "", onClose }) {
  const list = (photos || []).filter((p) => p && (p.url || p.thumbUrl));
  const [i, setI] = useState(Math.min(index, Math.max(0, list.length - 1)));
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const drag = useRef(null);
  const pts = useRef(new Map());
  useBackToClose(true, onClose);
  const cur = list[i];
  const reset = () => { setZ(1); setPos({ x: 0, y: 0 }); };
  const go = useCallback((d) => { if (list.length < 2) return; setI((v) => (v + d + list.length) % list.length); setLoaded(false); setZ(1); setPos({ x: 0, y: 0 }); }, [list.length]);
  const zoomTo = (nz) => { const v = Math.max(1, Math.min(MAX, nz)); setZ(v); if (v === 1) setPos({ x: 0, y: 0 }); };

  useEffect(() => {
    const k = (e) => {
      // Ko'ruvchi ochiq — Escape faqat uni yopadi (orqadagi forma/oyna yopilmasin)
      if (["Escape", "ArrowRight", "ArrowLeft"].includes(e.key)) { e.stopImmediatePropagation(); e.preventDefault(); }
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") setZ((v) => Math.min(MAX, v * 1.5));
      else if (e.key === "-") setZ((v) => { const n = Math.max(1, v / 1.5); if (n === 1) setPos({ x: 0, y: 0 }); return n; });
    };
    window.addEventListener("keydown", k, true);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k, true); document.body.style.overflow = prev; };
  }, [go, onClose]);

  if (!cur) return null;
  const onWheel = (e) => { e.preventDefault?.(); zoomTo(z * (e.deltaY < 0 ? 1.25 : 0.8)); };
  const down = (e) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; drag.current = { pinch: Math.hypot(a.x - b.x, a.y - b.y), z0: z }; return; }
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, t: Date.now(), moved: false };
  };
  const move = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current; if (!d) return;
    if (d.pinch && pts.current.size === 2) { const [a, b] = [...pts.current.values()]; zoomTo(d.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / d.pinch)); return; }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (z > 1) setPos({ x: d.px + dx, y: d.py + dy });
  };
  const up = (e) => {
    pts.current.delete(e.pointerId);
    const d = drag.current; drag.current = null;
    if (!d || d.pinch) return;
    const dx = e.clientX - d.x;
    if (z === 1 && Math.abs(dx) > 60 && Date.now() - d.t < 600) go(dx < 0 ? 1 : -1); // surib keyingi rasm
  };
  const btn = { width: 42, height: 42, borderRadius: "50%", border: 0, background: "rgba(255,255,255,.14)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 };
  return (
    <div className="uvix-pv" role="dialog" aria-modal="true" aria-label="Rasmni ko'rish" data-testid="photo-viewer">
      <div className="uvix-pv-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title || "Rasm"}</div>
          <div style={{ fontSize: 12.5, opacity: 0.7 }} data-testid="pv-count">{i + 1} / {list.length}{z > 1 ? ` · ${Math.round(z * 100)}%` : ""}</div>
        </div>
        <button type="button" style={btn} onClick={() => zoomTo(z / 1.5)} aria-label="Kichraytirish" disabled={z <= 1}><Minus size={18} /></button>
        <button type="button" style={btn} onClick={() => zoomTo(z * 1.5)} aria-label="Kattalashtirish" data-testid="pv-zoom-in"><Plus size={18} /></button>
        <a href={cur.url || cur.thumbUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn, textDecoration: "none" }} aria-label="Asl faylni ochish" title="Asl faylni yangi oynada ochish"><ExternalLink size={17} /></a>
        <button type="button" style={btn} onClick={onClose} aria-label="Yopish" data-testid="pv-close"><X size={20} /></button>
      </div>
      <div className="uvix-pv-stage" onWheel={onWheel} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onDoubleClick={() => (z > 1 ? reset() : zoomTo(2.5))} style={{ cursor: z > 1 ? "grab" : "zoom-in" }}>
        {!loaded && cur.thumbUrl && <img src={cur.thumbUrl} alt="" className="uvix-pv-img" style={{ filter: "blur(6px)", opacity: 0.6 }} />}
        <img key={cur.url} src={cur.url || cur.thumbUrl} alt={title} draggable={false} onLoad={() => setLoaded(true)} data-testid="pv-img" className="uvix-pv-img"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${z})`, opacity: loaded || !cur.thumbUrl ? 1 : 0, transition: drag.current ? "none" : "transform .18s ease, opacity .2s ease" }} />
      </div>
      {list.length > 1 && (
        <>
          <button type="button" className="uvix-pv-nav" style={{ ...btn, left: 14 }} onClick={() => go(-1)} aria-label="Oldingi rasm"><ChevronLeft size={24} /></button>
          <button type="button" className="uvix-pv-nav" style={{ ...btn, right: 14 }} onClick={() => go(1)} aria-label="Keyingi rasm" data-testid="pv-next"><ChevronRight size={24} /></button>
          <div className="uvix-pv-strip">
            {list.map((p, k) => (
              <button key={p.id || p.url} type="button" onClick={() => { setI(k); setLoaded(false); reset(); }} aria-label={`${k + 1}-rasm`}
                style={{ width: 52, height: 52, borderRadius: 9, overflow: "hidden", padding: 0, border: k === i ? `2px solid #fff` : "2px solid transparent", opacity: k === i ? 1 : 0.55, cursor: "pointer", background: "#111", flexShrink: 0 }}>
                <img src={p.thumbUrl || p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            ))}
          </div>
        </>
      )}
      <style>{PV_CSS()}</style>
    </div>
  );
}

// Buyurtma ichidagi rasmlar to'ri (bosilsa — to'liq ekran)
export function PhotoGrid({ photos, title, size = 76 }) {
  const list = (photos || []).filter((p) => p && (p.url || p.thumbUrl));
  const [open, setOpen] = useState(null);
  if (!list.length) return null;
  return (
    <>
      <div data-testid="order-photos" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`, gap: 8 }}>
        {list.map((p, k) => (
          <button key={p.id || p.url} type="button" data-photo={k} onClick={() => setOpen(k)} aria-label={`Rasmni ochish (${k + 1})`}
            style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", padding: 0, border: `1px solid ${THEME.border}`, cursor: "zoom-in", background: THEME.chip }}>
            <img src={p.thumbUrl || p.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        ))}
      </div>
      {open != null && <PhotoViewer photos={list} index={open} title={title} onClose={() => setOpen(null)} />}
    </>
  );
}

const PV_CSS = () => `
  .uvix-pv { position: fixed; inset: 0; z-index: 1000; background: rgba(8,8,10,.96); color: #fff; display: flex; flex-direction: column; animation: uvixPvIn .18s ease; touch-action: none; }
  .uvix-pv-top { display: flex; align-items: center; gap: 8px; padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px; flex-shrink: 0; }
  .uvix-pv-stage { flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; position: relative; user-select: none; -webkit-user-select: none; }
  .uvix-pv-img { grid-area: 1 / 1; max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: center; will-change: transform; }
  .uvix-pv-nav { position: absolute; top: 50%; transform: translateY(-50%); }
  .uvix-pv-strip { display: flex; gap: 8px; justify-content: center; padding: 10px 14px calc(12px + env(safe-area-inset-bottom, 0px)); overflow-x: auto; flex-shrink: 0; }
  @media (max-width: 720px) { .uvix-pv-nav { display: none !important; } }
  @keyframes uvixPvIn { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .uvix-pv { animation: none; } }
`;
