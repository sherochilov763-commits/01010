export function hexToRgb(hex) {
  const h = (hex || "#000000").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}
export function mixColors(hex1, hex2, weight) {
  const c1 = hexToRgb(hex1), c2 = hexToRgb(hex2);
  return rgbToHex(c1.r + (c2.r - c1.r) * weight, c1.g + (c2.g - c1.g) * weight, c1.b + (c2.b - c1.b) * weight);
}

export const APPEARANCE_MODE_PRESETS = {
  // "Tiniq" — yorug', sokin, raqamlar birinchi o'rinda
  light: { ink: "#16131F", surface: "#F2F3F5", card: "#FFFFFF", text: "#15171C", muted: "#5E6370", mutedDark: "#3F4350", border: "#E3E5EA", borderSoft: "rgba(21,23,28,0.06)" },
  soft: { ink: "#100E1A", surface: "#EEF2F7", card: "#F9FAFB", text: "#18202A", muted: "#727B87", mutedDark: "#4B5563", border: "#DFE4EA", borderSoft: "rgba(24,32,42,0.06)" },
  // "Tungi" — qorong'i premium (kirish ekrani bilan bir xil)
  dark: { ink: "#0E0B19", surface: "#130F22", card: "#1D1733", text: "#F3F0FF", muted: "#A69FC6", mutedDark: "#CFC9E6", border: "#2E2748", borderSoft: "rgba(255,255,255,0.07)" },
};
export const APPEARANCE_COLOR_PRESETS = {
  purple: { primary: "#7C5CFC", accent: "#2DD4EE" },
  blue: { primary: "#2563EB", accent: "#06B6D4" },
  emerald: { primary: "#059669", accent: "#14B8A6" },
  orange: { primary: "#EA580C", accent: "#F59E0B" },
  pink: { primary: "#DB2777", accent: "#8B5CF6" },
};
export const APPEARANCE_RADIUS_PRESETS = { sharp: 8, medium: 18, rounded: 26 };
export const DEFAULT_APPEARANCE = {
  mode: "dark", colorScheme: "purple", customPrimary: "#7C5CFC", customAccent: "#2DD4EE",
  density: "comfortable", radius: "medium", sidebarStyle: "modern",
};

export function buildTheme(appearance) {
  const a = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };
  const mode = APPEARANCE_MODE_PRESETS[a.mode] || APPEARANCE_MODE_PRESETS.light;
  const colorSet = a.colorScheme === "custom"
    ? { primary: a.customPrimary || DEFAULT_APPEARANCE.customPrimary, accent: a.customAccent || DEFAULT_APPEARANCE.customAccent }
    : (APPEARANCE_COLOR_PRESETS[a.colorScheme] || APPEARANCE_COLOR_PRESETS.purple);
  const isDark = a.mode === "dark";
  const softBg = (hex) => mixColors(hex, mode.card, isDark ? 0.8 : 0.9);
  return {
    ink: mode.ink, ink2: mixColors(mode.ink, "#ffffff", 0.08), ink3: mixColors(mode.ink, "#ffffff", 0.14),
    surface: mode.surface, card: mode.card, text: mode.text, muted: mode.muted, mutedDark: mode.mutedDark,
    border: mode.border, borderSoft: mode.borderSoft,
    violet: colorSet.primary, violetDark: mixColors(colorSet.primary, "#000000", 0.22), violetSoft: softBg(colorSet.primary),
    cyan: colorSet.accent, cyanBg: softBg(colorSet.accent),
    green: isDark ? "#34D399" : "#0B7A52", greenBg: softBg("#12B76A"), greenText: isDark ? "#6EE7B7" : "#0F6E56",
    rose: isDark ? "#FF7A8A" : "#D6293F", roseBg: softBg("#F5455C"), roseText: isDark ? "#FFB3BF" : "#7A1224",
    roseMuted: isDark ? "#E7A3AF" : "#9B4152", roseBorder: mixColors("#F5455C", mode.card, isDark ? 0.55 : 0.7),
    chartGrid: mode.border, chip: isDark ? mixColors(mode.card, "#ffffff", 0.05) : "#F3F2F7",
    font: "'Onest', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontNum: isDark ? "'Unbounded', 'Onest', ui-sans-serif, system-ui, sans-serif" : "'Onest', ui-sans-serif, system-ui, sans-serif",
    isDark,
    amber: "#F5A524", amberBg: softBg("#F5A524"),
    blue: "#3B82F6", blueBg: softBg("#3B82F6"),
    shadowSm: isDark ? "0 1px 2px rgba(0,0,0,0.35)" : "0 1px 2px rgba(20,16,40,0.04)",
    shadowMd: isDark ? "0 4px 16px rgba(0,0,0,0.45)" : "0 2px 8px rgba(20,16,40,0.05), 0 8px 24px rgba(20,16,40,0.04)",
    shadowLg: isDark ? "0 16px 40px rgba(0,0,0,0.55)" : "0 12px 32px rgba(20,16,40,0.10)",
    radius: APPEARANCE_RADIUS_PRESETS[a.radius] || APPEARANCE_RADIUS_PRESETS.medium,
  };
}
// Joriy mavzu. ES modul "jonli bog'lanish" tufayli setTheme() chaqirilganda barcha modullar yangi qiymatni ko'radi.
export let THEME = buildTheme(DEFAULT_APPEARANCE);
export function setTheme(next) {
  THEME = next;
}
export function shadeColor(hex, percent) {
  if (!hex || hex[0] !== "#") return hex;
  let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  r = Math.round(r * (100 + percent) / 100); g = Math.round(g * (100 + percent) / 100); b = Math.round(b * (100 + percent) / 100);
  r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
