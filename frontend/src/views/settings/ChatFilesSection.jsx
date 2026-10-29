// ChatFilesSection.jsx — Sozlamalar → Ma'lumotlar → «Chat fayllari» (116-eskiz):
// nima o'chirilishi mumkin / nima o'chmaydi, qo'lda tozalash (tasdiq bilan), saqlash muddati, video ochilganda, disk 80%.
// Server: backend/chat-files.js. Buyurtma, dizayn, davomat va buyurtma rasmlariga tegilmaydi.
import { useEffect, useState } from "react";
import { MessageCircle, Trash2, X } from "lucide-react";
import { Button, Card } from "../../components/ui.jsx";
import { cleanChatFiles, fetchChatFiles, saveChatFilesConfig } from "../../storage.js";
import { THEME } from "../../theme.js";
import { fmtBytes } from "./StorageSection.jsx";

const KEEP = [[30, "30 kun"], [60, "60 kun"], [90, "90 kun"], [0, "Cheksiz"]];

export function Switch({ on, onChange, label, testid, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} data-testid={testid} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 44, height: 26, borderRadius: 13, border: 0, position: "relative", cursor: "pointer", flexShrink: 0, padding: 0, background: on ? THEME.green : THEME.border2 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
    </button>
  );
}

export function ChatFilesSection({ onCleaned }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [sheet, setSheet] = useState(null); // { orphans, old, busy, done }
  const load = () => fetchChatFiles().then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message || "Yuklab bo'lmadi"));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!sheet || sheet.busy) return undefined;
    const onKey = (e) => e.key === "Escape" && setSheet(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);
  if (err && !d) return <Card><div style={{ fontSize: 12.5, color: THEME.rose }}>{err}</div></Card>;
  if (!d) return null;
  const cfg = d.config;
  const keepTxt = cfg.keepDays ? `${cfg.keepDays} kundan eski` : "Eski (muddat — cheksiz)";
  const rows = [
    { k: "orphan", c: THEME.rose, t: "Takror va yetim", s: `hech qaysi xabarda yo'q · ${d.orphan.count} ta`, v: d.orphan },
    { k: "old", c: THEME.amber || "#B45309", t: keepTxt, s: `faqat chatda · Telegram'da qoladi · ${d.old.count} ta`, v: d.old },
    { k: "attached", c: THEME.violet, t: "Biriktirilgan", s: `buyurtma / dizayn / vazifa — o'chmaydi · ${d.attached.count} ta`, v: d.attached },
    { k: "recent", c: THEME.muted, t: "Qolgan (yangi)", s: `${d.recent.count} ta`, v: d.recent },
  ];
  const max = Math.max(1, ...rows.map((r) => r.v.size));
  const can = d.orphan.size + d.old.size;
  async function setCfg(patch) {
    setErr("");
    try { setD(await saveChatFilesConfig({ ...cfg, ...patch })); } catch (e) { setErr(e.message); }
  }
  async function doClean() {
    setSheet((s) => ({ ...s, busy: true }));
    try {
      const r = await cleanChatFiles({ orphans: sheet.orphans, old: sheet.old });
      setD(r); setSheet((s) => ({ ...s, busy: false, done: r })); onCleaned?.();
    } catch (e) { setSheet((s) => ({ ...s, busy: false, err: e.message })); }
  }
  const pickSize = sheet ? (sheet.orphans ? d.orphan.size : 0) + (sheet.old ? d.old.size : 0) : 0;
  const box = (on) => ({ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, background: on ? THEME.violet : "transparent", border: on ? "none" : `2px solid ${THEME.border2}`, color: "#fff" });
  return (
    <Card data-testid="chat-files">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MessageCircle size={16} color={THEME.muted} />
        <div style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>Chat fayllari</div>
        <b style={{ fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{fmtBytes(d.orphan.size + d.old.size + d.attached.size + d.recent.size)}</b>
      </div>
      <div style={{ marginTop: 10, border: `1px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <div key={r.k} data-cf={r.k} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", borderTop: i ? `1px solid ${THEME.border}` : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.t}</div>
              <div style={{ fontSize: 11.5, color: THEME.muted }}>{r.s}</div>
              <div style={{ height: 4, borderRadius: 2, background: THEME.chip, marginTop: 5, overflow: "hidden" }}><div style={{ width: `${Math.max(2, Math.round((r.v.size / max) * 100))}%`, height: "100%", background: r.c }} /></div>
            </div>
            <b style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtBytes(r.v.size)}</b>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <Button onClick={() => setSheet({ orphans: d.orphan.count > 0, old: d.old.count > 0 })} disabled={!can} data-testid="cf-clean-open" style={{ width: "100%" }}>
          <Trash2 size={14} /> {can ? `Tozalash… (${fmtBytes(can)})` : "Tozalanadigan fayl yo'q"}
        </Button>
      </div>

      <div style={{ marginTop: 14, borderTop: `1px solid ${THEME.border}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>Video va hujjatlar — ochilganda yuklansin</div><div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>Serverga oldindan yozilmaydi; ▶ yoki «Yuklab olish» bosilganda Telegram'dan olinadi</div></div>
          <Switch on={cfg.lazyDocs} label="Video va hujjatlar — ochilganda yuklansin" testid="cf-lazy" onChange={(v) => setCfg({ lazyDocs: v })} />
        </div>
        <div style={{ padding: "12px 0", borderTop: `1px solid ${THEME.border}` }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Saqlash muddati</div>
          <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>Har kuni: muddati o'tgan chat fayllari serverdan o'chadi (Telegram'da qoladi, chatda «↻ Qayta yuklash»)</div>
          <div role="group" aria-label="Saqlash muddati" style={{ display: "flex", background: THEME.chip, borderRadius: 9, padding: 3, marginTop: 8 }}>
            {KEEP.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={cfg.keepDays === v} data-keep={v} onClick={() => setCfg({ keepDays: v })}
                style={{ flex: 1, border: 0, borderRadius: 7, padding: "6px 0", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: cfg.keepDays === v ? THEME.card : "transparent", color: cfg.keepDays === v ? THEME.text : THEME.muted }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0 2px", borderTop: `1px solid ${THEME.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13.5 }}>Disk 80% to'lsa — avtomatik</div><div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>Eng eski chat fayllaridan boshlab 75% gacha; sizga bildirishnoma keladi</div></div>
          <Switch on={cfg.autoClean} label="Disk 80% to'lsa — avtomatik" testid="cf-auto" onChange={(v) => setCfg({ autoClean: v })} />
        </div>
        <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 8 }}>Buyurtma, dizayn, vazifa, davomat selfilari va buyurtma rasmlari hech qachon o'chirilmaydi.</div>
        {err && <div role="alert" style={{ fontSize: 12.5, color: THEME.rose, marginTop: 6 }}>{err}</div>}
      </div>

      {sheet && (
        <div role="dialog" aria-modal="true" aria-label="Chat fayllarini tozalash" data-testid="cf-sheet" onClick={(e) => { if (e.target === e.currentTarget && !sheet.busy) setSheet(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "min(440px, 100%)", background: THEME.card, color: THEME.text, borderRadius: 16, boxShadow: THEME.shadowLg, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 16, flex: 1 }}>Chat fayllarini tozalash</b>
              <button type="button" aria-label="Yopish" disabled={sheet.busy} onClick={() => setSheet(null)} style={{ border: 0, background: "none", color: THEME.muted, cursor: "pointer", padding: 4, display: "flex" }}><X size={18} /></button>
            </div>
            {sheet.done ? (
              <div data-testid="cf-done" style={{ padding: "18px 0 6px", fontSize: 14 }}>
                <b style={{ color: THEME.green }}>✓ {fmtBytes(sheet.done.size)} bo'shatildi</b> — {sheet.done.count} ta fayl o'chirildi.
                <div style={{ marginTop: 14 }}><Button onClick={() => setSheet(null)} style={{ width: "100%" }}>Yopish</Button></div>
              </div>
            ) : (<>
              {[["orphans", "Takror va yetim fayllar", `${d.orphan.count} ta · ${fmtBytes(d.orphan.size)} · hech qaysi xabarda yo'q`, d.orphan.count],
                ["old", `${keepTxt} chat fayllari`, `${d.old.count} ta · ${fmtBytes(d.old.size)} · Telegram'da qoladi, ochilganda qayta yuklanadi`, d.old.count]].map(([k, t, s, n]) => (
                <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, cursor: n ? "pointer" : "default", opacity: n ? 1 : 0.5 }}>
                  <input type="checkbox" checked={!!sheet[k]} disabled={!n || sheet.busy} onChange={(e) => setSheet((x) => ({ ...x, [k]: e.target.checked }))} data-testid={`cf-pick-${k}`} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
                  <span aria-hidden="true" style={box(!!sheet[k])}>{sheet[k] ? "✓" : ""}</span>
                  <span style={{ flex: 1, fontSize: 13.5 }}><b>{t}</b><span style={{ display: "block", fontSize: 12, color: THEME.muted }}>{s}</span></span>
                </label>
              ))}
              <div style={{ marginTop: 14, padding: "9px 11px", borderRadius: 10, background: THEME.violetSoft, color: THEME.violet, fontSize: 12, lineHeight: 1.45 }}>🔒 Buyurtma, dizayn vazifasi, davomat selfilari va buyurtma rasmlariga tegilmaydi.</div>
              {sheet.err && <div role="alert" style={{ fontSize: 12.5, color: THEME.rose, marginTop: 8 }}>{sheet.err}</div>}
              <button type="button" onClick={doClean} disabled={sheet.busy || !pickSize} data-testid="cf-clean-confirm"
                style={{ marginTop: 14, width: "100%", height: 46, borderRadius: 12, border: 0, background: THEME.rose, color: "#fff", fontWeight: 700, fontSize: 15, cursor: sheet.busy || !pickSize ? "default" : "pointer", opacity: sheet.busy || !pickSize ? 0.6 : 1, fontFamily: "inherit" }}>
                {sheet.busy ? "Tozalanmoqda…" : `${fmtBytes(pickSize)} bo'shatish`}
              </button>
              <div style={{ fontSize: 11.5, color: THEME.muted, textAlign: "center", marginTop: 6 }}>O'chirilgan fayllar serverdan qaytarilmaydi</div>
              <button type="button" onClick={() => setSheet(null)} disabled={sheet.busy} style={{ marginTop: 8, width: "100%", height: 38, borderRadius: 11, border: `1px solid ${THEME.border}`, background: "none", color: THEME.text, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Bekor qilish</button>
            </>)}
          </div>
        </div>
      )}
    </Card>
  );
}
