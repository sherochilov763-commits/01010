// DashboardEditor.jsx — dashboardni kartalarning o'zida sozlash:
//  • har karta pastki o'ng burchagidagi shesterenka: o'lcham, rang, joyi, yashirish
//  • tutqichdan sudrab joyini almashtirish (sichqoncha va barmoq bilan)
//  • yashirilgan kartalar — "+ Ko'rsatkich qo'shish" galereyasida
//  • administrator: "Hamma uchun" yoki "Faqat men uchun"; boshqa xodimlar — faqat o'zi uchun
//  • telefonda karta ustida uzoq bosib turish — tahrirlash rejimi va shu karta menyusi
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, EyeOff, GripHorizontal, MoreHorizontal, Plus, RotateCcw, Settings2, X } from "lucide-react";
import { DASHBOARD_GROUPS, DASHBOARD_SIZE_LABELS, DASHBOARD_WIDGET_CATALOG } from "../../constants.js";
import { getEffectiveDashboardLayout } from "../../lib/finance.js";
import { fetchMyDashboard, saveMyDashboard } from "../../storage.js";
import { CARD_COLORS, readableOn } from "../../components/CardStyleMenu.jsx";
import { THEME } from "../../theme.js";

const catalogOf = (id) => DASHBOARD_WIDGET_CATALOG.find((c) => c.id === id);
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ---------------- holat: umumiy + shaxsiy ko'rinish ---------------- */
export function useDashboardConfig({ settings, onSaveSettings, isAdmin }) {
  const [prefs, setPrefs] = useState(undefined); // undefined — yuklanmoqda, null — shaxsiy ko'rinish yo'q
  const [scope, setScope] = useState(isAdmin ? "all" : "me"); // qaysi ko'rinishni tahrirlayapmiz
  const saveTimer = useRef(null);
  useEffect(() => { fetchMyDashboard().then((p) => setPrefs(p || null)).catch(() => setPrefs(null)); }, []);
  useEffect(() => { if (!isAdmin) setScope("me"); }, [isAdmin]);

  const global = { layout: getEffectiveDashboardLayout(settings), cardStyles: settings?.cardStyles || {} };
  const mine = prefs ? { layout: getEffectiveDashboardLayout({ dashboardLayout: prefs.layout }), cardStyles: prefs.cardStyles || {} } : null;
  const shown = mine || global; // ekranda: shaxsiy bo'lsa — shaxsiy, bo'lmasa — umumiy
  const editing = scope === "all" ? global : (mine || global);

  const commit = useCallback((next) => {
    if (scope === "all") {
      onSaveSettings?.({ ...settings, dashboardLayout: next.layout, cardStyles: next.cardStyles });
    } else {
      setPrefs(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveMyDashboard(next).catch(() => {}), 400);
    }
  }, [scope, settings, onSaveSettings]);

  const update = useCallback((fn) => { const next = clone(editing); fn(next); commit(next); }, [editing, commit]);
  const resetMine = () => { setPrefs(null); saveMyDashboard(null).catch(() => {}); };
  const resetGlobal = () => onSaveSettings?.({ ...settings, dashboardLayout: undefined, cardStyles: {} });

  return { shown, editing, scope, setScope, hasMine: !!prefs, update, resetMine, resetGlobal, ready: prefs !== undefined };
}

