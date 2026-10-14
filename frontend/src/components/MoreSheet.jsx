// MoreSheet.jsx — telefonda «Yana»: barcha bo'limlar plitkalar ko'rinishida (qidiruv bilan).
// Plitkani ushlab turish — bo'limni pastki menyuga qo'shadi yoki olib tashlaydi. Kompyuter ko'rinishiga ta'sir qilmaydi.
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Search, SlidersHorizontal, X } from "lucide-react";
import { roleLabel } from "../constants.js";
import { THEME } from "../theme.js";
import { Avatar } from "./ui.jsx";
import { NAV_SHORT } from "./Nav.jsx";
import { useBackToClose } from "../lib/history.js";
import { useSheetDrag } from "../lib/sheetDrag.js";

// Qidiruvda bo'lim nomidan tashqari mos keladigan so'zlar
const KEYWORDS = {
  dashboard: "asosiy bosh sahifa bugun statistika",
  orders: "buyurtma zakaz smeta",
  crm: "lid mijoz savdo voronka",
  chats: "telegram xabar chat yozishma",
  customers: "mijoz klient qarzdor",
  expense: "rasxod xarajat pul chiqim",
  operations: "operatsiya pul kirim chiqim to'lov kassa",
  report: "hisobot foyda pul",
  categories: "kategoriya material",
  employees: "xodim ishchi hodim",
  paint: "bo'yoq kraska ombor",
  attendance: "davomat keldi ketdi xodim",
  settings: "sozlama mavzu telegram profil",
};
const norm = (s) => String(s || "").toLowerCase().replace(/[ʻʼ‘’`']/g, "'");

function tone(key) {
  const T = THEME;
  const map = {
    dashboard: [T.violet, T.violetSoft], orders: [T.blue, T.blueBg], crm: [T.cyan, T.cyanBg], chats: [T.blue, T.blueBg],
    customers: [T.green, T.greenBg], expense: [T.rose, T.roseBg], operations: [T.amber, T.amberBg], report: [T.cyan, T.cyanBg],
    employees: [T.blue, T.blueBg], paint: [T.rose, T.roseBg], attendance: [T.green, T.greenBg],
  };
  return map[key] || [T.mutedDark, T.chip];
}

export function MoreSheet({ items, barKeys, view, badges, user, onNavigate, onToggleBar, onEditMenu, onLogout, onClose }) {
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState("");
  const sheetRef = useRef(null);
  const drag = useSheetDrag(onClose, sheetRef);
  const press = useRef(null);
  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(""), 2600); return () => clearTimeout(t); }, [flash]);

  const shown = useMemo(() => {
    const s = norm(q).trim();
    if (!s) return items;
    return items.filter((n) => norm(`${n.label} ${NAV_SHORT[n.key] || ""} ${KEYWORDS[n.key] || ""}`).includes(s));
  }, [items, q]);

  // Ushlab turish (≈0,45 s) — pastki menyuga qo'shish/olib tashlash
  function startPress(e, n) {
    if (e.button > 0 || !onToggleBar) return;
    const x = e.clientX, y = e.clientY;
    clearTimeout(press.current?.t);
    press.current = {
      x, y, fired: false,
      t: setTimeout(() => {
        press.current.fired = true;
        const inBar = barKeys.includes(n.key);
        const label = NAV_SHORT[n.key] || n.label;
        onToggleBar(n.key);
        setFlash(inBar ? `«${label}» pastki menyudan olindi` : barKeys.length >= 4 ? `«${label}» pastki menyuga qo'shildi (eng eskisi o'rniga)` : `«${label}» pastki menyuga qo'shildi`);
        try { navigator.vibrate?.(12); } catch { /* */ }
      }, 450),
    };
  }
  function movePress(e) {
    const p = press.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { clearTimeout(p.t); press.current = null; }
  }
  function endPress() { const p = press.current; if (p && !p.fired) { clearTimeout(p.t); press.current = null; } }
  function clickTile(n) {
    if (press.current?.fired) { press.current = null; return; }
    onNavigate(n.key);
    onClose();
  }

  return (
    <>
      <div className="uvix-more-backdrop" onClick={onClose} />
      <div ref={sheetRef} className="uvix-more-sheet" role="dialog" aria-modal="true" aria-label="Barcha bo'limlar" data-testid="more-sheet"
        style={{ background: THEME.card, borderTop: `1px solid ${THEME.border}`, boxShadow: THEME.shadowLg, color: THEME.text }}>
        <div {...drag} style={{ touchAction: "none", padding: "8px 18px 0", cursor: "grab" }}>
          <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: THEME.border2, margin: "0 auto" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 0" }}>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3 }}>Barcha bo'limlar</div>
            <button type="button" onClick={onClose} aria-label="Yopish" style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: THEME.chip, color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 18px 0", padding: "0 12px", height: 44, borderRadius: 12, background: THEME.chip, color: THEME.muted }}>
          <Search size={18} />
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Bo'lim qidirish</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bo'lim qidirish" data-testid="more-search"
            style={{ flex: 1, minWidth: 0, height: 40, border: 0, outline: "none", background: "transparent", color: THEME.text, fontSize: 15, fontFamily: "inherit" }} />
        </label>

        <div className="uvix-more-grid">
          {shown.map((n) => {
            const Icon = n.icon;
            const [fg, bg] = tone(n.key);
            const active = view === n.key;
            const pinned = barKeys.includes(n.key);
            const badge = badges?.[n.key];
            return (
              <button key={n.key} type="button" data-tile={n.key} data-pinned={pinned ? "1" : undefined} aria-current={active ? "page" : undefined}
                onClick={() => clickTile(n)} onPointerDown={(e) => startPress(e, n)} onPointerMove={movePress} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
                onContextMenu={(e) => e.preventDefault()}
                className="uvix-more-tile" style={{ color: THEME.text }}>
                <span className="uvix-more-icon" style={{ background: bg, color: fg, boxShadow: active ? `0 0 0 2px ${THEME.violet}` : "none" }}>
                  <Icon size={24} strokeWidth={1.9} />
                  {badge ? <span className="uvix-more-badge" data-testid={`tile-badge-${n.key}`} style={n.key === "chats" ? { background: THEME.roseSolid, color: "#fff", border: `2px solid ${THEME.card}` } : { background: THEME.roseBg, color: THEME.roseText, border: `2px solid ${THEME.card}` }}>{badge > 99 ? "99+" : badge}</span> : null}
                  {pinned && <span className="uvix-more-pin" title="Pastki menyuda" style={{ background: THEME.violet, border: `2px solid ${THEME.card}` }} />}
                </span>
                <span className="uvix-more-label" style={{ fontWeight: active ? 700 : 600 }}>{n.label}</span>
              </button>
            );
          })}
          {!shown.length && <div style={{ gridColumn: "1 / -1", textAlign: "center", color: THEME.muted, fontSize: 14, padding: "18px 0" }}>Bunday bo'lim topilmadi</div>}
        </div>

        <div role="status" aria-live="polite" style={{ margin: "14px 18px 0", padding: "10px 12px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.4, background: flash ? THEME.violetSoft : "transparent", color: flash ? THEME.text : THEME.muted, border: flash ? "none" : `1px dashed ${THEME.border2}`, minHeight: 40 }} data-testid="more-hint">
          {flash || <>Plitkani <b style={{ color: THEME.text, fontWeight: 600 }}>ushlab turing</b> — bo'lim pastki menyuga qo'shiladi yoki olinadi. Nuqta — pastki menyudagilar.</>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 18px 0", padding: "12px 0 0", borderTop: `1px solid ${THEME.border}` }}>
          <Avatar name={user?.name} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: THEME.muted }}>{roleLabel(user?.role)}</div>
          </div>
          {onEditMenu && (
            <button type="button" onClick={onEditMenu} data-testid="more-edit-menu" style={pill()}><SlidersHorizontal size={15} /> Menyuni sozlash</button>
          )}
          {onLogout && <button type="button" onClick={onLogout} aria-label="Chiqish" title="Chiqish" data-testid="more-logout" style={{ ...pill(), width: 40, padding: 0, justifyContent: "center" }}><LogOut size={16} /></button>}
        </div>
      </div>
    </>
  );
}
const pill = () => ({ height: 40, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 11, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 });

export const MORE_SHEET_CSS = `
  .uvix-more-backdrop { position: fixed; inset: 0; z-index: 215; background: rgba(9,9,11,0.38); animation: uvixFadeIn .18s ease; }
  .uvix-more-sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 220; max-height: calc(100dvh - 40px); overflow-y: auto; overscroll-behavior: contain;
    border-radius: 22px 22px 0 0; padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px));
    animation: uvixSheetUp .24s cubic-bezier(.16,1,.3,1);
  }
  @media (min-width: 640px) { .uvix-more-sheet { width: 560px; margin: 0 auto; } }
  .uvix-more-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 6px; padding: 18px 12px 0; }
  .uvix-more-tile { display: flex; flex-direction: column; align-items: center; gap: 7px; border: 0; background: none; padding: 0; cursor: pointer; font-family: inherit;
    -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; min-width: 0; }
  .uvix-more-icon { position: relative; width: 58px; height: 58px; border-radius: 17px; display: flex; align-items: center; justify-content: center; transition: transform .12s ease; }
  .uvix-more-tile:active .uvix-more-icon { transform: scale(.93); }
  .uvix-more-label { font-size: 12px; line-height: 1.2; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .uvix-more-badge { position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; font-size: 10.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .uvix-more-pin { position: absolute; bottom: -3px; right: -3px; width: 12px; height: 12px; border-radius: 50%; }
  @keyframes uvixSheetUp { from { transform: translateY(100%); } to { transform: none; } }
  @keyframes uvixFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .uvix-more-sheet, .uvix-more-backdrop { animation: none; } }
`;
