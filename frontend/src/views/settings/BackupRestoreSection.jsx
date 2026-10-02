// BackupRestoreSection.jsx — Baza holati (doimiy diskdami) va Telegram zaxirasidan tiklash (faqat admin)
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, DatabaseBackup, Upload } from "lucide-react";
import { Button, ConfirmDialog } from "../../components/ui.jsx";
import { fetchSystemStatus, restoreBackup } from "../../storage.js";
import { THEME } from "../../theme.js";

const COUNT_LABELS = [["orders", "Buyurtma"], ["transactions", "Rasxod/kirim"], ["leads", "Lid"], ["employees", "Xodim"]];

function Counts({ counts }) {
  if (!counts) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8 }}>
      {COUNT_LABELS.map(([k, label]) => (
        <div key={k} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ fontSize: 11, color: THEME.muted }}>{label}</div>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: THEME.fontNum }}>{counts[k] ?? 0}</div>
        </div>
      ))}
    </div>
  );
}

export function BackupRestoreSection() {
  const [status, setStatus] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [confirm, setConfirm] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { fetchSystemStatus().then(setStatus).catch(() => {}); }, []);

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f); setPreview(null); setMsg(null); setBusy(true);
    try {
      const r = await restoreBackup(f, false);
      setPreview(r);
    } catch (err) {
      setFile(null);
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setConfirm(false); setBusy(true); setMsg(null);
    try {
      await restoreBackup(file, true);
      setMsg({ ok: true, text: "Baza tiklandi. Sahifa qayta yuklanmoqda…" });
      // Ekrandagi eski (bo'sh) ma'lumot serverdagi tiklanganining ustiga yozilmasligi uchun darhol qayta yuklaymiz
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
      setBusy(false);
    }
  }

  const st = status?.storage;
  const bad = st && !st.persistent;
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <DatabaseBackup size={15} color={THEME.muted} /> Baza holati va zaxiradan tiklash
      </div>

      {st && (
        <div role={bad ? "alert" : undefined} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, marginBottom: 10,
          background: bad ? THEME.roseBg : THEME.greenBg, color: bad ? THEME.roseText || THEME.rose : THEME.green, fontSize: 12.5, lineHeight: 1.45 }}>
          {bad ? <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
          <div>
            {bad ? (
              <>
                <b>Baza doimiy diskda emas — har deploy'da ma'lumotlar o'chadi!</b><br />
                Railway → servis → Settings → Volumes: <b>Mount path = /data</b>. Variables: <b>DB_PATH = /data/uvix.db</b>. Keyin qayta deploy qiling va zaxirani shu yerdan tiklang.
              </>
            ) : st.onRailway ? "Baza doimiy diskda (Railway Volume) saqlanmoqda — deploy'da o'chmaydi." : "Baza fayli serverda saqlanmoqda."}
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3, wordBreak: "break-all" }}>
              Fayl: {status.dbPath}{status.lastBackup ? ` · Oxirgi zaxira: ${status.lastBackup}` : status.backupConfigured ? " · Zaxira hali yuborilmagan" : " · Telegram zaxira sozlanmagan"}
            </div>
          </div>
        </div>
      )}
      {status?.counts && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11.5, color: THEME.muted, marginBottom: 6 }}>Hozir bazada:</div><Counts counts={status.counts} /></div>}

      <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 10 }}>
        Telegram'ga kelgan <b style={{ color: THEME.text }}>uvix_backup_YYYY-MM-DD.db</b> faylini yuklab, shu yerdan tanlang.
        Avval tarkibi ko'rsatiladi, tasdiqlasangizgina tiklanadi. Hozirgi holat ham serverda alohida nusxa qilib saqlab qo'yiladi.
      </div>
      <input ref={inputRef} type="file" accept=".db,.sqlite,application/octet-stream,application/x-sqlite3" onChange={pick} style={{ display: "none" }} />
      <Button variant="ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload size={14} /> {busy && !preview ? "Tekshirilmoqda…" : "Zaxira faylini tanlash"}
      </Button>

      {preview && file && (
        <div style={{ marginTop: 12, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, wordBreak: "break-all" }}>{file.name} ichida:</div>
          <Counts counts={preview.incoming} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Button onClick={() => setConfirm(true)} disabled={busy}>{busy ? "Tiklanmoqda…" : "Shu zaxiradan tiklash"}</Button>
            <Button variant="ghost" onClick={() => { setPreview(null); setFile(null); }} disabled={busy}>Bekor qilish</Button>
          </div>
        </div>
      )}
      {msg && <div role="status" style={{ fontSize: 12.5, marginTop: 10, color: msg.ok ? THEME.green : THEME.rose }}>{msg.text}</div>}

      {confirm && (
        <ConfirmDialog
          title="Bazani tiklash"
          icon={DatabaseBackup}
          tone="danger"
          confirmLabel="Ha, tiklash"
          message={`Hozirgi ma'lumotlar (${status?.counts?.orders ?? 0} buyurtma, ${status?.counts?.leads ?? 0} lid) zaxiradagisi bilan almashtiriladi: ${preview?.incoming?.orders ?? 0} buyurtma, ${preview?.incoming?.leads ?? 0} lid. PIN kodlar ham zaxiradagi holatiga qaytadi. Davom etamizmi?`}
          onConfirm={apply}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