/* ---------------- tahrirlash paneli ---------------- */
export function EditToolbar({ isAdmin, cfg, onDone, onAdd, hiddenCount }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  useOutside(ref, menu, () => setMenu(false));
  const seg = (on) => ({ height: 32, padding: "0 12px", borderRadius: 9, border: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: on ? THEME.violet : "transparent", color: on ? THEME.onPrimary : THEME.text });
  return (
    <div role="toolbar" aria-label="Dashboardni tahrirlash" className="uvix-edit-toolbar" style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", width: "min(980px, calc(100vw - 300px))", zIndex: 170, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "10px 12px", borderRadius: 16, background: THEME.card, border: `1px solid ${THEME.violet}66`, boxShadow: "0 14px 34px rgba(0,0,0,0.28)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <Settings2 size={16} color={THEME.violet} /> Tahrirlash
      </div>
      {isAdmin ? (
        <div style={{ display: "inline-flex", padding: 3, borderRadius: 11, background: THEME.surface }}>
          <button type="button" style={seg(cfg.scope === "all")} onClick={() => cfg.setScope("all")}>Hamma uchun</button>
          <button type="button" style={seg(cfg.scope === "me")} onClick={() => cfg.setScope("me")}>Faqat men uchun</button>
        </div>
      ) : (
        <span style={{ fontSize: 12, color: THEME.muted }}>O'zgarishlar faqat sizda ko'rinadi</span>
      )}
      <span className="uvix-edit-hint" style={{ fontSize: 12, color: THEME.muted }}>Tutqichdan sudrang · shesterenka — o'lcham va rang</span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={onAdd} style={{ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${THEME.border}`, background: "transparent", color: THEME.text, fontWeight: 700, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={15} /><span className="uvix-add-long">Ko'rsatkich qo'shish</span><span className="uvix-add-short">Qo'shish</span>{hiddenCount ? <span style={{ fontSize: 11, color: THEME.violet, background: THEME.violetSoft, borderRadius: 10, padding: "1px 7px" }}>{hiddenCount}</span> : null}
        </button>
        <div ref={ref} style={{ position: "relative" }}>
          <button type="button" aria-label="Boshqa amallar" aria-expanded={menu} onClick={() => setMenu((v) => !v)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: "transparent", color: THEME.text, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <MoreHorizontal size={17} />
          </button>
          {menu && (
            <div role="menu" style={{ position: "absolute", right: 0, top: 42, width: 240, padding: 6, borderRadius: 12, background: THEME.card, border: `1px solid ${THEME.border}`, boxShadow: "0 16px 40px rgba(0,0,0,0.35)", zIndex: 5 }}>
              {cfg.scope === "me" && cfg.hasMine && (
                <MenuItem onClick={() => { cfg.resetMine(); setMenu(false); }} icon={RotateCcw} text="Umumiy ko'rinishga qaytish" />
              )}
              {cfg.scope === "all" && isAdmin && (
                <MenuItem onClick={() => { cfg.resetGlobal(); setMenu(false); }} icon={RotateCcw} text="Standart ko'rinishga qaytarish" />
              )}
              {cfg.scope === "me" && !cfg.hasMine && <div style={{ padding: "8px 10px", fontSize: 12, color: THEME.muted }}>Hozir umumiy ko'rinish ishlatilmoqda</div>}
            </div>
          )}
        </div>
        <button type="button" onClick={onDone} style={{ height: 36, padding: "0 14px", borderRadius: 10, border: 0, background: THEME.violet, color: THEME.onPrimary, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Check size={15} /> Tayyor
        </button>
      </div>
      <style>{`.uvix-add-short{ display:none }
      @media (max-width: 1100px){ .uvix-edit-hint{ display:none } }
      @media (max-width: 768px){
        .uvix-add-long{ display:none } .uvix-add-short{ display:inline }
        .uvix-edit-toolbar{ left: 12px !important; right: 12px; width: auto !important; transform: none !important; bottom: calc(92px + env(safe-area-inset-bottom, 0px)) !important; }
      }`}</style>
    </div>
  );
}
function MenuItem({ onClick, icon: Icon, text, danger }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: 0, background: "transparent", color: danger ? THEME.rose : THEME.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
      className="uvix-row">
      <Icon size={15} /> {text}
    </button>
  );
}
function useOutside(ref, active, fn) {
  useEffect(() => {
    if (!active) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) fn(); };
    const esc = (e) => e.key === "Escape" && fn();
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [active, ref, fn]);
}

/* ---------------- har bir karta atrofidagi "ramka" ---------------- */
export function WidgetFrame({ id, editing, cfg, children, dragging, onDragStart, menuOpen, onMenu, onLongPress }) {
  const cat = catalogOf(id);
  const ref = useRef(null);
  const press = useRef(null);
  // Telefonda uzoq bosib turish — tahrirlash rejimiga o'tib, shu karta menyusini ochadi
  function onPointerDown(e) {
    if (editing || e.pointerType !== "touch") return;
    const start = { x: e.clientX, y: e.clientY };
    press.current = { start, t: setTimeout(() => { press.current = null; navigator.vibrate?.(15); onLongPress(id); }, 550) };
  }
  function cancelPress(e) {
    if (!press.current) return;
    if (e && e.type === "pointermove" && Math.hypot(e.clientX - press.current.start.x, e.clientY - press.current.start.y) < 10) return;
    clearTimeout(press.current.t);
    press.current = null;
  }
  return (
    <div ref={ref} data-wid={id} data-group={cat?.group}
      onPointerDown={onPointerDown} onPointerMove={cancelPress} onPointerUp={cancelPress} onPointerCancel={cancelPress}
      onContextMenu={(e) => { if (e.nativeEvent.pointerType === "touch" || press.current) e.preventDefault(); }}
      className={editing ? `uvix-wf-edit${dragging ? " uvix-wf-drag" : ""}` : undefined}
      style={{ position: "relative", height: "100%", borderRadius: 22 }}>
      <div className="uvix-wf-body" style={editing ? { pointerEvents: "none", userSelect: "none", height: "100%" } : { height: "100%" }}>{children}</div>
      {editing && (
        <>
          <button type="button" aria-label={`${cat?.label || id} — sudrab joyini o'zgartirish`} title="Sudrab joyini o'zgartiring"
            onPointerDown={(e) => onDragStart(e, id)}
            style={{ position: "absolute", left: "50%", top: -13, transform: "translateX(-50%)", width: 52, height: 26, borderRadius: 13, border: `1px solid ${THEME.violet}88`, background: THEME.card, boxShadow: "0 3px 10px rgba(0,0,0,0.3)", color: THEME.violet, cursor: "grab", display: "grid", placeItems: "center", touchAction: "none", zIndex: 6 }}>
            <GripHorizontal size={18} />
          </button>
          <WidgetMenu id={id} cfg={cfg} open={menuOpen} onToggle={(v) => onMenu(v ? id : null)} />
        </>
      )}
    </div>
  );
}

function WidgetMenu({ id, cfg, open, onToggle }) {
  const ref = useRef(null);
  useOutside(ref, open, () => onToggle(false));
  const cat = catalogOf(id);
  const layout = cfg.editing.layout;
  const w = layout.find((x) => x.id === id) || { size: cat?.defaultSize || "md" };
  const st = cfg.editing.cardStyles[id] || {};
  const siblings = layout.filter((x) => x.visible && catalogOf(x.id)?.group === cat?.group);
  const pos = siblings.findIndex((x) => x.id === id);

  const setSize = (size) => cfg.update((n) => { const it = n.layout.find((x) => x.id === id); if (it) it.size = size; });
  const setStyle = (patch) => cfg.update((n) => { n.cardStyles = { ...(n.cardStyles || {}), [id]: { ...(n.cardStyles?.[id] || {}), ...patch } }; });
  const resetStyle = () => cfg.update((n) => { const cs = { ...(n.cardStyles || {}) }; delete cs[id]; n.cardStyles = cs; });
  const hide = () => { cfg.update((n) => { const it = n.layout.find((x) => x.id === id); if (it) it.visible = false; }); onToggle(false); };
  const move = (dir) => cfg.update((n) => {
    const vis = n.layout.filter((x) => x.visible && catalogOf(x.id)?.group === cat?.group);
    const i = vis.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const a = n.layout.findIndex((x) => x.id === vis[i].id), b = n.layout.findIndex((x) => x.id === vis[j].id);
    [n.layout[a], n.layout[b]] = [n.layout[b], n.layout[a]];
  });
  const label = (t) => <div style={{ fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "12px 0 6px" }}>{t}</div>;
  const pill = (on) => ({ flex: 1, height: 30, borderRadius: 8, border: `1px solid ${on ? THEME.violet : THEME.border}`, background: on ? THEME.violetSoft : "transparent", color: on ? THEME.violet : THEME.text, fontSize: 11.5, fontWeight: 700, cursor: "pointer" });

  return (
    <div ref={ref} style={{ position: "absolute", right: 8, bottom: 8, zIndex: open ? 30 : 6 }}>
      <button type="button" aria-label={`${cat?.label || id} — sozlash`} aria-expanded={open} onClick={() => onToggle(!open)}
        style={{ width: 32, height: 32, borderRadius: 10, border: 0, background: open ? THEME.violet : THEME.card, color: open ? THEME.onPrimary : THEME.text, boxShadow: "0 2px 8px rgba(0,0,0,0.25)", cursor: "pointer", display: "grid", placeItems: "center" }}>
        <Settings2 size={16} />
      </button>
      {open && (
        <div role="dialog" aria-label={`${cat?.label || id} sozlamalari`} className="uvix-wmenu" style={{ position: "absolute", right: 0, bottom: 40, width: 260, maxWidth: "calc(100vw - 24px)", padding: 14, borderRadius: 16,
          background: THEME.card, border: `1px solid ${THEME.border}`, boxShadow: "0 20px 48px rgba(0,0,0,0.4)", color: THEME.text }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat?.label || id}</div>
            <button type="button" aria-label="Yopish" onClick={() => onToggle(false)} style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={16} /></button>
          </div>
          {label("O'lcham")}
          <div style={{ display: "flex", gap: 5 }}>
            {["sm", "md", "lg", "full"].map((k) => <button key={k} type="button" style={pill(w.size === k)} onClick={() => setSize(k)}>{DASHBOARD_SIZE_LABELS[k]}</button>)}
          </div>
          {cat?.colorable && (
            <>
              {label("Rang")}
              <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                <button type="button" style={pill(!st.filled)} onClick={() => setStyle({ filled: false })}>Oddiy</button>
                <button type="button" style={pill(!!st.filled)} onClick={() => setStyle({ filled: true, color: st.color || CARD_COLORS[0].hex })}>To'liq rang</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
                {CARD_COLORS.map((c) => (
                  <button key={c.hex} type="button" title={c.name} aria-label={c.name} onClick={() => setStyle({ color: c.hex })}
                    style={{ width: 32, height: 32, borderRadius: "50%", padding: 2, cursor: "pointer", background: "transparent", border: st.color === c.hex ? `2px solid ${THEME.text}` : "2px solid transparent" }}>
                    <span style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", borderRadius: "50%", background: c.hex }}>{st.color === c.hex && <Check size={13} color={readableOn(c.hex)} />}</span>
                  </button>
                ))}
                <label title="Boshqa rang" style={{ position: "relative", width: 32, height: 32, borderRadius: "50%", overflow: "hidden", cursor: "pointer",
                  background: "conic-gradient(#EF4444, #F59E0B, #10B981, #06B6D4, #3B82F6, #7C5CFC, #EC4899, #EF4444)", border: `2px solid ${st.color && !CARD_COLORS.some((c) => c.hex === st.color) ? THEME.text : "transparent"}` }}>
                  <input type="color" aria-label="Boshqa rang tanlash" value={st.color || "#7C5CFC"} onChange={(e) => setStyle({ color: e.target.value.toUpperCase() })} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
                </label>
              </div>
              {(st.color || st.filled != null) && (
                <button type="button" onClick={resetStyle} style={{ marginTop: 8, border: 0, background: "none", color: THEME.muted, fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, padding: 0 }}>
                  <RotateCcw size={12} /> Asl rangiga qaytarish
                </button>
              )}
            </>
          )}
          {label("Joyi")}
          <div style={{ display: "flex", gap: 5 }}>
            <button type="button" style={{ ...pill(false), opacity: pos <= 0 ? 0.4 : 1 }} disabled={pos <= 0} onClick={() => move(-1)}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> Oldinga</button>
            <button type="button" style={{ ...pill(false), opacity: pos >= siblings.length - 1 ? 0.4 : 1 }} disabled={pos >= siblings.length - 1} onClick={() => move(1)}>Keyinga <ArrowRight size={13} style={{ verticalAlign: -2 }} /></button>
          </div>
          <button type="button" onClick={hide} style={{ marginTop: 12, width: "100%", height: 34, borderRadius: 10, border: `1px solid ${THEME.roseBorder || THEME.border}`, background: THEME.roseBg, color: THEME.rose, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <EyeOff size={14} /> Yashirish
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- yashirilgan kartalar galereyasi ---------------- */
export function AddWidgetGallery({ cfg, onClose }) {
  const hidden = cfg.editing.layout.filter((w) => !w.visible);
  const show = (id) => cfg.update((n) => {
    const it = n.layout.find((x) => x.id === id);
    if (!it) return;
    it.visible = true;
    // o'z bo'limining oxiriga qo'yamiz
    const g = catalogOf(id)?.group;
    n.layout = n.layout.filter((x) => x.id !== id);
    let at = -1;
    n.layout.forEach((x, i) => { if (x.visible && catalogOf(x.id)?.group === g) at = i; });
    n.layout.splice(at + 1, 0, it);
  });
  return (
    <div role="dialog" aria-modal="true" aria-label="Ko'rsatkich qo'shish" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(8,6,16,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 100%)", maxHeight: "80vh", overflowY: "auto", borderRadius: 20, background: THEME.card, border: `1px solid ${THEME.border}`, padding: 20, boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }} className="uvix-scroll">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Ko'rsatkich qo'shish</div>
          <button type="button" aria-label="Yopish" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: 0, background: THEME.surface, color: THEME.text, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={17} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 14 }}>Yashirilgan kartalar. Bosing — dashboardga qaytadi.</div>
        {hidden.length === 0 ? (
          <div style={{ fontSize: 13, color: THEME.muted, padding: "24px 0", textAlign: "center" }}>Hamma kartalar ko'rinib turibdi</div>
        ) : DASHBOARD_GROUPS.map((g) => {
          const items = hidden.filter((w) => catalogOf(w.id)?.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, color: THEME.violet, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{g.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                {items.map((w) => (
                  <button key={w.id} type="button" onClick={() => show(w.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderRadius: 12, border: `1px dashed ${THEME.border}`, background: THEME.surface, color: THEME.text, cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: 700 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: THEME.violetSoft, color: THEME.violet, display: "grid", placeItems: "center", flexShrink: 0 }}><Plus size={15} /></span>
                    {catalogOf(w.id)?.label || w.id}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- sudrab joylashtirish ---------------- */
export function useDragReorder(cfg) {
  const [dragId, setDragId] = useState(null);
  const state = useRef(null);
  const onDragStart = useCallback((e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const group = catalogOf(id)?.group;
    state.current = { id, group, layout: clone(cfg.editing.layout) };
    setDragId(id);
    const move = (ev) => {
      const s = state.current;
      if (!s) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-wid]");
      if (!el) return;
      const over = el.getAttribute("data-wid");
      if (over === s.id || el.getAttribute("data-group") !== s.group) return;
      const r = el.getBoundingClientRect();
      const grid = el.closest(".uvix-dash-grid");
      const fullRow = grid && r.width > grid.clientWidth * 0.8; // butun qatorni egallagan karta — yuqori/pastki yarmiga qaraymiz
      const after = fullRow ? ev.clientY > r.top + r.height / 2 : ev.clientX > r.left + r.width / 2;
      const L = s.layout.filter((x) => x.id !== s.id);
      const me = s.layout.find((x) => x.id === s.id);
      let j = L.findIndex((x) => x.id === over);
      if (after) j += 1;
      L.splice(j, 0, me);
      if (L.map((x) => x.id).join() === s.layout.map((x) => x.id).join()) return;
      s.layout = L;
      cfg.update((n) => { n.layout = clone(L); });
    };
    const up = (ev) => {
      if (ev && ev.type === "pointerup") move(ev);
      state.current = null;
      setDragId(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [cfg]);
  return { dragId, onDragStart };
}

export const EDITOR_CSS = `
  @keyframes uvix-wiggle { 0%,100% { transform: rotate(-0.35deg); } 50% { transform: rotate(0.35deg); } }
  .uvix-wf-edit { outline: 2px dashed rgba(124,92,252,0.45); outline-offset: 3px; }
  /* faqat karta mazmuni tebranadi — tutqich va shesterenka joyida turadi, bosish oson */
  .uvix-wf-edit > .uvix-wf-body { animation: uvix-wiggle .45s ease-in-out infinite; }
  .uvix-dash-grid > div:nth-child(2n) .uvix-wf-edit > .uvix-wf-body { animation-delay: -.2s; }
  .uvix-wf-drag { opacity: .7; outline-style: solid; z-index: 20; }
  .uvix-wf-drag > .uvix-wf-body { animation: none; transform: scale(1.02); }
  @media (prefers-reduced-motion: reduce) { .uvix-wf-edit > .uvix-wf-body { animation: none; } }
  .uvix-edit-spacer { height: 80px; }
  @media (max-width: 768px) { .uvix-edit-spacer { height: 120px; } }
`;
