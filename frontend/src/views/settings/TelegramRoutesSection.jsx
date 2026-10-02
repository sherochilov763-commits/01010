// TelegramRoutesSection.jsx — har xil Telegram xabari qayerga borishi: xodimlar guruhi yoki adminning shaxsiy chati.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Users, User } from "lucide-react";
import { Button } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { fetchTelegramRoutes } from "../../storage.js";
import { TelegramLinkCard } from "../../components/TelegramLinkCard.jsx";

const GROUPS = [
  ["Savdo", [["orders", "Yangi buyurtma"], ["payments", "Yangi to'lov"], ["expenses", "Yangi rasxod"]]],
  ["Fayllar", [["dailyReport", "Kunlik Excel hisobot"], ["backup", "Baza zaxira nusxasi"], ["monthlyReport", "Oylik PDF hisobot (1-sanada)"]]],
  ["Davomat", [["attendanceDaily", "Kunlik: kim keldi / kelmadi"], ["attendanceAbsent", "«Hali kelmadi» (30 daqiqadan keyin)"], ["attendanceReports", "Haftalik va oylik davomat"]]],
  ["Boshqa", [["paint", "Bo'yoq zahirasi kam qoldi"], ["debts", "Kunlik qarz xulosasi"], ["system", "Tizim ogohlantirishlari"]]],
];
const OPTS = [["group", "Guruh"], ["admin", "Menga"], ["both", "Ikkalasi"], ["off", "O'chiq"]];

export function TelegramRoutesSection({ settings, onSaveSettings }) {
  const [info, setInfo] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [saved, setSaved] = useState("");
  const load = () => fetchTelegramRoutes().then((d) => { setInfo(d); setRoutes((r) => r || d.routes); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  if (!info || !routes) return null;
  const dirty = JSON.stringify(routes) !== JSON.stringify(info.routes);
  const uses = (v) => Object.values(routes).includes(v) || Object.values(routes).includes("both");
  async function save() {
    await onSaveSettings({ ...settings, tgRoutes: routes });
    setSaved("Saqlandi"); setTimeout(() => setSaved(""), 2000);
    load();
  }
  return (
    <div style={{ borderTop: `1px dashed ${THEME.border}`, marginTop: 14, paddingTop: 14 }} data-testid="tg-routes">
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>Qaysi xabar qayerga borsin</div>
      <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>
        <Users size={12} style={{ verticalAlign: -2 }} /> <b>Guruh</b> — xodimlar ko'radigan chat (yuqoridagi Chat ID). <User size={12} style={{ verticalAlign: -2 }} /> <b>Menga</b> — faqat sizning shaxsiy Telegram'ingiz (UVIX boti orqali). Pul, zaxira va xodimlar hisobotini shaxsiy qoldirish tavsiya etiladi.
      </div>
      {uses("admin") && !info.adminLinked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 12, background: THEME.amberBg, marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, display: "flex", gap: 8, lineHeight: 1.45 }}><AlertTriangle size={15} style={{ color: THEME.amber, flexShrink: 0, marginTop: 1 }} />Shaxsiy Telegram'ingiz hali ulanmagan — ulamaguningizcha «Menga» xabarlari ham guruhga ketadi.</div>
          <TelegramLinkCard compact />
        </div>
      )}
      {uses("group") && !info.groupConfigured && (
        <div style={{ fontSize: 12.5, display: "flex", gap: 8, padding: 10, borderRadius: 12, background: THEME.surface, marginBottom: 12, lineHeight: 1.45 }}><Info size={15} style={{ color: THEME.muted, flexShrink: 0, marginTop: 1 }} />Guruh chat ID kiritilmagan — «Guruh» xabarlari yuborilmaydi.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {GROUPS.map(([title, rows]) => (
          <div key={title}>
            <div style={{ fontSize: 11.5, color: THEME.muted, fontWeight: 600, marginBottom: 6 }}>{title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} data-route={k}>
                  <div style={{ flex: "1 1 180px", fontSize: 13 }}>{label}{routes[k] !== info.defaults[k] && <span style={{ color: THEME.muted, fontSize: 11 }}> · o'zgartirilgan</span>}</div>
                  <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 2, padding: 2, borderRadius: 10, background: THEME.surface }}>
                    {OPTS.map(([v, l]) => {
                      const on = routes[k] === v;
                      return <button key={v} type="button" role="radio" aria-checked={on} data-opt={v} onClick={() => setRoutes((r) => ({ ...r, [k]: v }))}
                        style={{ padding: "6px 10px", borderRadius: 8, border: 0, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                          background: on ? (v === "off" ? THEME.chip : THEME.card) : "transparent", color: on ? (v === "off" ? THEME.muted : THEME.text) : THEME.muted, boxShadow: on ? THEME.shadowSm : "none" }}>{l}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <Button onClick={save} disabled={!dirty}>Saqlash</Button>
        <Button variant="ghost" onClick={() => setRoutes(info.defaults)}>Tavsiya etilganga qaytarish</Button>
        {saved && <span style={{ fontSize: 12.5, color: THEME.green, display: "inline-flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={14} /> {saved}</span>}
      </div>
    </div>
  );
}
