// PhoneToDesktop.jsx — telefondan kompyuterga kirishni tasdiqlash.
//  • «Kompyuterga kirish» tugmasi → kamera ochiladi → kompyuterdagi QR skanerlanadi
//  • yoki telefon kamerasi QR'ni o'zi ochadi: UVIX ?qr=<id> bilan ochiladi
//  • «Kompyuterga kirasizmi? Chrome · Windows» → Face ID (yoki Face ID yo'q telefonda — PIN) → kompyuter ochiladi
import { useEffect, useRef, useState } from "react";
import { Loader2, Monitor, QrCode, ScanFace, X } from "lucide-react";
import jsQR from "jsqr";
import { THEME } from "../theme.js";
import { qrApprove, qrInfo, qrReject } from "../storage.js";
import { biometricLabel, confirmWithPreparedResponse, isCancel, isEnrolledMe, prepareConfirm } from "../auth/passkey.js";

const EVT = "uvix:qr-open";
const takeQrParam = () => {
  try {
    const u = new URL(window.location.href);
    const id = u.searchParams.get("qr");
    if (!id) return null;
    u.searchParams.delete("qr");
    window.history.replaceState(null, "", u.toString());
    return /^[A-Za-z0-9_-]{8,40}$/.test(id) ? id : null;
  } catch { return null; }
};
// QR ichidagi matndan id: «https://…/?qr=<id>» yoki faqat id
function idFromText(t) {
  const s = String(t || "").trim();
  try { const u = new URL(s); const id = u.searchParams.get("qr"); if (id) return id; } catch { /* havola emas */ }
  return /^[A-Za-z0-9_-]{8,40}$/.test(s) ? s : null;
}

