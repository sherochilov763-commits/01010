// MoreSheet.jsx — telefonda «Yana»: barcha bo'limlar plitkalar ko'rinishida (qidiruv bilan).
// Plitkani ushlab turish — bo'limni pastki menyuga qo'shadi yoki olib tashlaydi. Kompyuter ko'rinishiga ta'sir qilmaydi.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, LogOut, Search, SlidersHorizontal, X } from "lucide-react";
import { NAV_GROUP, roleLabel } from "../constants.js";
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
  // iOS Sozlamalar uslubi: bo'limlar guruhlarda (Savdo · Moliya · Ishlab chiqarish · Boshqa)
  const groups = useMemo(() => {
    const order = ["Savdo", "Moliya", "Ishlab chiqarish", null];
    const by = new Map(order.map((g) => [g, []]));
    shown.forEach((n) => by.get(NAV_GROUP[n.key] || null).push(n));
    return order.map((g) => [g || (by.get(null).length && shown.length > by.get(null).length ? "Boshqa" : null), by.get(g)]).filter(([, l]) => l.length);
  }, [shown]);

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
        style={{ background: THEME.surface, borderTop: `1px solid ${THEME.border}`, boxShadow: THEME.shadowLg, color: THEME.text }}>
        <div {...drag} style={{ touchAction: "none", padding: "8px 18px 0", cursor: "grab" }}>
          <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: THEME.border2, margin: "0 auto" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 0" }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5 }}>Yana</div>
            <button type="button" onClick={onClose} aria-label="Yopish" style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: THEME.chip, color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 16px 0", padding: "0 12px", height: 42, borderRadius: 12, background: THEME.isDark ? THEME.card : "rgba(118,118,128,0.12)", color: THEME.muted }}>
          <Search size={18} />
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Bo'lim qidirish</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bo'lim qidirish" data-testid="more-search"
            style={{ flex: 1, minWidth: 0, height: 40, border: 0, outline: "none", background: "transparent", color: THEME.text, fontSize: 15, fontFamily: "inherit" }} />
        </label>

        {user && !q && (
          <div data-testid="more-profile" style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 16px 0", padding: "10px 12px", borderRadius: 14, background: THEME.card, border: `1px solid ${THEME.border}` }}>
            <Avatar name={user.name} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
              <div style={{ fontSize: 12.5, color: THEME.muted }}>{roleLabel(user.role)}</div>
            </div>
            {onLogout && <button type="button" onClick={onLogout} aria-label="Chiqish" title="Chiqish" data-testid="more-logout" style={{ ...pill(), width: 40, padding: 0, justifyContent: "center" }}><LogOut size={16} /></button>}
          </div>
        )}

        <div className="uvix-more-list">
          {groups.map(([g, list]) => (
            <div key={g || "-"}>
              {g && <div className="uvix-more-gh" style={{ color: THEME.muted }}>{g}</div>}
              <div className="uvix-more-group" style={{ background: THEME.card, border: `1px solid ${THEME.border}` }}>
                {list.map((n, i) => {
                  const Icon = n.icon;
                  const [fg] = tone(n.key);
                  const active = view === n.key;
                  const pinned = barKeys.includes(n.key);
                  const badge = badges?.[n.key];
                  return (
                    <button key={n.key} type="button" data-tile={n.key} data-pinned={pinned ? "1" : undefined} aria-current={active ? "page" : undefined}
                      onClick={() => clickTile(n)} onPointerDown={(e) => startPress(e, n)} onPointerMove={movePress} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}
                      onContextMenu={(e) => e.preventDefault()}
                      className="uvix-more-tile" style={{ color: THEME.text, borderTop: i ? `1px solid ${THEME.border}` : "0", background: active ? THEME.violetSoft : "transparent" }}>
                      <span className="uvix-more-icon" style={{ background: fg, color: "#fff" }}><Icon size={17} strokeWidth={2} /></span>
                      <span className="uvix-more-label" style={{ fontWeight: active ? 650 : 500 }}>{n.label}</span>
                      {pinned && <span className="uvix-more-pin" title="Pastki menyuda" style={{ color: THEME.violet, background: THEME.violetSoft }}>menyuda</span>}
                      {badge ? <span className="uvix-more-badge" data-testid={`tile-badge-${n.key}`} style={n.key === "chats" ? { background: THEME.roseSolid, color: "#fff" } : { background: THEME.roseBg, color: THEME.roseText }}>{badge > 99 ? "99+" : badge}</span> : null}
                      <ChevronRight size={16} color={THEME.dim} style={{ flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!shown.length && <div style={{ textAlign: "center", color: THEME.muted, fontSize: 14, padding: "18px 0" }}>Bunday bo'lim topilmadi</div>}
        </div>

        <div role="status" aria-live="polite" style={{ margin: "14px 16px 0", padding: "10px 12px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.4, background: flash ? THEME.violetSoft : "transparent", color: flash ? THEME.text : THEME.muted, border: flash ? "none" : `1px dashed ${THEME.border2}`, minHeight: 40 }} data-testid="more-hint">
          {flash || <>Qatorni <b style={{ color: THEME.text, fontWeight: 600 }}>ushlab turing</b> — bo'lim pastki menyuga qo'shiladi yoki olinadi. «menyuda» — pastki menyudagilar.</>}
        </div>

        {onEditMenu && (
          <div style={{ margin: "12px 16px 0" }}>
            <button type="button" onClick={onEditMenu} data-testid="more-edit-menu" style={{ ...pill(), width: "100%", justifyContent: "center", height: 46, borderRadius: 14 }}><SlidersHorizontal size={16} /> Pastki menyuni sozlash</button>
          </div>
        )}
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
  .uvix-more-list { padding: 4px 16px 0; }
  .uvix-more-gh { font-size: 12px; text-transform: uppercase; letter-spacing: .4px; padding: 14px 14px 6px; font-weight: 500; }
  .uvix-more-group { border-radius: 14px; overflow: hidden; }
  .uvix-more-tile { width: 100%; display: flex; align-items: center; gap: 12px; border: 0; padding: 0 12px; min-height: 48px; cursor: pointer; font-family: inherit; text-align: left;
    -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; transition: background .12s ease; }
  .uvix-more-tile:active { background: rgba(127,127,127,.12) !important; }
  .uvix-more-icon { position: relative; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .uvix-more-label { flex: 1; min-width: 0; font-size: 15.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .uvix-more-badge { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; font-size: 11.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .uvix-more-pin { font-size: 11px; font-weight: 700; border-radius: 6px; padding: 2px 6px; flex-shrink: 0; }
  @keyframes uvixSheetUp { from { transform: translateY(100%); } to { transform: none; } }
  @keyframes uvixFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .uvix-more-sheet, .uvix-more-backdrop { animation: none; } }
`;
