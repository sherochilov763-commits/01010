// LeadSource.jsx — lid manbasi (ikonka + rang) va Telegram nikneymi (Telegram ko'k rangida)
import { Facebook, Globe, Instagram, Megaphone, MessageCircle, Phone, Send, Store, Tag, Users, Youtube } from "lucide-react";
import { THEME } from "../theme.js";

export const TG_BLUE = "#2AABEE";

// Manba erkin matn — kalit so'z bo'yicha aniqlanadi ("Instagram reklama" → Instagram)
export const LEAD_SOURCES = [
  { key: "telegram", label: "Telegram", icon: Send, color: TG_BLUE, match: ["telegram", "tg", "телеграм"] },
  { key: "instagram", label: "Instagram", icon: Instagram, color: "#E1306C", match: ["instagram", "insta", "ig", "инстаграм"] },
  { key: "facebook", label: "Facebook", icon: Facebook, color: "#1877F2", match: ["facebook", "fb"] },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "#25D366", match: ["whatsapp", "wa", "vatsap"] },
  { key: "phone", label: "Qo'ng'iroq", icon: Phone, color: "#10B981", match: ["qo'ng'iroq", "qongiroq", "telefon", "call", "звонок"] },
  { key: "site", label: "Sayt", icon: Globe, color: "#3B82F6", match: ["sayt", "site", "web", "google", "сайт"] },
  { key: "youtube", label: "YouTube", icon: Youtube, color: "#FF0000", match: ["youtube", "yt"] },
  { key: "referral", label: "Tavsiya", icon: Users, color: "#F59E0B", match: ["tavsiya", "do'st", "dost", "tanish", "referral", "рекоменд"] },
  { key: "office", label: "Ofisga keldi", icon: Store, color: "#8B5CF6", match: ["ofis", "do'kon", "dokon", "keldi", "walk"] },
  { key: "ads", label: "Reklama", icon: Megaphone, color: "#F97316", match: ["reklama", "banner", "реклама"] },
];

export function sourceMeta(source) {
  const s = String(source || "").trim().toLowerCase();
  if (!s) return null;
  const words = s.split(/[\s,.;/·-]+/);
  const found = LEAD_SOURCES.find((x) => x.match.some((m) => (m.length <= 2 ? words.includes(m) : s.includes(m))));
  return found ? { ...found, text: String(source).trim() } : { key: "other", label: source, text: String(source).trim(), icon: Tag, color: THEME.muted };
}

// Manba belgisi: rangli doira ichida ikonka + nomi
export function SourceChip({ source, size = "sm" }) {
  const m = sourceMeta(source);
  if (!m) return null;
  const Icon = m.icon;
  const big = size === "md";
  const d = big ? 20 : 17;
  return (
    <span data-testid="source-chip" title={`Manba: ${m.text}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: big ? 12.5 : 12, fontWeight: 500, color: THEME.muted, minWidth: 0, maxWidth: "100%" }}>
      <span style={{ width: d, height: d, borderRadius: 5, background: `${m.color}1C`, color: m.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={big ? 11 : 10} strokeWidth={2.4} />
      </span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.text}</span>
    </span>
  );
}

// Telegram nikneymi — Telegram ko'k rangida, bosilsa Telegram'da ochiladi
export function TgHandle({ username, size = "sm" }) {
  const u = String(username || "").replace(/^@/, "").trim();
  if (!u) return null;
  return (
    <a data-testid="tg-handle" href={`https://t.me/${u}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      title="Telegram'da ochish"
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: size === "md" ? 13 : 11.5, fontWeight: 600, color: THEME.isDark ? "#5EB8F0" : "#1A7DB8", textDecoration: "none",
        background: `${TG_BLUE}17`, padding: size === "md" ? "3px 9px" : "2px 7px", borderRadius: 6, maxWidth: "100%", alignSelf: "flex-start" }}>
      <Send size={size === "md" ? 12 : 10} strokeWidth={2.4} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{u}</span>
    </a>
  );
}

// Avtomatik yozilgan "Telegram: @user" izohini takrorlamaslik uchun
export const isAutoTgNote = (lead) => !!lead.telegramUsername && String(lead.notes || "").trim() === `Telegram: @${String(lead.telegramUsername).replace(/^@/, "")}`;
