// BackgroundSection.jsx — shaxsiy fon (oboi) va shisha rejimi. Faqat shu xodim uchun, faqat kompyuterda.
import { useRef, useState } from "react";
import { Check, ImagePlus, Monitor } from "lucide-react";
import { Card } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { BG_PRESETS, DAY_PHASES, dayPhase, shrinkImage, useBgSuppressed } from "../../lib/background.js";

export function BackgroundSection({ bgState }) {
  const { bg, save } = bgState;
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dim, setDim] = useState(null); // surgich harakatlanayotganda — qo'yib yuborilganda saqlanadi
  const fileRef = useRef(null);
  const now = dayPhase();
  const suppressed = useBgSuppressed();

  async function apply(patch) {
    setMsg("");
    try { await save({ ...bg, ...patch }); } catch (e) { setMsg(e.message); }
  }
  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setMsg("");
    try { const image = await shrinkImage(f); await save({ ...bg, kind: "custom", image }); setMsg("Fon saqlandi"); }
    catch (er) { setMsg(er.message); } finally { setBusy(false); }
  }

  const tile = (key, label, active, onClick, preview) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={active} data-bg={key}
      style={{ display: "flex", flexDirection: "column", gap: 6, padding: 0, border: 0, background: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: THEME.text, minWidth: 0 }}>
      <span style={{ position: "relative", display: "block", aspectRatio: "16 / 10", borderRadius: 8, overflow: "hidden", border: `${active ? 2 : 1}px solid ${active ? THEME.violet : THEME.border2}`, background: THEME.chip }}>
        {preview}
        {active && <span style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: "50%", background: THEME.violet, color: THEME.onPrimary, display: "grid", placeItems: "center" }}><Check size={12} strokeWidth={3} /></span>}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </button>
  );
  const img = (url) => <span style={{ position: "absolute", inset: 0, backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" }} />;
  const toggle = (on, onChange, label, hint, testid) => (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }} data-testid={testid}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 17, height: 17, marginTop: 1, accentColor: THEME.violet }} />
      <span><span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>{hint && <span style={{ display: "block", fontSize: 12, color: THEME.dim, marginTop: 1 }}>{hint}</span>}</span>
    </label>
  );

  return (
    <Card data-testid="bg-settings">
      <div style={{ fontWeight: 600, fontSize: 14.5 }}>Fon va shisha rejimi</div>
      <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <Monitor size={13} /> Faqat siz uchun. Kompyuterda ko'rinadi; telefon va planshetda tezlik uchun ko'rsatilmaydi.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
        {tile("none", "Fonsiz", bg.kind === "none", () => apply({ kind: "none", glass: false }), <span style={{ position: "absolute", inset: 0, background: THEME.surface }} />)}
        {BG_PRESETS.map((p) => tile(p.key, p.label, bg.kind === "preset" && bg.preset === p.key, () => apply({ kind: "preset", preset: p.key }), img(p.url)))}
        {tile("dynamic", `Kun vaqti bo'yicha · ${now.label.toLowerCase()}`, bg.kind === "dynamic", () => apply({ kind: "dynamic" }),
          <span style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
            {DAY_PHASES.map((p) => <span key={p.key} style={{ backgroundImage: `url("${p.url}")`, backgroundSize: "cover", backgroundPosition: "center" }} />)}
          </span>)}
        {tile("custom", busy ? "Yuklanmoqda..." : bg.kind === "custom" ? "O'z rasmim · almashtirish" : "O'z rasmim", bg.kind === "custom", () => fileRef.current?.click(),
          bg.kind === "custom" && bg.image ? img(bg.image) : <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: THEME.dim }}><ImagePlus size={22} /></span>)}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} style={{ display: "none" }} aria-label="Fon rasmini tanlash" />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, opacity: bg.kind === "none" ? 0.5 : 1, pointerEvents: bg.kind === "none" ? "none" : "auto" }}>
        {toggle(!!bg.glass, (v) => apply({ glass: v }), "Shisha rejimi", "Panellar shaffof bo'ladi, fon ko'rinib turadi, yozuvlar oq (Bitrix24 uslubi)", "glass-toggle")}
        {bg.kind === "dynamic" && !bg.glass && toggle(!!bg.nightDark, (v) => apply({ nightDark: v }), "Oqshom va tunda qorong'i rejim", "17:00 dan 05:00 gacha ko'z charchamasligi uchun Grafit ranglar")}
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          Fonni xiralashtirish
          <input type="range" min={0} max={0.4} step={0.05} value={dim ?? bg.dim ?? 0} onChange={(e) => setDim(Number(e.target.value))}
            onPointerUp={() => { if (dim != null) { apply({ dim }); setDim(null); } }} onKeyUp={() => { if (dim != null) { apply({ dim }); setDim(null); } }}
            style={{ accentColor: THEME.violet, width: 140 }} aria-label="Fonni xiralashtirish" />
        </label>
      </div>
      {suppressed && bg.kind !== "none" && (
        <div role="status" data-testid="bg-suppressed" style={{ fontSize: 12.5, marginTop: 12, padding: "8px 10px", borderRadius: 8, background: THEME.amberBg, color: THEME.amber }}>
          Fon saqlandi, lekin bu qurilmada ko'rsatilmaydi (telefon yoki planshet). Kompyuterda ochganingizda ko'rinadi.
        </div>
      )}
      {msg && <div style={{ fontSize: 12.5, marginTop: 10, color: /saqlandi/i.test(msg) ? THEME.green : THEME.rose }} role="status">{msg}</div>}
    </Card>
  );
}
