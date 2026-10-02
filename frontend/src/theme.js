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

// Dizayn tizimi v2 — neytral kulrang fon, bitta urg'u rangi, gradientsiz, bitta shrift (Onest).
// Sidebar endi qorong'i blok emas: yorug' rejimda oq panel + ingichka chegara (Linear / Attio / HubSpot uslubi).
export const APPEARANCE_MODE_PRESETS = {
  // "Yorug'" — standart
  light: {
    ink: "#FFFFFF", surface: "#F7F7F8", card: "#FFFFFF", text: "#18181B", muted: "#62626B", mutedDark: "#3F3F46", dim: "#8C8C96",
    border: "#E7E7EA", border2: "#DCDCE0", borderSoft: "rgba(24,24,27,0.06)", chip: "#F2F2F4", hover: "#F4F4F5",
    navText: "#62626B", navDim: "#8C8C96", navActiveText: "#18181B", navBorder: "#E7E7EA",
  },
  // "Kulrang" — bir oz yumshoqroq fon
  soft: {
    ink: "#F4F4F5", surface: "#EEEEF0", card: "#FBFBFC", text: "#18181B", muted: "#5F5F68", mutedDark: "#3F3F46", dim: "#8A8A93",
    border: "#E1E1E5", border2: "#D6D6DB", borderSoft: "rgba(24,24,27,0.06)", chip: "#EAEAED", hover: "#EBEBEE",
    navText: "#5F5F68", navDim: "#8A8A93", navActiveText: "#18181B", navBorder: "#E1E1E5",
  },
  // "Grafit" — qorong'i neytral
  dark: {
    ink: "#111113", surface: "#0C0C0E", card: "#161618", text: "#EDEDEF", muted: "#9D9DA6", mutedDark: "#C8C8CE", dim: "#74747C",
    border: "#26262A", border2: "#323237", borderSoft: "rgba(255,255,255,0.06)", chip: "#202023", hover: "#1C1C1F",
    navText: "#9D9DA6", navDim: "#74747C", navActiveText: "#EDEDEF", navBorder: "#202023",
  },
};
// Urg'u ranglari: [yorug' rejim, qorong'i rejim]
export const APPEARANCE_COLOR_PRESETS = {
  blue: { primary: "#1F5FD6", primaryDark: "#3B7BEA", accent: "#0E7490", accentDark: "#38BDF8", label: "Ko'k" },
  graphite: { primary: "#18181B", primaryDark: "#E4E4E7", accent: "#52525B", accentDark: "#A1A1AA", label: "Grafit" },
  emerald: { primary: "#0F7B5F", primaryDark: "#34B98A", accent: "#0E7490", accentDark: "#38BDF8", label: "Yashil" },
  indigo: { primary: "#4F46E5", primaryDark: "#7B74F0", accent: "#0E7490", accentDark: "#38BDF8", label: "Indigo" },
  orange: { primary: "#C2410C", primaryDark: "#F07B3F", accent: "#B45309", accentDark: "#E0A23A", label: "To'q sariq" },
};
// eski nomlar (saqlangan sozlamalar uchun)
APPEARANCE_COLOR_PRESETS.purple = APPEARANCE_COLOR_PRESETS.indigo;
APPEARANCE_COLOR_PRESETS.pink = APPEARANCE_COLOR_PRESETS.indigo;
export const APPEARANCE_RADIUS_PRESETS = { sharp: 6, medium: 10, rounded: 14 };
export const APPEARANCE_VERSION = 2;
export const DEFAULT_APPEARANCE = {
  v: APPEARANCE_VERSION, mode: "light", colorScheme: "blue", customPrimary: "#1F5FD6", customAccent: "#0E7490",
  density: "comfortable", radius: "medium", sidebarStyle: "modern",
};
// Eski (siyohrang, gradientli) ko'rinish saqlangan bo'lsa — bir marta yangi dizaynga o'tkazamiz.
// Zichlik va sidebar uslubi kabi shaxsiy tanlovlar saqlanadi.
export function migrateAppearance(a) {
  if (!a || typeof a !== "object") return DEFAULT_APPEARANCE;
  if ((a.v || 1) >= APPEARANCE_VERSION) return { ...DEFAULT_APPEARANCE, ...a };
  return { ...DEFAULT_APPEARANCE, density: a.density || DEFAULT_APPEARANCE.density, sidebarStyle: a.sidebarStyle || DEFAULT_APPEARANCE.sidebarStyle };
}

