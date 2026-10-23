// VoiceAssistant.jsx — hamma ekranda turadigan mikrofon (faqat rahbar).
// Bosiladi → gapirasiz → «Tayyor» → server gapni tushunadi → kerakli forma to'ldirilgan holda ochiladi
// (buyurtma, to'lov, rasxod, vazifa, lid). Saqlashni foydalanuvchi o'zi bosadi.
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Square, X, RotateCcw, Search } from "lucide-react";
import { THEME } from "../theme.js";
import { money } from "../lib/format.js";
import { orderDebt } from "../lib/finance.js";
import { fetchVoiceStatus, voiceCommand } from "../storage.js";
import { ACTION_LABEL, findPaymentOrders, summary } from "../lib/voice.js";

const MAX_SEC = 60;
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return "";
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function VoiceAssistant({ orders, onAction }) {
  const [st, setSt] = useState(null); // /api/voice/status
  const [phase, setPhase] = useState("idle"); // idle | rec | busy | pick | error | result
  const [sec, setSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState(null);
  const [pick, setPick] = useState([]);
  const [text, setText] = useState("");
  const rec = useRef(null);

  useEffect(() => { fetchVoiceStatus().then(setSt).catch(() => setSt(null)); }, []);
  useEffect(() => () => stopTracks(), []);
  // Esc — yopish
  useEffect(() => {
    if (phase === "idle") return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!st?.enabled) return null;

  function stopTracks() {
    const r = rec.current;
    if (!r) return;
    clearInterval(r.timer); cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close?.().catch?.(() => {});
    rec.current = null;
  }
  function close() {
    if (rec.current) { rec.current.cancelled = true; try { rec.current.recorder.stop(); } catch { /* */ } stopTracks(); }
    setPhase("idle"); setMsg(""); setRes(null); setPick([]); setText("");
  }
  async function start() {
    setMsg(""); setRes(null); setPick([]);
    if (!st.voice) { setPhase("error"); setMsg("Ovoz uchun serverga GEMINI_API_KEY yoki OPENAI_API_KEY qo'shilmagan — hozircha matn bilan yozing."); return; }
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) { setPhase("error"); setMsg("Bu brauzer ovoz yozishni qo'llamaydi — matn bilan yozing."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { setPhase("error"); setMsg(e?.name === "NotAllowedError" ? "Mikrofonga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering." : "Mikrofonni ochib bo'lmadi."); return; }
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const r = { recorder, stream, chunks: [], cancelled: false, mime: recorder.mimeType || mime || "audio/webm", t0: Date.now() };
    recorder.ondataavailable = (e) => e.data?.size && r.chunks.push(e.data);
    recorder.onstop = () => {
      const cancelled = r.cancelled;
      const blob = new Blob(r.chunks, { type: r.mime });
      stopTracks();
      if (!cancelled) send({ audio: blob });
    };
    // Ovoz balandligi — tugma atrofidagi halqa uchun
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC(); const an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); setLevel(Math.min(1, m / 50)); r.raf = requestAnimationFrame(tick); };
      r.ctx = ctx; tick();
    } catch { /* halqasiz ham ishlaydi */ }
    r.timer = setInterval(() => {
      const s = Math.floor((Date.now() - r.t0) / 1000);
      setSec(s);
      if (s >= MAX_SEC) finish();
    }, 250);
    rec.current = r;
    setSec(0); setPhase("rec");
    recorder.start();
  }
  function finish() {
    const r = rec.current;
    if (!r) return;
    if (Date.now() - r.t0 < 700) { r.cancelled = true; try { r.recorder.stop(); } catch { /* */ } stopTracks(); setPhase("error"); setMsg("Juda qisqa — tugmani bosib, gapirib, keyin «Tayyor»ni bosing."); return; }
    try { r.recorder.stop(); } catch { stopTracks(); }
    setPhase("busy");
  }
  async function send(input) {
    setPhase("busy"); setMsg("");
    try {
      const r = await voiceCommand(input);
      setRes(r);
      apply(r);
    } catch (e) { setPhase("error"); setMsg(e.message || "Xatolik"); }
  }
  function apply(r) {
    if (r.action === "unknown") { setPhase("result"); setMsg(r.reply || "Tushunmadim — boshqacha aytib ko'ring."); return; }
    if (r.action === "payment") {
      const f = findPaymentOrders(r.data, orders);
      if (f.exact) { done(r, { order: f.orders[0] }); return; }
      setPick(f.orders); setPhase("pick");
      setMsg(f.orders.length ? "Qaysi buyurtmaga?" : `«${r.data.customer || r.data.orderNumber}» bo'yicha buyurtma topilmadi.`);
      return;
    }
    done(r, {});
  }
  function done(r, extra) { onAction?.(r.action, r.data, extra); close(); }
  function submitText(e) { e?.preventDefault?.(); const t = text.trim(); if (t) send({ text: t }); }

  const recording = phase === "rec";
  const ring = recording ? 6 + Math.round(level * 14) : 0;
  return (
    <>
      {phase !== "idle" && (
        <div className="uvix-voice-panel" role="dialog" aria-label="Ovozli yordamchi" data-testid="voice-panel"
          style={{ background: THEME.card, color: THEME.text, border: `1px solid ${THEME.border}`, boxShadow: THEME.shadowLg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <b style={{ fontSize: 14, flex: 1 }}>{recording ? "Gapiring…" : phase === "busy" ? "Tushunyapman…" : res && res.action !== "unknown" ? ACTION_LABEL[res.action] : "Ovozli yordamchi"}</b>
            <button type="button" onClick={close} aria-label="Yopish" className="uvix-voice-x" style={{ color: THEME.muted }}><X size={18} /></button>
          </div>

          {recording && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: THEME.rose, animation: "uvixVoiceBlink 1s infinite" }} />
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{mmss(sec)}</span>
              <span style={{ fontSize: 12.5, color: THEME.muted, flex: 1 }}>masalan: «Akmaldan 300 ming naqd oldim»</span>
              <button type="button" onClick={finish} data-testid="voice-stop" className="uvix-voice-btn" style={{ background: THEME.violet, color: THEME.onPrimary }}><Square size={14} fill="currentColor" /> Tayyor</button>
            </div>
          )}
          {phase === "busy" && <div style={{ display: "flex", alignItems: "center", gap: 10, color: THEME.muted, fontSize: 13.5 }}><Loader2 size={18} className="uvix-spin" /> Ovoz matnga aylantirilmoqda va forma tayyorlanmoqda…</div>}

          {res?.transcript && phase !== "busy" && <div data-testid="voice-transcript" style={{ fontSize: 13, color: THEME.muted, fontStyle: "italic", marginBottom: 8, lineHeight: 1.45 }}>«{res.transcript}»</div>}
          {res && res.action !== "unknown" && phase !== "busy" && <div style={{ fontSize: 13.5, marginBottom: 8 }}>{summary(res)}</div>}
          {msg && phase !== "busy" && <div data-testid="voice-msg" style={{ fontSize: 13.5, color: phase === "error" ? THEME.rose : THEME.text, marginBottom: 10, lineHeight: 1.45 }}>{msg}</div>}

          {phase === "pick" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }} data-testid="voice-pick">
              {pick.map((o) => (
                <button key={o.id} type="button" className="uvix-voice-row" style={{ borderColor: THEME.border, color: THEME.text }} onClick={() => done(res, { order: o })}>
                  <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.customer}</b><small style={{ color: THEME.muted }}>{o.orderNumber}{o.date ? ` · ${o.date.slice(8, 10)}.${o.date.slice(5, 7)}` : ""}</small></span>
                  <span style={{ fontSize: 12.5, color: orderDebt(o) > 0 ? THEME.rose : THEME.muted, whiteSpace: "nowrap" }}>{orderDebt(o) > 0 ? `qarz ${money(orderDebt(o))}` : "qarzi yo'q"}</span>
                </button>
              ))}
              {!pick.length && res?.data?.customer && (
                <button type="button" className="uvix-voice-row" style={{ borderColor: THEME.border, color: THEME.text }} onClick={() => { onAction?.("search", { search: res.data.customer }); close(); }}>
                  <Search size={16} /> <span style={{ flex: 1 }}>Buyurtmalardan qidirish: «{res.data.customer}»</span>
                </button>
              )}
            </div>
          )}

          {!recording && phase !== "busy" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {st.voice && <button type="button" onClick={start} className="uvix-voice-btn" style={{ background: THEME.violet, color: THEME.onPrimary }}>{phase === "error" || phase === "result" || phase === "pick" ? <RotateCcw size={15} /> : <Mic size={15} />} {phase === "pick" ? "Qayta aytish" : "Qayta urinish"}</button>}
            </div>
          )}

          {!recording && phase !== "busy" && (
            <form onSubmit={submitText} style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Yoki yozing: Jasurdan 200 ming karta" data-testid="voice-text"
                style={{ flex: 1, minWidth: 0, height: 38, borderRadius: 10, border: `1px solid ${THEME.border2}`, background: THEME.surface, color: THEME.text, padding: "0 12px", fontSize: 14 }} />
              <button type="submit" aria-label="Yuborish" className="uvix-voice-btn" style={{ background: THEME.chip, color: THEME.text, padding: "0 12px" }}><Send size={16} /></button>
            </form>
          )}
        </div>
      )}
      <button type="button" className={`uvix-voice-fab${recording ? " is-rec" : ""}`} data-testid="voice-fab"
        aria-label={recording ? "Yozishni tugatish" : "Ovozli yordamchi"} title="Ovozli yordamchi — gapiring, forma o'zi to'ladi"
        onClick={() => (recording ? finish() : phase === "busy" ? null : start())}
        style={{ background: recording ? THEME.rose : THEME.violet, color: THEME.onPrimary, boxShadow: `0 0 0 ${ring}px color-mix(in srgb, ${recording ? THEME.rose : THEME.violet} 22%, transparent), 0 6px 16px color-mix(in srgb, ${THEME.violet} 35%, transparent)` }}>
        {phase === "busy" ? <Loader2 size={24} className="uvix-spin" /> : recording ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
      </button>
    </>
  );
}

