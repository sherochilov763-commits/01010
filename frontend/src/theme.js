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
// WCAG nisbiy yorqinlik va kontrast (1..21). Oddiy matn uchun me'yor ≥ 4.5, katta matn va belgilar ≥ 3.
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Dizayn tizimi v2 — neytral kulrang fon, bitta urg'u rangi, gradientsiz, bitta shrift (Onest).
// Sidebar endi qorong'i blok emas: yorug' rejimda oq panel + ingichka chegara (Linear / Attio / HubSpot uslubi).
export const APPEARANCE_MODE_PRESETS = {
  // "Yorug'" — standart
  light: {
    ink: "#FFFFFF", surface: "#F7F7F8", card: "#FFFFFF", text: "#18181B", muted: "#62626B", mutedDark: "#3F3F46", dim: "#6E6E77",
    border: "#E7E7EA", border2: "#DCDCE0", borderSoft: "rgba(24,24,27,0.06)", chip: "#F2F2F4", hover: "#F4F4F5",
    navText: "#62626B", navDim: "#6E6E77", navActiveText: "#18181B", navBorder: "#E7E7EA",
  },
  // "Kulrang" — bir oz yumshoqroq fon
  soft: {
    ink: "#F4F4F5", surface: "#EEEEF0", card: "#FBFBFC", text: "#18181B", muted: "#5F5F68", mutedDark: "#3F3F46", dim: "#68686F",
    border: "#E1E1E5", border2: "#D6D6DB", borderSoft: "rgba(24,24,27,0.06)", chip: "#EAEAED", hover: "#EBEBEE",
    navText: "#5F5F68", navDim: "#68686F", navActiveText: "#18181B", navBorder: "#E1E1E5",
  },
  // "Grafit" — qorong'i neytral
  dark: { dark: true,
    ink: "#111113", surface: "#0C0C0E", card: "#161618", text: "#EDEDEF", muted: "#9D9DA6", mutedDark: "#C8C8CE", dim: "#8A8A93",
    border: "#26262A", border2: "#323237", borderSoft: "rgba(255,255,255,0.06)", chip: "#202023", hover: "#1C1C1F",
    navText: "#9D9DA6", navDim: "#8A8A93", navActiveText: "#EDEDEF", navBorder: "#202023",
  },
  // "Qog'oz" — iliq kunduzgi: sarg'ish-oq fon, ko'zni kamroq charchatadi
  paper: {
    ink: "#FFFDF9", surface: "#F5F2EC", card: "#FFFDF9", text: "#1C1917", muted: "#57534E", mutedDark: "#3F3A36", dim: "#736C66",
    border: "#E8E2D9", border2: "#DBD3C7", borderSoft: "rgba(28,25,23,0.06)", chip: "#EFEAE2", hover: "#F2EDE6",
    navText: "#57534E", navDim: "#736C66", navActiveText: "#1C1917", navBorder: "#E8E2D9",
  },
  // "CMYK" — bosmaxona brendi (yorug', cyan + magenta)
  cmyk: {
    ink: "#FFFFFF", surface: "#F4F6F8", card: "#FFFFFF", text: "#111418", muted: "#555B66", mutedDark: "#363B44", dim: "#6B717C",
    border: "#E3E7EC", border2: "#D3D9E0", borderSoft: "rgba(17,20,24,0.06)", chip: "#EEF2F6", hover: "#F1F4F7",
    navText: "#555B66", navDim: "#6B717C", navActiveText: "#111418", navBorder: "#E3E7EC",
  },
  // "Yuqori kontrast" — AAA (≥ 7:1): sex, quyosh nuri, ko'zi zaifroq xodimlar
  contrast: { contrast: true,
    ink: "#FFFFFF", surface: "#F2F2F2", card: "#FFFFFF", text: "#000000", muted: "#2E2E33", mutedDark: "#1A1A1D", dim: "#4A4A52",
    border: "#8A8A93", border2: "#5C5C66", borderSoft: "rgba(0,0,0,0.18)", chip: "#EDEDED", hover: "#E8E8E8",
    navText: "#1A1A1D", navDim: "#4A4A52", navActiveText: "#000000", navBorder: "#8A8A93",
  },
  // "Tun ko'k" — chuqur ko'k-qorong'i (kechki smena)
  navy: { dark: true,
    ink: "#0B1220", surface: "#070C17", card: "#0F172A", text: "#E2E8F0", muted: "#94A3B8", mutedDark: "#CBD5E1", dim: "#8391A7",
    border: "#1E293B", border2: "#2A3850", borderSoft: "rgba(226,232,240,0.06)", chip: "#17223A", hover: "#141E33",
    navText: "#94A3B8", navDim: "#8391A7", navActiveText: "#E2E8F0", navBorder: "#1A2438",
  },
  // "Iliq tun" — kahrabo ohangli qorong'i, ko'k nur kam
  warm: { dark: true,
    ink: "#17130F", surface: "#110E0B", card: "#1C1814", text: "#EDE6DD", muted: "#ADA397", mutedDark: "#D6CCBF", dim: "#938A7E",
    border: "#2B251F", border2: "#382F27", borderSoft: "rgba(237,230,221,0.06)", chip: "#241F1A", hover: "#211C17",
    navText: "#ADA397", navDim: "#938A7E", navActiveText: "#EDE6DD", navBorder: "#241F1A",
  },
  // "OLED qora" — to'liq qora (telefon: batareya tejaladi)
  oled: { dark: true,
    ink: "#000000", surface: "#000000", card: "#0B0B0C", text: "#F4F4F5", muted: "#A1A1AA", mutedDark: "#D4D4D8", dim: "#8B8B94",
    border: "#1F1F22", border2: "#2B2B30", borderSoft: "rgba(255,255,255,0.06)", chip: "#151517", hover: "#121214",
    navText: "#A1A1AA", navDim: "#8B8B94", navActiveText: "#F4F4F5", navBorder: "#151517",
  },
};
// Mavzular galereyasi: mavzu = rejim (fon/matn) + o'ziga mos urg'u rangi
export const THEMES = [
  { key: "light", label: "Yorug'", hint: "Standart, toza oq" },
  { key: "soft", label: "Kulrang", hint: "Yumshoqroq fon" },
  { key: "paper", label: "Qog'oz", hint: "Iliq, ko'zni charchatmaydi", scheme: "terracotta" },
  { key: "contrast", label: "Yuqori kontrast", hint: "Sex, quyosh nuri", scheme: "hc" },
  { key: "cmyk", label: "CMYK", hint: "Bosmaxona brendi", scheme: "cmyk" },
  { key: "dark", label: "Grafit", hint: "Neytral qorong'i" },
  { key: "navy", label: "Tun ko'k", hint: "Kechki smena", scheme: "sky" },
  { key: "warm", label: "Iliq tun", hint: "Ko'k nur kam", scheme: "amber" },
  { key: "oled", label: "OLED qora", hint: "Telefon, batareya", scheme: "electric" },
];
export const NIGHT_THEMES = THEMES.filter((t) => APPEARANCE_MODE_PRESETS[t.key]?.dark).map((t) => t.key);
// Faqat ma'lum mavzuga tegishli urg'u ranglari (boshqa mavzuga o'tganda standart ko'kka qaytadi)
const THEME_ONLY_SCHEMES = new Set(THEMES.map((t) => t.scheme).filter(Boolean));
export const isDarkMode = (mode) => !!APPEARANCE_MODE_PRESETS[mode]?.dark;
// Galereyadan mavzu tanlash
export function applyThemeChoice(appr, key) {
  const t = THEMES.find((x) => x.key === key);
  if (!t) return appr;
  const keep = appr.colorScheme && !THEME_ONLY_SCHEMES.has(appr.colorScheme) ? appr.colorScheme : "blue";
  return { ...appr, mode: key, colorScheme: t.scheme || keep };
}
// Urg'u ranglari: [yorug' rejim, qorong'i rejim]
export const APPEARANCE_COLOR_PRESETS = {
  blue: { primary: "#1F5FD6", primaryDark: "#3B7BEA", accent: "#0E7490", accentDark: "#38BDF8", label: "Ko'k" },
  graphite: { primary: "#18181B", primaryDark: "#E4E4E7", accent: "#52525B", accentDark: "#A1A1AA", label: "Grafit" },
  emerald: { primary: "#0F7B5F", primaryDark: "#34B98A", accent: "#0E7490", accentDark: "#38BDF8", label: "Yashil" },
  indigo: { primary: "#4F46E5", primaryDark: "#7B74F0", accent: "#0E7490", accentDark: "#38BDF8", label: "Indigo" },
  orange: { primary: "#C2410C", primaryDark: "#F07B3F", accent: "#B45309", accentDark: "#E0A23A", label: "To'q sariq" },
  // mavzularga tegishli urg'ular
  terracotta: { primary: "#A84B24", primaryDark: "#E08A5E", accent: "#0E7490", accentDark: "#38BDF8", label: "Terrakota" },
  sky: { primary: "#2563EB", primaryDark: "#60A5FA", accent: "#0E7490", accentDark: "#38BDF8", label: "Osmon" },
  amber: { primary: "#B45309", primaryDark: "#E3A54A", accent: "#0F766E", accentDark: "#7FB8A4", label: "Kahrabo" },
  electric: { primary: "#1D4ED8", primaryDark: "#3B9EFF", accent: "#0E7490", accentDark: "#22D3EE", label: "Elektr" },
  hc: { primary: "#0047B3", primaryDark: "#7CB4FF", accent: "#00627A", accentDark: "#5EEAD4", label: "Kontrast" },
  cmyk: { primary: "#0077A8", primaryDark: "#22B8E8", accent: "#B5136F", accentDark: "#F25CB4", label: "CMYK",
    chart: ["#0077A8", "#B5136F", "#B58900", "#2F3640", "#00A6D6", "#E0489A", "#D9A400", "#6B717C", "#005F86", "#8E0F57"],
    chartDark: ["#22B8E8", "#F25CB4", "#E8C547", "#A1A1AA", "#7DD3FC", "#F9A8D4", "#FDE68A", "#71717A", "#0EA5E9", "#DB2777"] },
};
// eski nomlar (saqlangan sozlamalar uchun)
APPEARANCE_COLOR_PRESETS.purple = APPEARANCE_COLOR_PRESETS.indigo;
APPEARANCE_COLOR_PRESETS.pink = APPEARANCE_COLOR_PRESETS.indigo;
export const APPEARANCE_RADIUS_PRESETS = { sharp: 6, medium: 10, rounded: 14 };
export const APPEARANCE_VERSION = 2;
export const DEFAULT_APPEARANCE = {
  v: APPEARANCE_VERSION, mode: "light", colorScheme: "blue", customPrimary: "#1F5FD6", customAccent: "#0E7490",
  density: "comfortable", radius: "medium", sidebarStyle: "modern",
  // Avtomatik qorong'i: "off" | "system" (qurilmaga mos) | "schedule" (soat bo'yicha)
  autoDark: "off", nightTheme: "dark", nightFrom: "19:00", nightTo: "07:00",
};
// Shaxsiy ko'rinishga kiradigan maydonlar (kompaniya standarti va rol sozlamalari bundan tashqari)
export const PERSONAL_KEYS = ["v", "mode", "colorScheme", "customPrimary", "customAccent", "density", "radius", "sidebarStyle", "autoDark", "nightTheme", "nightFrom", "nightTo"];
export function personalPart(appr) {
  const out = {};
  PERSONAL_KEYS.forEach((k) => { if (appr && appr[k] !== undefined) out[k] = appr[k]; });
  return out;
}
// Yakuniy ko'rinish: shaxsiy tanlov > rol bo'yicha standart > kompaniya standarti
export function resolveAppearance(company, mine, role) {
  const base = migrateAppearance(company);
  if (mine && typeof mine === "object") return { ...base, ...personalPart(migrateAppearance(mine)), personal: true };
  const rd = base.roleDefaults?.[role];
  if (rd && APPEARANCE_MODE_PRESETS[rd]) return { ...applyThemeChoice(base, rd), personal: false };
  return { ...base, personal: false };
}
const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); return m ? (Number(m[1]) % 24) * 60 + Math.min(59, Number(m[2])) : null; };
// Hozir tungi mavzu yoqilishi kerakmi (avtomatik rejim)
export function isNightNow(appr, now = new Date(), systemDark = false) {
  if (!appr) return false;
  if (appr.autoDark === "system") return !!systemDark;
  if (appr.autoDark !== "schedule") return false;
  const f = toMin(appr.nightFrom), t = toMin(appr.nightTo);
  if (f == null || t == null || f === t) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return f < t ? m >= f && m < t : m >= f || m < t;
}
// Ekranda qo'llanadigan ko'rinish: shisha fon > tungi (fon yoki avtomatik) > tanlangan mavzu
export function effectiveAppearance(appr, { glass = false, night = false } = {}) {
  if (glass) return { ...appr, mode: "dark", glass: true };
  if (night) {
    const nt = NIGHT_THEMES.includes(appr.nightTheme) ? appr.nightTheme : "dark";
    if (isDarkMode(appr.mode) && (appr.autoDark || "off") === "off") return appr; // fon kechasi: allaqachon qorong'i mavzu bo'lsa — o'zgarmaydi
    const t = THEMES.find((x) => x.key === nt);
    return { ...appr, mode: nt, colorScheme: t?.scheme || appr.colorScheme };
  }
  return appr;
}
// Eski (siyohrang, gradientli) ko'rinish saqlangan bo'lsa — bir marta yangi dizaynga o'tkazamiz.
// Zichlik va sidebar uslubi kabi shaxsiy tanlovlar saqlanadi.
export function migrateAppearance(a) {
  if (!a || typeof a !== "object") return DEFAULT_APPEARANCE;
  if ((a.v || 1) >= APPEARANCE_VERSION) return { ...DEFAULT_APPEARANCE, ...a };
  return { ...DEFAULT_APPEARANCE, density: a.density || DEFAULT_APPEARANCE.density, sidebarStyle: a.sidebarStyle || DEFAULT_APPEARANCE.sidebarStyle };
}

