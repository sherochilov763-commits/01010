// TgPrefsCard.jsx — «Telegram'imga keladigan xabarlar»: xodim o'zi uchun keraksiz turlarni o'chiradi.
// Ro'yxatda faqat shu xodimga haqiqatan keladigan turlar (admin sozlagan yo'nalish va rol bo'yicha).
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { fetchTgPrefs, saveTgPrefs } from "../storage.js";
import { TelegramLinkCard } from "./TelegramLinkCard.jsx";
import { THEME } from "../theme.js";

export function TgPrefsCard({ Card, showLink = true }) {
  const [d, setD] = useState(null);
  const load = () => fetchTgPrefs().then(setD).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  if (!d) return null;
  async function toggle(cat, on) {
    setD((x) => ({ ...x, items: x.items.map((i) => (i.cat === cat ? { ...i, on } : i)) }));
    try { await saveTgPrefs({ [cat]: on }); } catch { load(); }
  }
  const body = (
    <div data-testid="tg-prefs">
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14.5 }}><Send size={16} color="#229ED9" /> Telegram'imga keladigan xabarlar</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 3, lineHeight: 1.45 }}>UVIX boti faqat sizga tegishli xabarlarni shaxsan yuboradi. Keraksizini o'chirib qo'ying.</div>
      {!d.linked && showLink && <div style={{ marginTop: 12 }}><TelegramLinkCard compact /></div>}
      {d.items.length === 0 ? <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 10 }}>Sizga hozircha umumiy xabarlar yuborilmaydi — faqat davomat eslatmalari.</div> : (
        <div style={{ display: "grid", gap: 2, marginTop: 10, opacity: d.linked ? 1 : 0.55 }}>
          {d.items.map((i) => (
            <label key={i.cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", fontSize: 13.5, cursor: "pointer", borderTop: `1px solid ${THEME.border}` }} data-tg-cat={i.cat}>
              <span style={{ flex: 1 }}>{i.label}</span>
              <input type="checkbox" checked={i.on} onChange={(e) => toggle(i.cat, e.target.checked)} style={{ width: 17, height: 17, accentColor: THEME.violet }} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
  return Card ? <Card>{body}</Card> : body;
}
