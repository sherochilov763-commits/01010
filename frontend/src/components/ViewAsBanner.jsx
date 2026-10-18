// ViewAsBanner.jsx — «Rol bo'lib ko'rish» rejimida tepada ko'k chiziq: kim sifatida, faqat ko'rish, «Chiqish».
import { Eye } from "lucide-react";
import { usePerms } from "../lib/perms.jsx";
import { exitViewAs } from "../storage.js";
import { ROLE_LABELS } from "../constants.js";
import { THEME } from "../theme.js";

export function ViewAsBanner({ name, role }) {
  const { viewAs } = usePerms();
  if (!viewAs) return null;
  return (
    <div role="status" data-testid="viewas-banner"
      style={{ position: "sticky", top: 0, zIndex: 1200, background: "#1F5FD6", color: "#fff", display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", paddingTop: "calc(8px + env(safe-area-inset-top, 0px))", fontSize: 13.5, fontWeight: 600, fontFamily: THEME.font }}>
      <Eye size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>Siz <b>{name || viewAs.name || "xodim"}</b>{role || viewAs.role ? ` (${ROLE_LABELS[role || viewAs.role] || role || viewAs.role})` : ""} sifatida ko'ryapsiz — faqat ko'rish, o'zgartirish yozilmaydi</span>
      <button type="button" data-testid="viewas-exit" onClick={() => { exitViewAs(); window.location.reload(); }}
        style={{ border: 0, background: "#fff", color: "#1F5FD6", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Chiqish</button>
    </div>
  );
}
