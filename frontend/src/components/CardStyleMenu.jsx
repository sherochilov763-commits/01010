// CardStyleMenu.jsx — kartochka rangi uchun umumiy yordamchilar (menyuning o'zi: views/dashboard/DashboardEditor.jsx)
import { createContext, useContext } from "react";

// Dashboard har bir kartochkani shu kontekst bilan o'raydi: { id, style, editing }
export const CardStyleContext = createContext(null);
export const useCardStyle = () => useContext(CardStyleContext);

export const CARD_COLORS = [
  { name: "Binafsha", hex: "#7C5CFC" },
  { name: "Ko'k", hex: "#3B82F6" },
  { name: "Firuza", hex: "#06B6D4" },
  { name: "Yashil", hex: "#10B981" },
  { name: "Sariq", hex: "#F59E0B" },
  { name: "To'q sariq", hex: "#F97316" },
  { name: "Qizil", hex: "#EF4444" },
  { name: "Pushti", hex: "#EC4899" },
  { name: "Kulrang", hex: "#64748B" },
];

// Och fonda qora, to'q fonda oq yozuv — har qanday rangda o'qiladigan bo'lsin
export function readableOn(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.42 ? "#16131F" : "#fff";
}

