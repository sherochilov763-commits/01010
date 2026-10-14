// chatPalette.js — Chatlar bo'limi ranglari (Telegram tuzilishi saqlanadi).
// Yorug'/Kulrang → LIGHT, Grafit/Shisha → DARK; yangi mavzularda (Qog'oz, Tun ko'k, OLED...) joriy mavzu ranglaridan hisoblanadi.
// Obyekt joyida yangilanadi, shuning uchun barcha komponentlar keyingi chizishda yangi qiymatni ko'radi.
import { mixColors, withAlpha } from "../../theme.js";

const DARK = {
  bg: "#0C0C0E", panel: "#111113", hover: "#1C1C1F", border: "#202023", text: "#EDEDEF", muted: "#9D9DA6", soft: "#C8C8CE",
  blue: "#3B7BEA", blueHover: "#5089EE", link: "#7AA7F5", selected: "#1A2333", outBubble: "#1E3A66", inBubble: "#1C1C1F",
  red: "#F26464", redText: "#FCA5A5", green: "#3FB97A", greenSolid: "#15803D", dayBg: "rgba(28,28,31,0.92)", overlay: "rgba(255,255,255,0.07)", overlay2: "rgba(255,255,255,0.14)",
  outMuted: "rgba(255,255,255,0.72)", shadow: "0 16px 40px rgba(0,0,0,0.55)", tg: "#5EB8F0", tgSolid: "#176FA3",
  noteBg: "rgba(224,162,58,0.12)", noteBorder: "rgba(224,162,58,0.45)", noteText: "#F3D9A8", noteHead: "#E0A23A",
};
const LIGHT = {
  bg: "#F1F1F3", panel: "#FFFFFF", hover: "#F4F4F5", border: "#E7E7EA", text: "#18181B", muted: "#62626B", soft: "#3F3F46",
  blue: "#1F5FD6", blueHover: "#1A52B8", link: "#1F5FD6", selected: "#EAF1FC", outBubble: "#DCE8FB", inBubble: "#FFFFFF",
  red: "#DC2626", redText: "#991B1B", green: "#15803D", greenSolid: "#15803D", dayBg: "rgba(255,255,255,0.92)", overlay: "rgba(24,24,27,0.05)", overlay2: "rgba(24,24,27,0.09)",
  outMuted: "rgba(24,24,27,0.6)", shadow: "0 12px 32px rgba(16,16,20,0.14)", tg: "#176FA3", tgSolid: "#176FA3",
  noteBg: "#FFF7E6", noteBorder: "#E8C27A", noteText: "#7A4B00", noteHead: "#9A6200",
};
export const C = { ...DARK };

// Mavzu ranglaridan chat palitrasi (Qog'oz, CMYK, Yuqori kontrast, Tun ko'k, Iliq tun, OLED qora)
function derived(T) {
  const base = T.isDark ? DARK : LIGHT;
  return {
    ...base,
    bg: T.surface, panel: T.card, hover: T.hover, border: T.border, text: T.text, muted: T.muted, soft: T.mutedDark,
    blue: T.primarySolid, blueHover: mixColors(T.primarySolid, "#000000", 0.12), link: T.violet,
    selected: T.navActiveBg, outBubble: mixColors(T.violet, T.card, T.isDark ? 0.72 : 0.86), inBubble: T.isDark ? T.hover : T.card,
    red: T.rose, redText: T.roseText, green: T.green,
    dayBg: withAlpha(T.card, 0.92), shadow: T.shadowLg,
  };
}
export function applyChatPalette(T) {
  // eski chaqiruv: applyChatPalette(isDark)
  if (typeof T === "boolean" || !T) { Object.assign(C, T ? DARK : LIGHT); return; }
  if (T.mode === "light" || T.mode === "soft") Object.assign(C, LIGHT);
  else if (T.mode === "dark" || T.mode === "glass") Object.assign(C, DARK);
  else Object.assign(C, derived(T));
}
