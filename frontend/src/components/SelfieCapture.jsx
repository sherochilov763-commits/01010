// SelfieCapture.jsx — "Keldim" uchun jonli selfi (old kamera). Galereyadan eski rasm tanlab bo'lmaydi.
import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, X } from "lucide-react";
import { THEME } from "../theme.js";

const MAX_W = 480;
function toJpeg(source, w, h) {
  const scale = Math.min(1, MAX_W / w);
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext("2d");
  ctx.translate(c.width, 0); ctx.scale(-1, 1); // oynadagidek (old kamera)
  ctx.drawImage(source, 0, 0, c.width, c.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Vaqt belgisi rasmning o'zida
  const stamp = new Date().toLocaleString("uz-UZ", { hour12: false });
  ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, c.height - 26, c.width, 26);
  ctx.fillStyle = "#fff"; ctx.font = "600 13px system-ui, sans-serif"; ctx.fillText(`UVIX · ${stamp}`, 10, c.height - 9);
  return c.toDataURL("image/jpeg", 0.72);
}

export function SelfieCapture({ onDone, onCancel }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [shot, setShot] = useState(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); setReady(true); }
      } catch (e) {
        setErr(e?.name === "NotAllowedError" ? "Kameraga ruxsat berilmagan. Brauzer sozlamalarida UVIX uchun kamerani yoqing." : "Kamerani ochib bo'lmadi.");
      }
    }
    if (navigator.mediaDevices?.getUserMedia) start(); else setErr("Bu brauzer kamerani qo'llamaydi.");
    return () => { stopped = true; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setShot(toJpeg(v, v.videoWidth, v.videoHeight));
  }

  return (
    <div role="dialog" aria-label="Selfi" style={{ position: "fixed", inset: 0, zIndex: 400, background: "#0B0816", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "min(380px, 100%)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Selfi — ishga keldingiz</div>
          <button type="button" onClick={onCancel} aria-label="Bekor qilish" style={{ border: 0, background: "rgba(255,255,255,0.1)", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: 22, overflow: "hidden", background: "#000" }}>
          {shot ? <img src={shot} alt="Selfi" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />}
          {!shot && ready && <div style={{ position: "absolute", inset: "12% 18% 22%", border: "2px dashed rgba(255,255,255,0.5)", borderRadius: "50%", pointerEvents: "none" }} />}
          {err && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#FFB4B6", fontSize: 14, lineHeight: 1.5 }}>{err}</div>}
        </div>
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12.5, textAlign: "center" }}>Yuzingiz ramkaga tushsin. Rasmni faqat administrator ko'radi.</div>
        {shot ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setShot(null)} style={{ flex: 1, height: 52, borderRadius: 16, border: "1px solid rgba(255,255,255,0.2)", background: "none", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}><RotateCcw size={18} /> Qayta</button>
            <button type="button" data-testid="selfie-send" onClick={() => onDone(shot)} style={{ flex: 2, height: 52, borderRadius: 16, border: 0, background: THEME.green, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>Keldim ✓</button>
          </div>
        ) : (
          <button type="button" data-testid="selfie-shoot" onClick={capture} disabled={!ready} style={{ alignSelf: "center", width: 76, height: 76, borderRadius: "50%", border: "4px solid #fff", background: ready ? THEME.green : "#555", cursor: ready ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Rasmga olish">
            <Camera size={28} color="#fff" />
          </button>
        )}
      </div>
    </div>
  );
}
