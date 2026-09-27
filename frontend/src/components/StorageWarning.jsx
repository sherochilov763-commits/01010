// StorageWarning.jsx — baza doimiy diskda bo'lmasa (Railway Volume yo'q) adminga qizil ogohlantirish
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchHealth } from "../storage.js";
import { THEME } from "../theme.js";

export function StorageWarning({ onOpenSettings }) {
  const [bad, setBad] = useState(false);
  useEffect(() => {
    fetchHealth().then((h) => setBad(h?.storage?.persistent === false)).catch(() => {});
  }, []);
  if (!bad) return null;
  return (
    <div role="alert" style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "12px 24px 0", padding: "12px 14px", borderRadius: 12,
      background: THEME.roseBg, border: `1px solid ${THEME.roseBorder}`, color: THEME.roseText, fontSize: 13, lineHeight: 1.45 }} className="uvix-storage-warn">
      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1, color: THEME.rose }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Diqqat: ma'lumotlar doimiy diskda saqlanmayapti.</b> Keyingi deploy'da barcha buyurtma, rasxod va lidlar o'chib ketadi.
        Railway'da Volume (<b>/data</b>) ulang va <b>DB_PATH=/data/uvix.db</b> qo'ying.{" "}
        {onOpenSettings && (
          <button type="button" onClick={onOpenSettings} style={{ border: 0, background: "none", padding: 0, color: THEME.rose, fontWeight: 700, textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
            Batafsil
          </button>
        )}
      </div>
      <style>{`@media (max-width: 768px){ .uvix-storage-warn{ margin: 10px 12px 0 !important; } }`}</style>
    </div>
  );
}
