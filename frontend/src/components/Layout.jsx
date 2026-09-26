import { LogOut, Menu } from "lucide-react";
import { NAV, roleLabel } from "../constants.js";
import { longDateUz } from "../lib/format.js";
import { THEME } from "../theme.js";

/* ---------------- LOGIN ---------------- */
/* ---------------- SIDEBAR / TOPBAR ---------------- */
export function Sidebar({ nav, view, setView, user, onLogout, sidebarStyle, isOpen, onClose }) {
  const style = sidebarStyle || "modern";
  const isClassic = style === "classic";
  const isMinimal = style === "minimal";
  return (
    <>
      {isOpen && <div className="uvix-sidebar-backdrop no-print" onClick={onClose} />}
      <div className={`uvix-sidebar no-print${isOpen ? " uvix-sidebar-open" : ""}`} style={{ width: isMinimal ? 208 : 232, background: THEME.ink, flexShrink: 0, display: "flex", flexDirection: "column", padding: isMinimal ? "20px 10px" : "20px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 24px" }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 4px 14px rgba(124,92,252,0.35)` }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>UV</span>
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.1, letterSpacing: -0.2 }}>UVIX</div>
          <div style={{ color: "#837DA3", fontSize: 10.5 }}>Moliya tizimi</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: isMinimal ? 1 : 3 }}>
        {nav.map((n) => {
          const Icon = n.icon;
          const active = view === n.key;
          let itemStyle;
          if (isClassic) {
            itemStyle = {
              display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 4,
              border: "none", borderLeft: active ? `3px solid ${THEME.cyan}` : "3px solid transparent",
              cursor: "pointer", textAlign: "left", fontSize: 13.5, fontWeight: active ? 700 : 500,
              background: active ? "rgba(255,255,255,0.06)" : "transparent",
              color: active ? "#fff" : "#9C96BA",
            };
          } else if (isMinimal) {
            itemStyle = {
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
              border: "none", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: active ? 700 : 500,
              background: "transparent",
              color: active ? THEME.cyan : "#8B84AD",
            };
          } else {
            itemStyle = {
              display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 12,
              border: "none", cursor: "pointer", textAlign: "left", fontSize: 13.5, fontWeight: active ? 700 : 500,
              background: active ? THEME.violet : "transparent",
              color: active ? "#fff" : "#9C96BA",
              boxShadow: active ? "0 4px 14px rgba(124,92,252,0.35)" : "none",
            };
          }
          return (
            <button
              key={n.key}
              onClick={() => { setView(n.key); if (onClose) onClose(); }}
              className={`uvix-nav-item${active ? " uvix-nav-active" : ""}`}
              style={itemStyle}
            >
              <Icon size={isMinimal ? 15 : 16} />
              {n.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14, display: "flex", alignItems: "center", gap: 9, padding: "14px 8px 4px" }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "#fff", fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          <div style={{ color: "#837DA3", fontSize: 10.5 }}>{roleLabel(user.role)}</div>
        </div>
        <button onClick={onLogout} title="Chiqish" className="uvix-iconbtn" style={{ background: "none", border: "none", color: "#837DA3", cursor: "pointer", padding: 5, borderRadius: 8, display: "flex" }}>
          <LogOut size={15} />
        </button>
      </div>
      </div>
    </>
  );
}


export function Topbar({ user, view, onLogout, onMenuClick }) {
  const title = NAV.find((n) => n.key === view)?.label || "";
  return (
    <div className="no-print" style={{ padding: "18px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onMenuClick}
          className="uvix-hamburger uvix-iconbtn"
          style={{
            background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 11, cursor: "pointer",
            display: "none", alignItems: "center", justifyContent: "center", flexShrink: 0,
            width: 44, height: 44, minWidth: 44, minHeight: 44, position: "relative", zIndex: 50,
            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          <Menu size={20} color={THEME.text} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>{title}</div>
          <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>
            {longDateUz()}
          </div>
        </div>
      </div>
    </div>
  );
}
