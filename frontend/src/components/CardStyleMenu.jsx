// CardStyleMenu.jsx — kartochka rangi uchun umumiy yordamchilar (menyuning o'zi: views/dashboard/DashboardEditor.jsx)
import { createContext, useContext } from "react";

// Dashboard har bir kartochkani shu kontekst bilan o'raydi: { id, style, editing }
export const CardStyleContext = createContext(null);
export const useCardStyle = () => useContext(CardStyleContext);

export const CARD_COLORS = [
  { name: "Ko'k", hex: "#1F5FD6" },
  { name: "Indigo", hex: "#4F46E5" },
  { name: "Firuza", hex: "#0E7490" },
  { name: "Yashil", hex: "#15803D" },
  { name: "Sariq", hex: "#B45309" },
  { name: "To'q sariq", hex: "#C2410C" },
  { name: "Qizil", hex: "#DC2626" },
  { name: "Grafit", hex: "#18181B" },
  { name: "Kulrang", hex: "#71717A" },
];

// Och fonda qora, to'q fonda oq yozuv — har qanday rangda o'qiladigan bo'lsin
export function readableOn(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.42 ? "#18181B" : "#fff";
}