export function buildTheme(appearance) {
  const a = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };
  const isDark = a.mode === "dark";
  let mode = APPEARANCE_MODE_PRESETS[a.mode] || APPEARANCE_MODE_PRESETS.light;
  // Shisha rejimi: fon ustida shaffof panellar — ikkinchi darajali yozuvlar yorqinroq bo'lishi kerak
  if (a.glass) mode = { ...APPEARANCE_MODE_PRESETS.dark, muted: "#C4C4CC", mutedDark: "#E4E4E7", dim: "#A8A8B0", navText: "#D4D4D8", navDim: "#A8A8B0", border: "rgba(255,255,255,0.12)", border2: "rgba(255,255,255,0.18)", chip: "rgba(255,255,255,0.09)", hover: "rgba(255,255,255,0.07)", navBorder: "rgba(255,255,255,0.08)" };
  const preset = APPEARANCE_COLOR_PRESETS[a.colorScheme] || APPEARANCE_COLOR_PRESETS.blue;
  const colorSet = a.colorScheme === "custom"
    ? { primary: a.customPrimary || DEFAULT_APPEARANCE.customPrimary, accent: a.customAccent || DEFAULT_APPEARANCE.customAccent }
    : { primary: isDark ? preset.primaryDark : preset.primary, accent: isDark ? preset.accentDark : preset.accent };
  const softBg = (hex, w) => mixColors(hex, mode.card, w ?? (isDark ? 0.84 : 0.92));
  // urg'u rangi ustidagi matn (grafit urg'uda qorong'i rejimda qora matn)
  const { r, g, b } = hexToRgb(colorSet.primary);
  const onPrimary = (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? "#111113" : "#FFFFFF";
  return {
    ink: mode.ink, ink2: mode.hover, ink3: mode.chip,
    surface: mode.surface, card: mode.card, text: mode.text, muted: mode.muted, mutedDark: mode.mutedDark, dim: mode.dim,
    border: mode.border, border2: mode.border2, borderSoft: mode.borderSoft, hover: mode.hover,
    // nomlar tarixiy: "violet" — asosiy urg'u rangi, "cyan" — ikkinchi darajali
    violet: colorSet.primary, violetDark: mixColors(colorSet.primary, isDark ? "#FFFFFF" : "#000000", 0.16), violetSoft: softBg(colorSet.primary),
    onPrimary,
    cyan: colorSet.accent, cyanBg: softBg(colorSet.accent),
    green: isDark ? "#3FB97A" : "#15803D", greenBg: softBg(isDark ? "#3FB97A" : "#15803D"), greenText: isDark ? "#7DD3A8" : "#166534",
    rose: isDark ? "#F26464" : "#DC2626", roseBg: softBg(isDark ? "#F26464" : "#DC2626"), roseText: isDark ? "#FCA5A5" : "#991B1B",
    roseMuted: isDark ? "#E7A3A3" : "#9F3A3A", roseBorder: mixColors(isDark ? "#F26464" : "#DC2626", mode.card, isDark ? 0.6 : 0.75),
    chartGrid: mode.border, chip: mode.chip,
    font: "'Onest', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontNum: "'Onest', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    isDark,
    amber: isDark ? "#E0A23A" : "#B45309", amberBg: softBg(isDark ? "#E0A23A" : "#D97706"),
    blue: isDark ? "#5B8DEF" : "#1F5FD6", blueBg: softBg(isDark ? "#5B8DEF" : "#1F5FD6"),
    // navigatsiya paneli
    navBg: mode.ink, navText: mode.navText, navDim: mode.navDim, navActiveText: mode.navActiveText, navBorder: mode.navBorder,
    navActiveBg: softBg(colorSet.primary, isDark ? 0.86 : 0.93), navHover: mode.hover,
    shadowSm: isDark ? "0 1px 2px rgba(0,0,0,0.4)" : "0 1px 2px rgba(16,16,20,0.04)",
    shadowMd: isDark ? "0 4px 14px rgba(0,0,0,0.45)" : "0 1px 3px rgba(16,16,20,0.05), 0 6px 16px rgba(16,16,20,0.04)",
    shadowLg: isDark ? "0 16px 40px rgba(0,0,0,0.6)" : "0 12px 32px rgba(16,16,20,0.10), 0 2px 6px rgba(16,16,20,0.04)",
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
export function withAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
// Grafiklar uchun kategoriyali palitra — sokin, bir-biridan aniq ajraladigan ranglar
export function CHART_COLORS() {
  return THEME.isDark
    ? ["#5B8DEF", "#38BDF8", "#E0A23A", "#3FB97A", "#F26464", "#A78BFA", "#F472B6", "#94A3B8", "#2DD4BF", "#FB923C"]
    : ["#1F5FD6", "#0E7490", "#B45309", "#15803D", "#DC2626", "#6D28D9", "#BE185D", "#64748B", "#0F766E", "#C2410C"];
}
