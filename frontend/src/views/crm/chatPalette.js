// chatPalette.js — Chatlar bo'limi ranglari. Yorug' rejimda yorug', Grafit rejimda qorong'i (Telegram tuzilishi saqlanadi).
// Obyekt joyida yangilanadi, shuning uchun barcha komponentlar keyingi chizishda yangi qiymatni ko'radi.
const DARK = {
  bg: "#0C0C0E", panel: "#111113", hover: "#1C1C1F", border: "#202023", text: "#EDEDEF", muted: "#8C8C96", soft: "#C8C8CE",
  blue: "#3B7BEA", blueHover: "#5089EE", link: "#7AA7F5", selected: "#1A2333", outBubble: "#1E3A66", inBubble: "#1C1C1F",
  red: "#F26464", redText: "#FCA5A5", green: "#3FB97A", dayBg: "rgba(28,28,31,0.92)", overlay: "rgba(255,255,255,0.07)", overlay2: "rgba(255,255,255,0.14)",
  outMuted: "rgba(255,255,255,0.72)", shadow: "0 16px 40px rgba(0,0,0,0.55)",
};
const LIGHT = {
  bg: "#F1F1F3", panel: "#FFFFFF", hover: "#F4F4F5", border: "#E7E7EA", text: "#18181B", muted: "#71717A", soft: "#3F3F46",
  blue: "#1F5FD6", blueHover: "#1A52B8", link: "#1F5FD6", selected: "#EAF1FC", outBubble: "#DCE8FB", inBubble: "#FFFFFF",
  red: "#DC2626", redText: "#991B1B", green: "#15803D", dayBg: "rgba(255,255,255,0.92)", overlay: "rgba(24,24,27,0.05)", overlay2: "rgba(24,24,27,0.09)",
  outMuted: "rgba(24,24,27,0.6)", shadow: "0 12px 32px rgba(16,16,20,0.14)",
};
export const C = { ...DARK };
export function applyChatPalette(isDark) { Object.assign(C, isDark ? DARK : LIGHT); }
