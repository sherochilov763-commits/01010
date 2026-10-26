// StorageSection.jsx — Sozlamalar → Ma'lumotlar → «Xotira»: baza va fayllar qancha joy egallaydi (25-band).
import { useEffect, useState } from "react";
import { Database, HardDrive, Image as ImageIcon, MessageCircle, RefreshCw, UserCheck } from "lucide-react";
import { Button, Card } from "../../components/ui.jsx";
import { fetchStorageStats } from "../../storage.js";
import { THEME } from "../../theme.js";

export const fmtBytes = (b) => {
  const n = Number(b) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(".", ",")} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
};

export function StorageSection() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = (fresh) => { setBusy(true); fetchStorageStats(fresh).then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message || "Yuklab bo'lmadi")).finally(() => setBusy(false)); };
  useEffect(() => { load(false); }, []);
  // «Chat fayllari»da tozalangach — hajm yangilansin
  useEffect(() => { const on = () => load(true); window.addEventListener("uvix:storage-refresh", on); return () => window.removeEventListener("uvix:storage-refresh", on); }, []);
  const rows = d ? [
    { k: "db", icon: Database, c: THEME.violet, t: "Baza (buyurtma, to'lov, rasxod, lid)", s: `${d.db.orders} buyurtma · ${d.db.transactions} rasxod · ${d.db.leads} lid`, v: d.db.size },
    { k: "photos", icon: ImageIcon, c: "#DB2777", t: "Buyurtma rasmlari", s: `${d.files.orderPhotos.count} fayl (siqilgan + kichik nusxa)`, v: d.files.orderPhotos.size },
    { k: "chat", icon: MessageCircle, c: "#176FA3", t: "Chat fayllari va boshqalar", s: `${d.files.chat.count} fayl (Telegram rasm, video, hujjat)`, v: d.files.chat.size },
    { k: "att", icon: UserCheck, c: THEME.green, t: "Davomat selfilari", s: `${d.files.attendance.count} fayl`, v: d.files.attendance.size },
  ] : [];
  const max = Math.max(1, ...rows.map((r) => r.v));
  const used = d?.disk ? d.disk.total - d.disk.free : 0;
  const pct = d?.disk?.total ? Math.round((used / d.disk.total) * 100) : null;
  return (
    <Card data-testid="storage-section">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <HardDrive size={16} color={THEME.muted} />
        <div style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>Xotira</div>
        <Button variant="ghost" onClick={() => load(true)} disabled={busy} data-testid="storage-refresh"><RefreshCw size={13} /> Yangilash</Button>
      </div>
      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4, lineHeight: 1.45 }}>
        Server diskida nima qancha joy egallaydi. Rasmlar yuklashdan oldin siqiladi (2400 px, ~0,5 MB — chizmalar ham o'qiladi), ro'yxat uchun kichik nusxa (~15 KB) saqlanadi.
      </div>
      {err && <div style={{ color: THEME.rose, fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      {d && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <b data-testid="storage-total" style={{ fontSize: 22, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>{fmtBytes(d.total)}</b>
            <span style={{ fontSize: 12.5, color: THEME.muted }}>jami ishlatilmoqda</span>
            {pct != null && <span style={{ fontSize: 12.5, color: pct > 85 ? THEME.rose : THEME.muted }}>· disk {pct}% band, {fmtBytes(d.disk.free)} bo'sh</span>}
          </div>
          {pct != null && (
            <div style={{ height: 8, borderRadius: 4, background: THEME.chip, overflow: "hidden", marginTop: 8 }} aria-label={`Disk ${pct}% band`}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct > 85 ? THEME.rose : pct > 65 ? THEME.amber : THEME.green, transition: "width .6s ease" }} />
            </div>
          )}
          <div style={{ marginTop: 12, border: `1px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden" }}>
            {rows.map((r, i) => {
              const I = r.icon;
              return (
                <div key={r.k} data-storage={r.k} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderTop: i ? `1px solid ${THEME.border}` : 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: `color-mix(in srgb, ${r.c} 13%, transparent)`, color: r.c, display: "grid", placeItems: "center", flexShrink: 0 }}><I size={16} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.t}</div>
                    <div style={{ fontSize: 12, color: THEME.muted }}>{r.s}</div>
                    <div style={{ height: 4, borderRadius: 2, background: THEME.chip, marginTop: 5, overflow: "hidden" }}><div style={{ width: `${Math.max(2, Math.round((r.v / max) * 100))}%`, height: "100%", background: r.c, transition: "width .6s ease" }} /></div>
                  </div>
                  <b style={{ fontSize: 13.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtBytes(r.v)}</b>
                </div>
              );
            })}
          </div>
          <div data-testid="storage-hint" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.45, color: d.archiveHint ? THEME.amberText || THEME.amber : THEME.muted }}>
            {d.archiveHint
              ? "Buyurtmalar 5 000 tadan oshdi — telefonlar tez ishlashi uchun eski (to'langan va topshirilgan) buyurtmalarni «Arxiv»ga o'tkazish vaqti keldi."
              : `Buyurtmalar ro'yxati ${fmtBytes(d.db.ordersBytes)} — tez ishlaydi. 5 000 ta buyurtmaga yetganda eski yopilganlarini «Arxiv»ga o'tkazish taklif qilinadi.`}
          </div>
        </>
      )}
    </Card>
  );
}
