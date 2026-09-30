// PasskeySection.jsx — Sozlamalar → Face ID / barmoq izi bilan kirish (faqat telefonlarda)
// Asosiy yoqish joyi — PIN bilan kirgandan keyingi taklif. Bu yerda: holat, qurilmalar ro'yxati, o'chirish.
import { useEffect, useMemo, useRef, useState } from "react";
import { ScanFace, Fingerprint, Trash2, Loader2, Smartphone, Monitor, CheckCircle2 } from "lucide-react";
import {
  canUseBiometrics, biometricLabel, isEnrolledHere, isCancel, isPersonalMobile, makePreparer,
  listPasskeys, removePasskey, prepareEnroll, enrollWithPrepared,
} from "./passkey.js";

function fmtDate(iso) {
  if (!iso) return "hali ishlatilmagan";
  const d = new Date(iso);
  const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  return `${d.getDate()}-${months[d.getMonth()]} ${d.getFullYear()}`;
}
const isDesktopDevice = (d) => d === "Windows" || d === "Mac";

export default function PasskeySection({ currentUser, theme, Card }) {
  const bio = useMemo(() => biometricLabel(), []);
  const mobile = useMemo(() => isPersonalMobile(), []);
  const [available, setAvailable] = useState(false);
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", err: false });
  const [here, setHere] = useState(isEnrolledHere(currentUser.id));
  const preparer = useRef(null);

  async function refresh() {
    try { setItems(await listPasskeys()); } catch { setItems([]); }
  }
  useEffect(() => {
    refresh();
    canUseBiometrics().then((ok) => {
      setAvailable(ok);
      if (ok) { preparer.current = makePreparer(prepareEnroll); preparer.current.refresh(); }
    });
    // Sahifa uzoq ochiq tursa ham so'rov eskirmasin
    const t = setInterval(() => preparer.current?.refresh(), 4 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  async function enable() {
    setBusy(true);
    setMsg({ text: "", err: false });
    try {
      const p = await preparer.current?.get();
      if (!p) throw new Error("Server bilan bog'lanib bo'lmadi, qaytadan urinib ko'ring");
      preparer.current.invalidate();
      await enrollWithPrepared(p, currentUser);
      setHere(true);
      setMsg({ text: `${bio.name} yoqildi. Keyingi safar ilova ochilishi bilan ${bio.name} so'raladi.`, err: false });
      await refresh();
    } catch (e) {
      setMsg({ text: isCancel(e) ? "Bekor qilindi" : (e.message || "Yoqib bo'lmadi"), err: true });
    } finally {
      setBusy(false);
      preparer.current?.refresh();
    }
  }

  async function remove(item) {
    setBusy(true);
    try {
      const isLast = (items || []).length === 1;
      await removePasskey(item.id, currentUser.id, isLast);
      if (isLast) setHere(false);
      setMsg({ text: `${item.device} o'chirildi`, err: false });
      await refresh();
    } catch (e) {
      setMsg({ text: e.message, err: true });
    } finally {
      setBusy(false);
    }
  }

  const Icon = mobile && bio.kind === "face" ? ScanFace : Fingerprint;
  const row = { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${theme.border}` };
  const title = mobile ? `${bio.name} bilan kirish` : "Face ID / barmoq izi bilan kirish";

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Icon size={18} color={theme.violet} />
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>
      </div>
      <div style={{ fontSize: 12.5, color: theme.muted, lineHeight: 1.5, marginBottom: 12 }}>
        {mobile
          ? "Telefoningizda PIN o'rniga bir qarash yoki teginish bilan kirasiz. Biometrik ma'lumot telefondan chiqmaydi."
          : "Faqat shaxsiy telefonlarda ishlaydi. Telefoningizda UVIX'ga PIN bilan kiring — yoqishni o'zi taklif qiladi. Umumiy kompyuterda xavfsizlik uchun PIN qoladi."}
      </div>

      {mobile && here && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: theme.green || "#16A34A", marginBottom: 8 }}>
          <CheckCircle2 size={15} /> Shu telefonda yoqilgan
        </div>
      )}

      {items === null ? (
        <div style={{ fontSize: 12.5, color: theme.muted }}><Loader2 size={14} className="ul-spin" /> Yuklanmoqda…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: theme.muted, marginBottom: 4 }}>Hali birorta telefon qo'shilmagan.</div>
      ) : (
        <div style={{ marginBottom: 4 }}>
          {items.map((p) => {
            const old = isDesktopDevice(p.device);
            const DevIcon = old ? Monitor : Smartphone;
            return (
              <div key={p.id} style={row}>
                <DevIcon size={16} color={theme.muted} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {p.device}{p.synced ? " (sinxronlanadi)" : ""}
                    {old && <span style={{ fontWeight: 500, color: theme.muted }}> — kompyuter, endi ishlatilmaydi</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.muted }}>Qo'shilgan: {fmtDate(p.createdAt)} · Oxirgi kirish: {fmtDate(p.lastUsedAt)}</div>
                </div>
                <button onClick={() => remove(p)} disabled={busy} aria-label={`${p.device}ni o'chirish`}
                  style={{ background: "none", border: 0, padding: 6, cursor: "pointer", color: theme.red || "#E5484D" }}>
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {mobile && available && !here && (
        <button onClick={enable} disabled={busy}
          style={{ marginTop: 10, padding: "9px 14px", borderRadius: 10, border: 0, background: theme.violet, color: "#fff", fontWeight: 600, fontSize: 13, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, opacity: busy ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="ul-spin" /> : <Icon size={15} />} Shu telefonda yoqish
        </button>
      )}
      {mobile && !available && (
        <div style={{ fontSize: 12, color: theme.muted, marginTop: 8 }}>
          Bu telefonda ekran qulfi (Face ID, barmoq izi yoki PIN) sozlanmagan yoki brauzer qo'llamaydi.
        </div>
      )}
      {msg.text && <div style={{ fontSize: 12, marginTop: 10, color: msg.err ? (theme.red || "#E5484D") : (theme.green || "#16A34A") }}>{msg.text}</div>}
    </Card>
  );
}
