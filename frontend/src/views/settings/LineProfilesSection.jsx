// LineProfilesSection.jsx — Sozlamalar → Savdo → «Yo'nalishlar»: har yo'nalishning rangi, buyurtma raqami prefiksi,
// logosi va hisob-faktura / mijozga xabar rekvizitlari (bo'sh qoldirilgani — umumiy rekvizitlar ishlatiladi).
import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button, Card, Field, getInputStyle } from "../../components/ui.jsx";
import { LINES, LINE_META, cleanPrefix } from "../../lib/lines.js";
import { THEME } from "../../theme.js";

const DEF = { UVIXPRINT: { color: "#1F5FD6", prefix: "UV" }, UVONYX: { color: "#0E7C6B", prefix: "ON" } };
const FIELDS = [
  ["companyLine", "Hisob-fakturadagi kichik yozuv", "UV bosma ustaxonasi"],
  ["cardNumber", "Karta raqami (to'lov uchun)", "8600 1234 5678 9012"],
  ["cardHolder", "Karta egasi", "A. Karimov"],
  ["managerPhone", "Menejer telefoni", "+998 90 000 00 00"],
  ["managerName", "Menejer ismi", "Aziza, menejer"],
];

// Rasmni kichraytirib PNG data URL qiladi (eni ≤ 480px)
function shrink(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 480 / im.width); const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/png")); }; im.onerror = rej; im.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

export function LineProfilesSection({ settings, onSaveSettings }) {
  const init = () => Object.fromEntries(LINES.map((l) => [l, { color: DEF[l].color, prefix: DEF[l].prefix, ...((settings?.lineProfiles || {})[l] || {}) }]));
  const [p, setP] = useState(init);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const set = (l, k, v) => { setSaved(false); setP((x) => ({ ...x, [l]: { ...x[l], [k]: v } })); };
  async function save() {
    const a = cleanPrefix(p.UVIXPRINT.prefix), b = cleanPrefix(p.UVONYX.prefix);
    if (a.length < 2 || b.length < 2) return setErr("Prefiks 2–4 ta harf yoki raqam bo'lishi kerak");
    if (a === b) return setErr("Ikkala yo'nalish prefiksi bir xil bo'lmasin — raqamlar aralashib ketadi");
    setErr("");
    const next = Object.fromEntries(LINES.map((l) => [l, { ...p[l], prefix: cleanPrefix(p[l].prefix) }]));
    await onSaveSettings({ ...settings, lineProfiles: next });
    setSaved(true);
  }
  return (
    <Card data-testid="line-profiles">
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Yo'nalishlar</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 12, lineHeight: 1.45 }}>
        Har yo'nalishning rangi, buyurtma raqami prefiksi (masalan <b>ON</b>-261016-001), logosi va mijozga yuboriladigan rekvizitlar. Bo'sh qoldirilgan rekvizit — umumiy («Mijozlar → Xabarlar»)dagisi ishlatiladi. Prefiks o'zgarsa — eski buyurtma raqamlari o'zgarmaydi.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        {LINES.map((l) => (
          <div key={l} data-line-profile={l} style={{ border: `1px solid ${THEME.border}`, borderTop: `4px solid ${p[l].color}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ fontSize: 14 }}>{LINE_META[l].name}</b>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "end" }}>
              <Field label="Rang"><input type="color" value={p[l].color} onChange={(e) => set(l, "color", e.target.value)} style={{ width: 52, height: 36, padding: 2, border: `1px solid ${THEME.border}`, borderRadius: 8, background: THEME.card }} data-field="color" /></Field>
              <Field label="Raqam prefiksi"><input value={p[l].prefix} onChange={(e) => set(l, "prefix", cleanPrefix(e.target.value))} style={getInputStyle()} data-field="prefix" maxLength={4} /></Field>
            </div>
            <Field label="Logo (hisob-fakturada)">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {p[l].logo ? <img src={p[l].logo} alt="" style={{ height: 40, maxWidth: 160, objectFit: "contain", background: "#fff", borderRadius: 6, border: `1px solid ${THEME.border}` }} /> : <span style={{ fontSize: 12, color: THEME.muted }}>Yo'q — «UVIX» yozuvi</span>}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${THEME.border2}`, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>
                  <ImagePlus size={14} /> Yuklash
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-field="logo" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const u = await shrink(f); if (u.length > 300000) return setErr("Logo juda katta — kichikroq rasm tanlang"); set(l, "logo", u); } catch { setErr("Rasmni o'qib bo'lmadi"); } }} />
                </label>
                {p[l].logo && <button type="button" onClick={() => set(l, "logo", "")} aria-label="Logoni olib tashlash" style={{ border: 0, background: "none", cursor: "pointer", color: THEME.rose }}><Trash2 size={14} /></button>}
              </div>
            </Field>
            {FIELDS.map(([k, label, ph]) => (
              <Field key={k} label={label}><input value={p[l][k] || ""} onChange={(e) => set(l, k, e.target.value)} placeholder={ph} style={getInputStyle()} data-field={k} /></Field>
            ))}
          </div>
        ))}
      </div>
      {err && <div style={{ color: THEME.rose, fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 12 }}>
        {saved && <span style={{ fontSize: 12.5, color: THEME.greenText }}>Saqlandi</span>}
        <Button onClick={save} data-testid="line-profiles-save">Saqlash</Button>
      </div>
    </Card>
  );
}