export const VOICE_CSS = () => `
  .uvix-voice-fab { position: fixed; right: 24px; bottom: 24px; z-index: 240; width: 56px; height: 56px; border-radius: 50%; border: 0; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: box-shadow .08s linear, transform .15s ease; -webkit-tap-highlight-color: transparent; }
  .uvix-voice-fab:active { transform: scale(.93); }
  .uvix-voice-panel { position: fixed; right: 24px; bottom: 92px; z-index: 241; width: 360px; max-width: calc(100vw - 24px); border-radius: 16px; padding: 14px; }
  .uvix-voice-btn { height: 36px; border: 0; border-radius: 10px; padding: 0 14px; font-weight: 600; font-size: 13.5px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .uvix-voice-x { border: 0; background: transparent; cursor: pointer; padding: 4px; display: flex; }
  .uvix-voice-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: transparent; border: 1px solid; border-radius: 10px; padding: 8px 10px; cursor: pointer; }
  .uvix-voice-row:hover { background: ${THEME.chip}; }
  .uvix-spin { animation: uvixVoiceSpin 1s linear infinite; }
  @keyframes uvixVoiceSpin { to { transform: rotate(360deg); } }
  @keyframes uvixVoiceBlink { 50% { opacity: .25; } }
  @media (max-width: 860px) {
    .uvix-voice-fab { right: 16px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); width: 54px; height: 54px; }
    .uvix-voice-panel { left: 12px; right: 12px; width: auto; max-width: none; bottom: calc(148px + env(safe-area-inset-bottom, 0px)); }
  }
  @media print { .uvix-voice-fab, .uvix-voice-panel { display: none !important; } }
`;
