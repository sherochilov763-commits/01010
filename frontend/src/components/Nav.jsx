// Nav.jsx — menyuni moslashtirish: joylashuv (chap / ixcham / tepa), tartib, yashirish, telefon pastki paneli.
// Admin hamma uchun standartni belgilaydi (settings.navDefaults), har xodim o'zi uchun o'zgartira oladi (/api/me/nav).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, GripVertical, LogOut, PanelLeft, PanelTop, Columns2, SlidersHorizontal, RotateCcw, Check } from "lucide-react";
import { NAV, roleLabel } from "../constants.js";
import { fetchMyNav, saveMyNav } from "../storage.js";
import { THEME } from "../theme.js";

export const NAV_SHORT = {
  dashboard: "Asosiy", orders: "Buyurtma", crm: "CRM", chats: "Chatlar", expense: "Rasxod",
  operations: "Operatsiya", report: "Hisobot", categories: "Kategoriya", employees: "Xodimlar", attendance: "Davomat", paint: "Bo'yoq", settings: "Sozlama",
};
const ALL_KEYS = NAV.map((n) => n.key);
const DEFAULT_BAR = ["dashboard", "orders", "expense", "crm"];
export const LAYOUTS = [
  { key: "side", label: "Chap", title: "Chap panel", icon: PanelLeft },
  { key: "rail", label: "Ixcham", title: "Ixcham panel (faqat ikonlar)", icon: Columns2 },
  { key: "top", label: "Tepa", title: "Tepa panel (gorizontal)", icon: PanelTop },
];

export function normalizeNav(p) {
  const src = p && typeof p === "object" ? p : {};
  const order = [...(src.order || []).filter((k) => ALL_KEYS.includes(k)), ...ALL_KEYS.filter((k) => !(src.order || []).includes(k))];
  const hidden = (src.hidden || []).filter((k) => ALL_KEYS.includes(k) && k !== "settings");
  let mobileBar = (src.mobileBar || []).filter((k) => ALL_KEYS.includes(k)).slice(0, 4);
  if (!mobileBar.length) mobileBar = DEFAULT_BAR;
  return { layout: ["side", "rail", "top"].includes(src.layout) ? src.layout : "side", order: [...new Set(order)], hidden, mobileBar };
}

// ---------------- Holat ----------------
export function useNavPrefs({ currentUser, settings, onSaveSettings, isAdmin }) {
  const [mine, setMine] = useState(null);
  const [globalDraft, setGlobalDraft] = useState(null); // admin "Hamma uchun" tahrirlayotganda darhol ko'rinishi uchun
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState("mine"); // "mine" | "global" (faqat admin)
  const timer = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let alive = true;
    setMine(null);
    if (currentUser?.id) fetchMyNav().then((p) => alive && setMine(p)).catch(() => {});
    return () => { alive = false; };
  }, [currentUser?.id]);
  useEffect(() => { setGlobalDraft(null); }, [settings?.navDefaults]);

  const globalPrefs = useMemo(() => globalDraft || normalizeNav(settings?.navDefaults), [globalDraft, settings?.navDefaults]);
  const minePrefs = useMemo(() => (mine ? normalizeNav(mine) : null), [mine]);
  const editingGlobal = editing && isAdmin && scope === "global";
  const prefs = editingGlobal ? globalPrefs : (minePrefs || globalPrefs);

  const byKey = Object.fromEntries(NAV.map((n) => [n.key, n]));
  const allowed = (n) => n && (!n.adminOnly || isAdmin);
  const editorItems = prefs.order.map((k) => byKey[k]).filter(allowed);
  const items = editorItems.filter((n) => !prefs.hidden.includes(n.key));
  const mobileBar = prefs.mobileBar.filter((k) => allowed(byKey[k]));

  function update(fn) {
    const next = normalizeNav(fn(prefs));
    clearTimeout(timer.current);
    if (editingGlobal) {
      setGlobalDraft(next);
      timer.current = setTimeout(() => onSaveSettings({ ...settingsRef.current, navDefaults: next }), 350);
    } else {
      setMine(next);
      timer.current = setTimeout(() => saveMyNav(next).catch(() => {}), 400);
    }
  }
  function reset() {
    clearTimeout(timer.current);
    if (editingGlobal) {
      setGlobalDraft(normalizeNav({}));
      onSaveSettings({ ...settingsRef.current, navDefaults: null });
    } else {
      setMine(null);
      saveMyNav(null).catch(() => {});
    }
  }

  return {
    layout: prefs.layout, items, editorItems, hidden: prefs.hidden, mobileBar,
    editing, setEditing, scope, setScope, isAdmin, hasMine: !!mine, update, reset,
  };
}