export function buildTheme(appearance) {
  const a = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };
  const isDark = isDarkMode(a.mode);
  let mode = APPEARANCE_MODE_PRESETS[a.mode] || APPEARANCE_MODE_PRESETS.light;
  // Shisha rejimi: fon ustida shaffof panellar — ikkinchi darajali yozuvlar yorqinroq bo'lishi kerak
  if (a.glass) mode = { ...APPEARANCE_MODE_PRESETS.dark, muted: "#CDCDD4", mutedDark: "#E4E4E7", dim: "#B8B8C0", navText: "#D4D4D8", navDim: "#B8B8C0", border: "rgba(255,255,255,0.12)", border2: "rgba(255,255,255,0.18)", chip: "rgba(255,255,255,0.09)", hover: "rgba(255,255,255,0.07)", navBorder: "rgba(255,255,255,0.08)" };
  const preset = APPEARANCE_COLOR_PRESETS[a.colorScheme] || APPEARANCE_COLOR_PRESETS.blue;
  const colorSet = a.colorScheme === "custom"
    ? { primary: a.customPrimary || DEFAULT_APPEARANCE.customPrimary, accent: a.customAccent || DEFAULT_APPEARANCE.customAccent }
    : { primary: isDark ? preset.primaryDark : preset.primary, accent: isDark ? preset.accentDark : preset.accent };
  const softBg = (hex, w) => mixColors(hex, mode.card, w ?? (isDark ? 0.84 : 0.92));
  // urg'u rangi ustidagi matn: oq yetarli darajada o'qilsa oq, aks holda qora (och urg'ularda)
  const onPrimary = contrastRatio("#FFFFFF", colorSet.primary) >= 4 ? "#FFFFFF" : "#111113";
  return {
    ink: mode.ink, ink2: mode.hover, ink3: mode.chip,
    surface: mode.surface, card: mode.card, text: mode.text, muted: mode.muted, mutedDark: mode.mutedDark, dim: mode.dim,
    border: mode.border, border2: mode.border2, borderSoft: mode.borderSoft, hover: mode.hover,
    // nomlar tarixiy: "violet" — asosiy urg'u rangi, "cyan" — ikkinchi darajali
    violet: colorSet.primary, violetDark: mixColors(colorSet.primary, isDark ? "#FFFFFF" : "#000000", 0.16), violetSoft: softBg(colorSet.primary),
    onPrimary,
    cyan: colorSet.accent, cyanBg: softBg(colorSet.accent),
    green: isDark ? "#3FB97A" : "#15803D", greenBg: softBg(isDark ? "#3FB97A" : "#15803D"), greenText: isDark ? "#7DD3A8" : "#166534",
    // yumshoq (tint) fon ustidagi holat matni uchun to'qroq/yorqinroq variantlar
    amberText: isDark ? "#F0C277" : "#92400E", blueText: isDark ? "#9DB8F7" : "#1E40AF",
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
    // oq matnli to'liq rangli tugma/yorliqlar uchun (har ikki rejimda oq matn ≥ 4.5:1)
    greenSolid: "#15803D", roseSolid: "#DC2626", amberSolid: "#B45309", blueSolid: "#1F5FD6",
    primarySolid: contrastRatio("#FFFFFF", colorSet.primary) >= 4 ? colorSet.primary : (a.colorScheme === "custom" ? mixColors(colorSet.primary, "#000000", 0.35) : preset.primary),
    mode: a.glass ? "glass" : a.mode, contrast: !!mode.contrast,
    chart: (isDark ? preset.chartDark : preset.chart) || null,
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
// Holat ranglari (matn, belgi, yorliq): joriy mavzuga mos — yorug'da to'qroq, qorong'ida yorqinroq.
// Modul darajasidagi ro'yxatlarda getter orqali ishlating, aks holda eski mavzu rangi qolib ketadi.
export const SC = {
  get green() { return THEME.green; }, get amber() { return THEME.amber; }, get red() { return THEME.rose; },
  get blue() { return THEME.blue; }, get gray() { return THEME.dim; }, get slate() { return THEME.muted; },
};
// Qorong'i mavzularda to'q rangli matnni (avatar bosh harflari va h.k.) o'qiladigan qilish
export function readableOn(c) {
  return THEME.isDark && c && c[0] === "#" ? mixColors(c, "#FFFFFF", 0.5) : c;
}
// Holat rangi uchun yumshoq fon ustidagi matn rangi (yorliq/chip)
export function tintText(c) {
  const T = THEME;
  return { [T.green]: T.greenText, [T.amber]: T.amberText, [T.rose]: T.roseText, [T.blue]: T.blueText }[c] || c;
}
// Grafiklar uchun kategoriyali palitra — sokin, bir-biridan aniq ajraladigan ranglar
export function CHART_COLORS() {
  if (THEME.chart) return THEME.chart;
  return THEME.isDark
    ? ["#5B8DEF", "#38BDF8", "#E0A23A", "#3FB97A", "#F26464", "#A78BFA", "#F472B6", "#94A3B8", "#2DD4BF", "#FB923C"]
    : ["#1F5FD6", "#0E7490", "#B45309", "#15803D", "#DC2626", "#6D28D9", "#BE185D", "#64748B", "#0F766E", "#C2410C"];
}
