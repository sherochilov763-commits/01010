import { ArrowLeft, LogOut, Menu } from "lucide-react";
import { NAV, roleLabel } from "../constants.js";
import { EditNavButton, NavEditor } from "./Nav.jsx";
import { longDateUz } from "../lib/format.js";
import { THEME } from "../theme.js";
import { BrandMark, Avatar } from "./ui.jsx";
export { BrandMark, Avatar };

/* ---------------- LOGIN ---------------- */
/* ---------------- SIDEBAR / TOPBAR ---------------- */
export function Sidebar({ nav, navCfg, view, setView, user, onLogout, sidebarStyle, isOpen, onClose, top, badges }) {
  const style = sidebarStyle || "modern";
  const isClassic = style === "classic";
  const isMinimal = style === "minimal";
  return (
    <>
      {isOpen && <div className="uvix-sidebar-backdrop no-print" onClick={onClose} />}
      <div className={`uvix-sidebar uvix-glass-side no-print${isOpen ? " uvix-sidebar-open" : ""}`} style={{ width: navCfg?.editing ? 300 : isMinimal ? 212 : 232, transition: "width .2s ease", background: THEME.navBg, borderRight: `1px solid ${THEME.navBorder}`, flexShrink: 0, display: "flex", flexDirection: "column", padding: "18px 12px 12px", position: "sticky", top: 0, height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 18px" }}>
        <BrandMark />
        <div>
          <div style={{ color: THEME.text, fontWeight: 600, fontSize: 15, lineHeight: 1.1, letterSpacing: -0.2 }}>UVIX</div>
          <div style={{ color: THEME.navDim, fontSize: 11.5 }}>Moliya tizimi</div>
        </div>
      </div>
      {!navCfg?.editing && top}
      {navCfg?.editing ? (
        <div style={{ overflowY: "auto", flex: 1, margin: "0 -4px", padding: "0 4px" }}><NavEditor nav={navCfg} /></div>
      ) : (
      <div className="uvix-scroll" style={{ display: "flex", flexDirection: "column", gap: isMinimal ? 0 : 2, overflowY: "auto", minHeight: 0 }}>
        {nav.map((n) => {
          const Icon = n.icon;
          const active = view === n.key;
          const badge = badges?.[n.key];
          const itemStyle = {
            display: "flex", alignItems: "center", gap: 10, height: isMinimal ? 32 : 34, padding: "0 12px", flexShrink: 0,
            borderRadius: isClassic ? 4 : 8, border: "none", cursor: "pointer", textAlign: "left", fontSize: 13.5,
            fontWeight: active ? 600 : 500, color: active ? THEME.navActiveText : THEME.navText,
            background: active && !isMinimal ? (isClassic ? THEME.navHover : THEME.navActiveBg) : "transparent",
            boxShadow: isClassic && active ? `inset 2px 0 0 ${THEME.violet}` : "none",
          };
          return (
            <button
              key={n.key}
              onClick={() => { setView(n.key); if (onClose) onClose(); }}
              className={`uvix-nav-item${active ? " uvix-nav-active" : ""}`}
              aria-current={active ? "page" : undefined}
              style={itemStyle}
            >
              <Icon size={16} color={active ? THEME.violet : "currentColor"} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label}</span>
              {badge ? <span style={{ fontSize: 11, fontWeight: 700, color: THEME.rose, background: THEME.roseBg, padding: "0 7px", borderRadius: 10, lineHeight: "18px" }}>{badge > 99 ? "99+" : badge}</span> : null}
            </button>
          );
        })}
      </div>
      )}
      {!navCfg?.editing && <div style={{ flex: 1 }} />}
      {navCfg && !navCfg.editing && <div style={{ marginBottom: 4 }}><EditNavButton nav={navCfg} /></div>}
      <div style={{ borderTop: `1px solid ${THEME.navBorder}`, display: "flex", alignItems: "center", gap: 9, padding: "12px 8px 2px" }}>
        <Avatar name={user.name} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: THEME.text, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          <div style={{ color: THEME.navDim, fontSize: 11.5 }}>{roleLabel(user.role)}</div>
        </div>
        <button onClick={onLogout} title="Chiqish" aria-label="Chiqish" className="uvix-iconbtn" style={{ background: "none", border: "none", color: THEME.navDim, cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}>
          <LogOut size={15} />
        </button>
      </div>
      </div>
    </>
  );
}


export function Topbar({ user, view, onLogout, onMenuClick, onBack, right }) {
  const title = NAV.find((n) => n.key === view)?.label || "";
  return (
    <div className="no-print uvix-topbar" style={{ padding: "18px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onMenuClick}
          className="uvix-hamburger uvix-iconbtn"
          style={{
            background: THEME.card, border: `1px solid ${THEME.border2}`, borderRadius: 8, cursor: "pointer",
            display: "none", alignItems: "center", justifyContent: "center", flexShrink: 0,
            width: 40, height: 40, minWidth: 40, minHeight: 40, position: "relative", zIndex: 50,
            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          <Menu size={19} color={THEME.text} />
        </button>
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Orqaga" title="Orqaga" className="uvix-iconbtn"
            style={{
              background: THEME.card, border: `1px solid ${THEME.border2}`, borderRadius: 8, cursor: "pointer",
              width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              color: THEME.text, WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
            }}>
            <ArrowLeft size={19} />
          </button>
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2 }}>{title}</h1>
          <div style={{ fontSize: 12.5, color: THEME.dim, marginTop: 2 }}>
            {longDateUz()}
          </div>
        </div>
      </div>
      {right && <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>{right}</div>}
    </div>
  );
}
