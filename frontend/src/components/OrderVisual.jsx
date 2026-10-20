// OrderVisual.jsx — buyurtmani tez tanish (eskiz 68–71): rasm, katta nom, joy yorlig'i,
// yaqinda ochilganlar, 📌 qadash, tez ko'rish (hover) va silliq joy almashish (FLIP).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pin, MapPin } from "lucide-react";
import { THEME } from "../theme.js";
import { fmt } from "../lib/format.js";

// Buyurtmaning ko'rinadigan nomi: nomi → material → raqam
export const orderTitle = (o) => (o?.title && String(o.title).trim()) || o?.materialType || o?.orderNumber || "Buyurtma";
export const coverOf = (o) => (Array.isArray(o?.photos) ? o.photos.find((p) => p && (p.thumbUrl || p.url)) : null) || null;

// Rasm bo'lmasa — material rangi (bir xil material doim bir xil rangda)
const MAT_TONES = [
  [/oniks|onyx/i, "linear-gradient(135deg,#FDE68A,#F59E0B 45%,#B45309)"],
  [/shisha|oyna|glass|zerkal/i, "linear-gradient(160deg,#DBEAFE,#93C5FD 50%,#3B82F6)"],
  [/akril/i, "linear-gradient(135deg,#F0ABFC,#A78BFA 55%,#6366F1)"],
  [/led|neon|lightbox|svet/i, "linear-gradient(135deg,#1F2937,#111827)"],
  [/plyonka|stiker|vinil|oracal/i, "linear-gradient(135deg,#FBCFE8,#EC4899)"],
  [/metall|temir|alyumin|zanglamas/i, "linear-gradient(135deg,#E5E7EB,#9CA3AF 60%,#4B5563)"],
  [/banner|baner|matoh|holst/i, "linear-gradient(135deg,#BBF7D0,#22C55E)"],
];
const HASH_TONES = ["#0E7C6B", "#7C3AED", "#B45309", "#0891B2", "#DB2777", "#4D7C0F", "#1F5FD6"];
const hash = (s) => { let h = 0; for (const ch of String(s || "")) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
function toneOf(o) {
  const m = `${o?.materialType || ""} ${o?.title || ""}`;
  for (const [re, bg] of MAT_TONES) if (re.test(m)) return { bg, dark: /led|neon|lightbox|svet/i.test(m) };
  const c = HASH_TONES[hash(o?.materialType || o?.customer) % HASH_TONES.length];
  return { bg: `linear-gradient(135deg, ${c}33, ${c}AA)` };
}
const abbr = (o) => String(o?.materialType || o?.title || "?").replace(/[^A-Za-zА-Яа-яЎўҚқҒғҲҳ\s]/g, "").trim().slice(0, 2).toUpperCase() || "•";

export function OrderThumb({ order, size = 44, radius, big = false }) {
  const cover = coverOf(order);
  const r = radius ?? Math.round(size * 0.24);
  const [broken, setBroken] = useState(false);
  const base = { width: size, height: big ? "100%" : size, borderRadius: r, flexShrink: 0, overflow: "hidden", display: "grid", placeItems: "center", position: "relative" };
  if (cover && !broken) {
    return (
      <span data-thumb="photo" style={{ ...base, background: THEME.chip }}>
        <img src={big ? cover.url : cover.thumbUrl || cover.url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
    );
  }
  const t = toneOf(order);
  return (
    <span data-thumb="tone" aria-hidden="true" style={{ ...base, background: t.bg, color: t.dark ? "#FDE68A" : "rgba(255,255,255,.95)", fontWeight: 800, fontSize: Math.max(10, Math.round(size * 0.3)), letterSpacing: 0.3, textShadow: t.dark ? "0 0 8px #FBBF24" : "0 1px 2px rgba(0,0,0,.25)" }}>
      {abbr(order)}
    </span>
  );
}

const PLACE_TONES = ["#7C3AED", "#B45309", "#0891B2", "#DC2626", "#1F5FD6", "#0E7C6B", "#DB2777"];
export const placeColor = (p) => PLACE_TONES[hash(String(p).toLowerCase()) % PLACE_TONES.length];
export function PlaceTag({ place, small = false }) {
  if (!place) return null;
  const c = placeColor(place);
  return (
    <span data-place={place} title="Joy / obyekt" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: small ? 10.5 : 11.5, fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, borderRadius: 6, padding: small ? "0 6px" : "1px 7px", lineHeight: small ? "17px" : "18px", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
      <MapPin size={small ? 10 : 11} style={{ flexShrink: 0 }} />{place}
    </span>
  );
}

// Mijozning avvalgi joylari (yangi buyurtmada taklif)
export function placesOf(orders, customer) {
  const k = String(customer || "").trim().toLowerCase();
  if (!k) return [];
  const m = new Map();
  for (const o of orders || []) {
    if (!o || o.deletedAt || !o.place || String(o.customer || "").trim().toLowerCase() !== k) continue;
    m.set(o.place, (m.get(o.place) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

// ---- Qadalganlar va yaqinda ochilganlar (har xodimning o'z brauzerida) ----
const MARKS_EVT = "uvix:order-marks";
const rd = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* xotira yopiq */ } window.dispatchEvent(new Event(MARKS_EVT)); };
export function useOrderMarks(userId) {
  const pk = `uvix:pins:${userId || "-"}`, rk = `uvix:recent:${userId || "-"}`;
  const [pins, setPins] = useState(() => rd(pk));
  const [recent, setRecent] = useState(() => rd(rk));
  useEffect(() => {
    const on = () => { setPins(rd(pk)); setRecent(rd(rk)); };
    on();
    window.addEventListener(MARKS_EVT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(MARKS_EVT, on); window.removeEventListener("storage", on); };
  }, [pk, rk]);
  const togglePin = useCallback((id) => { const cur = rd(pk); wr(pk, cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, 30)); }, [pk]);
  const touch = useCallback((id) => { if (!id) return; const cur = rd(rk); if (cur[0] === id) return; wr(rk, [id, ...cur.filter((x) => x !== id)].slice(0, 12)); }, [rk]);
  return { pins, pinSet: new Set(pins), recent, togglePin, touch };
}

export function PinButton({ on, onClick }) {
  const [pop, setPop] = useState(0);
  return (
    <button type="button" data-pin={on ? "1" : "0"} aria-pressed={on} aria-label={on ? "Qadoqdan olish" : "Qadash"} title={on ? "Qadoqdan olish" : "Ro'yxat boshiga qadash"}
      onClick={(e) => { e.stopPropagation(); setPop((n) => n + 1); onClick(); }}
      className={`uvix-pinbtn${on ? " on" : ""}`} style={{ color: on ? THEME.rose : THEME.dim }}>
      <Pin key={pop} size={14} fill={on ? "currentColor" : "none"} className={pop ? "uvix-pinpop" : ""} />
    </button>
  );
}

// Yaqinda ochilgan buyurtmalar qatori (4 ta)
export function RecentOrders({ orders, recent, pinSet, onOpen, max = 4 }) {
  const byId = new Map((orders || []).map((o) => [o.id, o]));
  const list = (recent || []).map((id) => byId.get(id)).filter((o) => o && !o.deletedAt).slice(0, max);
  const ref = useFlip(list.map((o) => o.id).join(","));
  if (!list.length) return null;
  return (
    <div data-testid="recent-orders" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, color: THEME.muted, textTransform: "uppercase", marginBottom: 7 }}>Yaqinda ochilgan</div>
      <div ref={ref} className="uvix-recent">
        {list.map((o) => (
          <button key={o.id} type="button" data-flip={o.id} data-recent={o.orderNumber} onClick={() => onOpen(o)} className="uvix-recent-item" style={{ background: THEME.card, border: `1px solid ${THEME.border}`, color: THEME.text }}>
            <OrderThumb order={o} size={34} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <b style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orderTitle(o)}</b>
              <small style={{ display: "block", fontSize: 11.5, color: THEME.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer || o.orderNumber}</small>
            </span>
            {pinSet?.has(o.id) && <Pin size={12} color={THEME.rose} fill={THEME.rose} style={{ flexShrink: 0 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// FLIP: [data-flip] elementlar joyi o'zgarsa — eski joyidan yangisiga silliq suriladi; yangilari pastdan paydo bo'ladi
export function useFlip(key) {
  const ref = useRef(null);
  const prev = useRef(new Map());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map();
    root.querySelectorAll("[data-flip]").forEach((el) => {
      const id = el.getAttribute("data-flip");
      const r = el.getBoundingClientRect();
      next.set(id, r);
      const p = prev.current.get(id);
      if (reduce || !el.animate) return;
      if (p) {
        const dx = p.left - r.left, dy = p.top - r.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" });
      } else if (prev.current.size) {
        el.animate([{ opacity: 0, transform: "translateY(8px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    });
    prev.current = next;
  }, [key]);
  return ref;
}

// Tez ko'rish: sichqoncha qatorda 0,35 s to'xtasa — katta rasm va qisqa ma'lumot (faqat kompyuterda)
export function useOrderPeek() {
  const [peek, setPeek] = useState(null);
  const t = useRef(null);
  const enter = useCallback((o, el) => {
    if (typeof window !== "undefined" && !window.matchMedia?.("(hover: hover)").matches) return;
    clearTimeout(t.current);
    t.current = setTimeout(() => { const r = el.getBoundingClientRect(); setPeek({ o, x: r.left + Math.min(360, r.width * 0.3), y: r.bottom - 6, top: r.top }); }, 350);
  }, []);
  const leave = useCallback(() => { clearTimeout(t.current); setPeek(null); }, []);
  useEffect(() => () => clearTimeout(t.current), []);
  return { peek, enter, leave };
}
export function OrderPeek({ peek, stageLabel, debtOf }) {
  if (!peek) return null;
  const { o } = peek;
  const W = 300, H = 290;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(8, Math.min(peek.x, vw - W - 12));
  const top = peek.y + H > vh - 8 ? Math.max(8, peek.top - H + 6) : peek.y;
  const photos = (o.photos || []).filter((p) => p && (p.thumbUrl || p.url));
  const debt = debtOf(o);
  return (
    <div data-testid="order-peek" className="uvix-peek" role="tooltip" style={{ position: "fixed", left, top, width: W, zIndex: 300, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 16, boxShadow: THEME.shadowLg, overflow: "hidden", pointerEvents: "none", color: THEME.text }}>
      <div style={{ height: 150 }}><OrderThumb order={o} size={W} radius={0} big /></div>
      <div style={{ padding: "11px 14px 12px" }}>
        <b style={{ fontSize: 15.5, display: "block", lineHeight: 1.25 }}>{orderTitle(o)}</b>
        <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>{o.customer || "—"} · {o.orderNumber}</div>
        {o.place && <div style={{ marginTop: 6 }}><PlaceTag place={o.place} /></div>}
        {photos.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            {photos.slice(1, 4).map((p) => <img key={p.id || p.url} src={p.thumbUrl || p.url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />)}
            {photos.length > 4 && <span style={{ fontSize: 12, color: THEME.muted }}>+{photos.length - 4} rasm</span>}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 13 }}>
          <span style={{ color: THEME.muted }}>{stageLabel || "—"}</span>
          {debt > 0 ? <b style={{ color: THEME.rose }}>qarz {fmt(debt)}</b> : <b style={{ color: THEME.green }}>to'langan</b>}
        </div>
      </div>
    </div>
  );
}

export const ORDER_VISUAL_CSS = `
  .uvix-pinbtn { width: 28px; height: 28px; border: 0; background: none; border-radius: 7px; display: inline-grid; place-items: center; cursor: pointer; flex-shrink: 0; opacity: .0; transition: opacity .15s ease, background .15s ease; }
  .uvix-pinbtn.on { opacity: 1; }
  tr:hover .uvix-pinbtn, .uvix-pinbtn:focus-visible { opacity: 1; }
  @media (hover: none) { .uvix-pinbtn { opacity: .55; } .uvix-pinbtn.on { opacity: 1; } }
  .uvix-pinbtn:hover { background: rgba(127,127,127,.12); }
  .uvix-pinpop { animation: uvixPinPop .36s cubic-bezier(.2,.8,.2,1); }
  @keyframes uvixPinPop { 40% { transform: scale(1.4) rotate(-14deg); } }
  .uvix-recent { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .uvix-recent-item { display: flex; align-items: center; gap: 9px; border-radius: 12px; padding: 6px 10px 6px 6px; min-width: 0; text-align: left; font-family: inherit; cursor: pointer; transition: box-shadow .15s ease, transform .15s ease; }
  .uvix-recent-item:hover { box-shadow: 0 4px 14px rgba(15,23,42,.1); transform: translateY(-1px); }
  @media (max-width: 860px) { .uvix-recent { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .uvix-peek { animation: uvixPeekIn .16s cubic-bezier(.2,.8,.2,1); transform-origin: left top; }
  @keyframes uvixPeekIn { from { opacity: 0; transform: translateY(6px) scale(.97); } }
  @media (prefers-reduced-motion: reduce) { .uvix-peek, .uvix-pinpop { animation: none; } .uvix-recent-item { transition: none; } }
`;