export function QrScanButton({ compact = false, full = false, onClick }) {
  // Faqat telefon/planshetda (kompyuterda bu tugma kerak emas)
  const phone = typeof window !== "undefined" && window.matchMedia?.("(max-width: 860px), (pointer: coarse)").matches;
  if (!phone) return null;
  return (
    <button type="button" onClick={() => { onClick?.(); window.dispatchEvent(new CustomEvent(EVT, { detail: { scan: true } })); }} data-testid="qr-scan-btn"
      title="Kompyuterga kirish (QR)" aria-label="Kompyuterga kirish"
      style={{ ...(full ? { width: "100%", justifyContent: "flex-start", margin: "0 0 10px", height: 38 } : {}), height: full ? 38 : 40, borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, display: "inline-flex", alignItems: "center", gap: 6, padding: compact ? "0 10px" : "0 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
      <QrCode size={17} />{!compact && "Kompyuterga kirish"}
    </button>
  );
}

// Ilovada bir marta joylashadi (asosiy ilova va ishchi ilovasi)
export function QrApproveHost() {
  const [state, setState] = useState(() => { const id = takeQrParam(); return id ? { stage: "info", id } : null; });
  useEffect(() => {
    const on = (e) => setState(e.detail?.id ? { stage: "info", id: e.detail.id } : { stage: "scan" });
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  if (!state) return null;
  const close = () => setState(null);
  if (state.stage === "scan") return <Scanner onClose={close} onId={(id) => setState({ stage: "info", id })} />;
  return <ApproveSheet id={state.id} onClose={close} />;
}

function Scanner({ onClose, onId }) {
  const video = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stream = null, stop = false, raf = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const detector = typeof window.BarcodeDetector === "function" ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
    async function loop() {
      if (stop) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        try {
          let text = null;
          if (detector) { const r = await detector.detect(v); text = r[0]?.rawValue || null; }
          else {
            const w = Math.min(640, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            text = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data || null;
          }
          const id = idFromText(text);
          if (id) { navigator.vibrate?.(30); onId(id); return; }
        } catch { /* keyingi kadr */ }
      }
      raf = setTimeout(loop, 180);
    }
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play().catch(() => {}); }
        loop();
      } catch (e) {
        setErr(e?.name === "NotAllowedError" ? "Kameraga ruxsat berilmagan. Brauzer sozlamalarida UVIX uchun kamerani yoqing." : "Kamerani ochib bo'lmadi.");
      }
    })();
    return () => { stop = true; clearTimeout(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="dialog" aria-label="QR skanerlash" data-testid="qr-scanner" style={{ position: "fixed", inset: 0, zIndex: 420, background: "#0B0B10", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 18, color: "#fff" }}>
      <div style={{ width: "min(380px, 100%)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Kompyuterga kirish</div>
          <button type="button" onClick={onClose} aria-label="Yopish" style={{ border: 0, background: "rgba(255,255,255,.12)", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 22, overflow: "hidden", background: "#000" }}>
          <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: "14%", border: "3px solid rgba(255,255,255,.85)", borderRadius: 20, boxShadow: "0 0 0 999px rgba(0,0,0,.35)" }} />
          {err && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#FFB4B6", fontSize: 14, lineHeight: 1.5, background: "#000" }}>{err}</div>}
        </div>
        <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.75)", textAlign: "center", lineHeight: 1.5 }}>Kompyuterda UVIX'ni oching → «Telefon bilan» → ekrandagi QR kodni shu ramkaga tushiring.</div>
      </div>
    </div>
  );
}

function ApproveSheet({ id, onClose }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pin, setPin] = useState("");
  const bio = biometricLabel();
  const prepRef = useRef(null);
  const useBio = !!info?.hasPasskey && isEnrolledMe();
  useEffect(() => {
    qrInfo(id).then(setInfo).catch((e) => setErr(e.message || "QR kod eskirgan"));
  }, [id]);
  useEffect(() => { if (useBio) { prepRef.current = prepareConfirm(); prepRef.current.catch(() => {}); } }, [useBio]);
  async function approve() {
    setBusy(true); setErr("");
    try {
      if (useBio) {
        const p = await prepRef.current;
        if (!p) throw new Error(`${bio.name} tayyor emas`);
        const response = await confirmWithPreparedResponse(p);
        await qrApprove(id, { response });
      } else {
        if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN kodingizni kiriting");
        await qrApprove(id, { pin });
      }
      navigator.vibrate?.(30);
      setDone(true);
      setTimeout(onClose, 1600);
    } catch (e) {
      setErr(isCancel(e) ? "Bekor qilindi" : e.message || "Tasdiqlab bo'lmadi");
      if (useBio) { prepRef.current = prepareConfirm(); prepRef.current.catch(() => {}); }
    } finally { setBusy(false); }
  }
  function cancel() { qrReject(id).catch(() => {}); onClose(); }
  return (
    <div role="dialog" aria-label="Kompyuterga kirish" data-testid="qr-approve" style={{ position: "fixed", inset: 0, zIndex: 420, background: "rgba(10,10,14,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "min(480px, 100%)", background: THEME.card, borderRadius: "24px 24px 0 0", padding: "18px 22px calc(26px + env(safe-area-inset-bottom))", textAlign: "center", color: THEME.text }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: THEME.border2, margin: "0 auto 16px" }} />
        <div style={{ width: 56, height: 56, borderRadius: 16, background: THEME.violetSoft || "#EAF0FC", color: THEME.violet, display: "grid", placeItems: "center", margin: "0 auto" }}>{done ? <Monitor size={28} /> : <ScanFace size={28} />}</div>
        {done ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 19, marginTop: 12 }}>Kompyuter ochildi</div>
            <div style={{ fontSize: 14, color: THEME.muted, marginTop: 6 }}>{info?.device}</div>
          </>
        ) : err && !info ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 18, marginTop: 12 }}>QR kod eskirgan</div>
            <div style={{ fontSize: 14, color: THEME.muted, marginTop: 6, lineHeight: 1.5 }}>{err}</div>
            <button type="button" onClick={onClose} style={btn(false)}>Yopish</button>
          </>
        ) : !info ? <Loader2 size={24} className="uvix-spin" style={{ margin: "18px auto" }} /> : (
          <>
            <div style={{ fontWeight: 700, fontSize: 19, marginTop: 12 }}>Kompyuterga kirasizmi?</div>
            <div style={{ fontSize: 14, color: THEME.muted, marginTop: 6, lineHeight: 1.55 }}>
              <b style={{ color: THEME.text }}>{info.device || "Brauzer"}</b> · hozir<br />Bu siz bo'lmasangiz — «Bekor qilish»ni bosing.
            </div>
            {!useBio && (
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} type="password" inputMode="numeric" maxLength={6} placeholder="PIN kodingiz" aria-label="PIN" data-testid="qr-pin"
                style={{ width: "100%", height: 48, marginTop: 16, borderRadius: 14, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, textAlign: "center", fontSize: 20, letterSpacing: 8, fontFamily: "inherit", boxSizing: "border-box" }} />
            )}
            {err && <div role="alert" style={{ color: THEME.rose, fontSize: 13, marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={approve} disabled={busy} data-testid="qr-approve-btn" style={btn(true)}>
              {busy ? <Loader2 size={18} className="uvix-spin" /> : useBio ? <><ScanFace size={19} /> {bio.name} bilan tasdiqlash</> : "Tasdiqlash"}
            </button>
            <button type="button" onClick={cancel} disabled={busy} style={btn(false)}>Bekor qilish</button>
          </>
        )}
      </div>
    </div>
  );
}
const btn = (primary) => ({ width: "100%", height: 52, marginTop: primary ? 18 : 8, borderRadius: 15, border: 0, background: primary ? THEME.violet : "none", color: primary ? "#fff" : THEME.muted, fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 });
