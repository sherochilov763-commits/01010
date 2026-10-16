// LineSwitcher.jsx — yo'nalish belgisi (UVIXPRINT / UVONYX / Umumiy).
// Yo'nalishni almashtirish tugmasi olib tashlandi: xodim yo'nalishini rahbar biriktiradi (Xodimlar bo'limida).
import { LINE_META, lineColor } from "../lib/lines.js";
import { THEME } from "../theme.js";

// Kichik belgi (rasxod/buyurtma qatorlarida): «UVONYX», «Umumiy»
export function LineTag({ line, share }) {
  const common = line === "common";
  const c = common ? THEME.muted : lineColor(line, THEME.isDark);
  return (
    <span data-line-tag={line} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 20, padding: "0 7px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.2, whiteSpace: "nowrap",
      color: c, background: common ? THEME.chip : c + "1F" }}>
      {common ? "Umumiy" : LINE_META[line]?.name || line}{common && share != null ? ` · ${Math.round(share * 100)}%` : ""}
    </span>
  );
}