// ---------------- Tahrirlovchi ro'yxat (menyuning o'zida) ----------------
function useDragList(onMove) {
  const drag = useRef(null);
  const [dragKey, setDragKey] = useState(null);
  function onPointerDown(e, key) {
    e.preventDefault();
    drag.current = key;
    setDragKey(key);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-navkey]");
    const over = el?.getAttribute("data-navkey");
    if (over && over !== drag.current) onMove(drag.current, over);
  }
  function onPointerUp() { drag.current = null; setDragKey(null); }
  return { dragKey, onPointerDown, onPointerMove, onPointerUp };
}

export function NavEditor({ nav, showLayout = true }) {
  const d = useDragList((from, to) => nav.update((p) => {
    const order = p.order.filter((k) => k !== from);
    const i = order.indexOf(to);
    const fromIdx = p.order.indexOf(from), toIdx = p.order.indexOf(to);
    order.splice(fromIdx < toIdx ? i + 1 : i, 0, from);
    return { ...p, order };
  }));
  const toggleHidden = (key) => nav.update((p) => ({ ...p, hidden: p.hidden.includes(key) ? p.hidden.filter((k) => k !== key) : [...p.hidden, key] }));
  const toggleBar = (key) => nav.update((p) => {
    const bar = p.mobileBar.includes(key) ? p.mobileBar.filter((k) => k !== key) : [...p.mobileBar, key].slice(-4);
    return { ...p, mobileBar: bar };
  });
  const move = (key, dir) => nav.update((p) => {
    const order = [...p.order];
    const i = order.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= order.length) return p;
    [order[i], order[j]] = [order[j], order[i]];
    return { ...p, order };
  });

  const seg = (active) => ({
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 4px", border: 0, borderRadius: 8,
    fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    background: active ? THEME.violet : "transparent", color: active ? "#fff" : "#9C96BA",
  });
  const label = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#837DA3", margin: "14px 4px 6px" };

  return (
    <div className="uvix-naveditor" onPointerMove={d.onPointerMove} onPointerUp={d.onPointerUp} onPointerCancel={d.onPointerUp}>
      {nav.isAdmin && (
        <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "rgba(255,255,255,0.06)", marginBottom: 4 }}>
          <button type="button" style={seg(nav.scope === "mine")} onClick={() => nav.setScope("mine")}>Men uchun</button>
          <button type="button" style={seg(nav.scope === "global")} onClick={() => nav.setScope("global")}>Hamma uchun</button>
        </div>
      )}
      {nav.isAdmin && nav.scope === "global" && (
        <div style={{ fontSize: 11, color: "#9C96BA", margin: "4px 4px 0", lineHeight: 1.4 }}>O'z menyusini o'zgartirmagan barcha xodimlarga qo'llanadi.</div>
      )}

      {showLayout && (
        <>
          <div style={label} className="uvix-naveditor-layouts">Joylashuv</div>
          <div className="uvix-naveditor-layouts" style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "rgba(255,255,255,0.06)" }}>
            {LAYOUTS.map((l) => {
              const I = l.icon;
              return (
                <button key={l.key} type="button" data-layout={l.key} style={seg(nav.layout === l.key)} onClick={() => nav.update((p) => ({ ...p, layout: l.key }))} title={l.title}>
                  <I size={13} /> {l.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div style={label}>Bo'limlar — sudrang yoki yashiring</div>
      <div role="list" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {nav.editorItems.map((n, idx) => {
          const Icon = n.icon;
          const isHidden = nav.hidden.includes(n.key);
          const locked = n.key === "settings";
          return (
            <div key={n.key} role="listitem" data-navkey={n.key} className="uvix-naveditor-row"
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 2px", borderRadius: 10,
                background: d.dragKey === n.key ? "rgba(124,92,252,0.22)" : "rgba(255,255,255,0.03)",
                opacity: isHidden ? 0.45 : 1, transition: "background .15s",
              }}>
              <span className="uvix-grip" onPointerDown={(e) => d.onPointerDown(e, n.key)} aria-hidden="true"
                style={{ cursor: "grab", touchAction: "none", color: "#6F6992", display: "flex", padding: "4px 2px" }}>
                <GripVertical size={15} />
              </span>
              <Icon size={15} color={isHidden ? "#6F6992" : "#C9C2E4"} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: isHidden ? "#6F6992" : "#fff", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: isHidden ? "line-through" : "none" }}>{n.label}</span>
              <button type="button" className="uvix-sr-move" onClick={() => move(n.key, -1)} disabled={idx === 0} aria-label={`${n.label}ni yuqoriga`}>↑</button>
              <button type="button" className="uvix-sr-move" onClick={() => move(n.key, 1)} disabled={idx === nav.editorItems.length - 1} aria-label={`${n.label}ni pastga`}>↓</button>
              <button type="button" onClick={() => !locked && toggleHidden(n.key)} disabled={locked}
                aria-label={isHidden ? `${n.label}ni ko'rsatish` : `${n.label}ni yashirish`} title={locked ? "Sozlamalarni yashirib bo'lmaydi" : isHidden ? "Ko'rsatish" : "Yashirish"}
                style={{ background: "none", border: 0, padding: 4, cursor: locked ? "default" : "pointer", color: locked ? "#4A4468" : isHidden ? "#6F6992" : "#C9C2E4", display: "flex" }}>
                {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          );
        })}
      </div>

      <div style={label}>Telefon pastki paneli — 4 ta tanlang</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {nav.editorItems.map((n) => {
          const i = nav.mobileBar.indexOf(n.key);
          const on = i >= 0;
          return (
            <button key={n.key} type="button" data-barkey={n.key} onClick={() => toggleBar(n.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                fontSize: 11.5, fontWeight: 600, border: on ? `1px solid ${THEME.violet}` : "1px solid rgba(255,255,255,0.12)",
                background: on ? "rgba(124,92,252,0.22)" : "transparent", color: on ? "#fff" : "#9C96BA",
              }}>
              {on && <span style={{ width: 15, height: 15, borderRadius: "50%", background: THEME.violet, color: "#fff", fontSize: 9.5, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>}
              {NAV_SHORT[n.key] || n.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
        <button type="button" onClick={nav.reset} title="Standartga qaytarish"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "none", color: "#C9C2E4", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <RotateCcw size={13} /> {nav.scope === "global" && nav.isAdmin ? "Asl holat" : "Standart"}
        </button>
        <button type="button" onClick={() => nav.setEditing(false)} className="uvix-naveditor-done"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", borderRadius: 10, border: 0, background: THEME.violet, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          <Check size={15} /> Tayyor
        </button>
      </div>
    </div>
  );
}

export function EditNavButton({ nav, compact = false }) {
  return (
    <button type="button" onClick={() => nav.setEditing(!nav.editing)} className="uvix-editnav" title="Menyuni sozlash" aria-label="Menyuni sozlash" aria-pressed={nav.editing}
      style={{
        display: "flex", alignItems: "center", justifyContent: compact ? "center" : "flex-start", gap: 8, width: compact ? 44 : "100%",
        height: compact ? 40 : "auto", padding: compact ? 0 : "8px 13px", borderRadius: 10, border: 0, cursor: "pointer", fontFamily: "inherit",
        background: nav.editing ? "rgba(124,92,252,0.22)" : "transparent", color: nav.editing ? "#fff" : "#837DA3", fontSize: 12.5, fontWeight: 600,
      }}>
      <SlidersHorizontal size={15} /> {!compact && "Menyuni sozlash"}
    </button>
  );
}

const Logo = ({ size = 36 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.3, background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(124,92,252,0.35)" }}>
    <span style={{ color: "#fff", fontWeight: 800, fontSize: size * 0.36 }}>UV</span>
  </div>
);

// ---------------- Ixcham panel (faqat ikonlar) ----------------
export function RailNav({ nav, view, setView, user, onLogout }) {
  return (
    <aside className="uvix-rail no-print" style={{ background: THEME.ink }}>
      <div style={{ padding: "18px 0 16px" }}><Logo size={38} /></div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", flex: 1 }} aria-label="Asosiy menyu">
        {nav.items.map((n) => {
          const Icon = n.icon;
          const active = view === n.key;
          return (
            <button key={n.key} type="button" onClick={() => setView(n.key)} data-label={n.label} aria-label={n.label}
              className={`uvix-rail-item uvix-nav-item${active ? " uvix-nav-active" : ""}`}
              style={{ background: active ? THEME.violet : "transparent", color: active ? "#fff" : "#9C96BA", boxShadow: active ? "0 4px 14px rgba(124,92,252,0.35)" : "none" }}>
              <Icon size={19} />
            </button>
          );
        })}
      </nav>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "10px 0 16px" }}>
        <EditNavButton nav={nav} compact />
        <div title={`${user.name} · ${roleLabel(user.role)}`} style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <button type="button" onClick={onLogout} title="Chiqish" aria-label="Chiqish" className="uvix-rail-item" data-label="Chiqish" style={{ background: "none", color: "#837DA3", width: 36, height: 36 }}>
          <LogOut size={16} />
        </button>
      </div>
      {nav.editing && (
        <div className="uvix-navpanel" style={{ left: 88, top: 12, background: THEME.ink }}>
          <NavEditor nav={nav} />
        </div>
      )}
    </aside>
  );
}

// ---------------- Tepa panel (gorizontal), sig'maganlari "Yana" ichida ----------------
export function TopNav({ nav, view, setView, user, onLogout }) {
  const wrap = useRef(null);
  const measure = useRef(null);
  const [fit, setFit] = useState(nav.items.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const keysSig = nav.items.map((n) => n.key).join(",");

  useLayoutEffect(() => {
    const calc = () => {
      const box = wrap.current, m = measure.current;
      if (!box || !m) return;
      const avail = box.clientWidth;
      const widths = [...m.children].map((c) => c.getBoundingClientRect().width + 4);
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= avail) return setFit(widths.length);
      const moreW = 96;
      let used = 0, n = 0;
      for (const w of widths) { if (used + w + moreW > avail) break; used += w; n++; }
      setFit(Math.max(1, n));
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [keysSig]);

  useEffect(() => {
    if (!moreOpen && !userOpen) return;
    const close = (e) => { if (!e.target.closest?.(".uvix-topnav-pop, .uvix-topnav-popbtn")) { setMoreOpen(false); setUserOpen(false); } };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen, userOpen]);

  const shown = nav.items.slice(0, fit);
  const rest = nav.items.slice(fit);
  const restActive = rest.some((n) => n.key === view);
  const item = (n, inMenu = false) => {
    const Icon = n.icon;
    const active = view === n.key;
    return (
      <button key={n.key} type="button" onClick={() => { setView(n.key); setMoreOpen(false); }}
        className={`${inMenu ? "uvix-topnav-menuitem" : "uvix-topnav-item"} uvix-nav-item${active ? " uvix-nav-active" : ""}`}
        style={inMenu
          ? { color: active ? "#fff" : "#C9C2E4", background: active ? THEME.violet : "transparent" }
          : { color: active ? "#fff" : "#9C96BA", background: active ? THEME.violet : "transparent", boxShadow: active ? "0 4px 14px rgba(124,92,252,0.35)" : "none", fontWeight: active ? 700 : 500 }}>
        <Icon size={16} /> {n.label}
      </button>
    );
  };

  return (
    <header className="uvix-topnav no-print" style={{ background: THEME.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Logo size={34} />
        <div className="uvix-topnav-brand" style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>UVIX</div>
      </div>
      <nav ref={wrap} className="uvix-topnav-items" aria-label="Asosiy menyu">
        {shown.map((n) => item(n))}
        {rest.length > 0 && (
          <div style={{ position: "relative" }}>
            <button type="button" className="uvix-topnav-item uvix-topnav-popbtn" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
              style={{ color: restActive ? "#fff" : "#9C96BA", background: restActive ? "rgba(124,92,252,0.35)" : "transparent" }}>
              Yana <ChevronDown size={14} />
            </button>
            {moreOpen && (
              <div className="uvix-topnav-pop" style={{ background: THEME.ink, left: 0 }}>
                {rest.map((n) => item(n, true))}
              </div>
            )}
          </div>
        )}
        {/* o'lchash uchun ko'rinmas nusxa */}
        <div ref={measure} aria-hidden="true" style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", display: "flex", gap: 4, left: 0, top: 0 }}>
          {nav.items.map((n) => { const Icon = n.icon; return <span key={n.key} className="uvix-topnav-item" style={{ fontWeight: 700 }}><Icon size={16} /> {n.label}</span>; })}
        </div>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, position: "relative" }}>
        <EditNavButton nav={nav} compact />
        <button type="button" className="uvix-topnav-popbtn" onClick={() => setUserOpen((v) => !v)} aria-label="Profil"
          style={{ width: 34, height: 34, borderRadius: "50%", border: 0, cursor: "pointer", background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, color: "#fff", fontWeight: 700, fontSize: 12.5 }}>
          {user.name.slice(0, 1).toUpperCase()}
        </button>
        {userOpen && (
          <div className="uvix-topnav-pop" style={{ background: THEME.ink, right: 0, minWidth: 200 }}>
            <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 4 }}>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{user.name}</div>
              <div style={{ color: "#837DA3", fontSize: 11.5 }}>{roleLabel(user.role)}</div>
            </div>
            <button type="button" className="uvix-topnav-menuitem" onClick={onLogout} style={{ color: "#C9C2E4" }}><LogOut size={15} /> Chiqish</button>
          </div>
        )}
        {nav.editing && (
          <div className="uvix-navpanel" style={{ right: 0, top: 46, background: THEME.ink }}>
            <NavEditor nav={nav} />
          </div>
        )}
      </div>
    </header>
  );
}

// App'ning <style> blokiga qo'shiladi
export const NAV_CSS = `
  .uvix-rail { width: 76px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; position: sticky; top: 0; height: 100vh; z-index: 60; }
  .uvix-rail-item { position: relative; width: 46px; height: 46px; border: 0; border-radius: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s; }
  .uvix-rail-item:not(.uvix-nav-active):hover { background: rgba(255,255,255,0.07) !important; color: #fff !important; }
  .uvix-rail-item:hover::after {
    content: attr(data-label); position: absolute; left: calc(100% + 12px); top: 50%; transform: translateY(-50%);
    background: #1D1733; color: #fff; font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 8px; white-space: nowrap;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35); pointer-events: none; z-index: 5;
  }
  .uvix-topnav { position: sticky; top: 0; z-index: 90; display: flex; align-items: center; gap: 18px; height: 62px; padding: 0 20px; box-shadow: 0 1px 0 rgba(255,255,255,0.05); }
  .uvix-topnav-items { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; }
  .uvix-topnav-item { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 13px; border: 0; border-radius: 11px; cursor: pointer; font-size: 13.5px; white-space: nowrap; font-family: inherit; flex-shrink: 0; transition: background .15s; }
  .uvix-topnav-item:not(.uvix-nav-active):hover { background: rgba(255,255,255,0.07) !important; color: #fff !important; }
  .uvix-topnav-pop { position: absolute; top: calc(100% + 8px); z-index: 120; padding: 6px; border-radius: 14px; min-width: 190px; box-shadow: 0 16px 40px rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 2px; }
  .uvix-topnav-menuitem { display: flex; align-items: center; gap: 9px; width: 100%; padding: 9px 10px; border: 0; border-radius: 10px; cursor: pointer; font-size: 13px; font-family: inherit; text-align: left; }
  .uvix-topnav-menuitem:not(.uvix-nav-active):hover { background: rgba(255,255,255,0.07) !important; }
  .uvix-navpanel { position: absolute; z-index: 130; width: 300px; max-height: calc(100vh - 80px); overflow-y: auto; padding: 14px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
  .uvix-rail .uvix-navpanel { position: fixed; }
  .uvix-naveditor .uvix-sr-move { opacity: 0; transition: opacity .15s; }
  .uvix-naveditor-row:hover .uvix-sr-move, .uvix-naveditor-row:focus-within .uvix-sr-move { opacity: 1; }
  .uvix-naveditor .uvix-sr-move:focus-visible { opacity: 1; }
  @media (hover: none) { .uvix-naveditor .uvix-sr-move { display: none; } }
  .uvix-naveditor .uvix-sr-move { width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: #6F6992; cursor: pointer; font-size: 12px; padding: 0; }
  .uvix-naveditor .uvix-sr-move:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #fff; }
  .uvix-naveditor-row:hover .uvix-sr-move:disabled { opacity: .25; cursor: default; }
  .uvix-shell.uvix-layout-top { flex-direction: column; }
  @media (min-width: 861px) {
    .uvix-layout-rail .uvix-sidebar, .uvix-layout-top .uvix-sidebar { display: none !important; }
  }
  @media (max-width: 860px) {
    .uvix-rail, .uvix-topnav { display: none !important; }
    .uvix-shell.uvix-layout-top { flex-direction: row; }
    .uvix-naveditor-layouts { display: none !important; }
  }
`;
