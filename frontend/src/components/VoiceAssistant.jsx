// VoiceAssistant.jsx — ovozli yordamchi (faqat rahbar), 112/113-eskizlar.
// Gapirasiz → server gapni tushunadi → kerakli forma to'ldirilgan holda ochiladi
// (buyurtma, to'lov, rasxod, vazifa, lid). Saqlashni foydalanuvchi o'zi bosadi.
// Ishga tushirish: telefonda — sarlavhadagi mikrofon (VoiceHeaderButton), kompyuterda — burchakdagi tugma yoki F2.
// Bosib turib gapirish: qo'yib yuborilsa — tayyor, chapga surilsa — bekor. Bir marta bosish — avvalgidek («Tayyor» bilan).
// Kompyuterda burchakdagi tugma oyna / to'liq ekran chat ochiq bo'lganda yashirinadi (hech narsani yopmasin).
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Square, X, RotateCcw, Search } from "lucide-react";
import { THEME } from "../theme.js";
import { money } from "../lib/format.js";
import { orderDebt } from "../lib/finance.js";
import { fetchVoiceStatus, saveVoicePrefs, voiceCommand } from "../storage.js";
import { ACTION_LABEL, findPaymentOrders, summary } from "../lib/voice.js";

const MAX_SEC = 60;
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return "";
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const HOLD_MS = 450; // shundan uzoq bosib turilsa — «bosib turib gapirish», qo'yib yuborilganda tayyor
const CANCEL_PX = 60; // bosib turgan holda shuncha chapga surilsa — bekor
const BARS = 22;
export const HOTKEY = "F2";
// Sarlavhadagi tugma ↔ yordamchi o'rtasidagi signal kanali (ikkalasi App'ning turli joylarida turadi)
const bus = typeof EventTarget !== "undefined" ? new EventTarget() : null;
const emit = (type, detail) => bus?.dispatchEvent(new CustomEvent(type, { detail }));
let lastState = { enabled: false, phase: "idle", prefs: null };
const DEF_PREFS = { on: true, fab: true, hotkey: true };
const prefsOf = (st) => ({ ...DEF_PREFS, ...(st?.prefs || {}) });
// Ekranni yopuvchi oynalar: modal, mijozga yuborish oynasi, to'liq ekran chat
const OVERLAY_SEL = '.uvix-modal-panel, [aria-modal="true"], [data-uvix-overlay]';

export function VoiceAssistant({ orders, onAction }) {
  const [st, setSt] = useState(null); // /api/voice/status
  const [phase, setPhase] = useState("idle"); // idle | rec | busy | pick | error | result
  const [sec, setSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState(null);
  const [pick, setPick] = useState([]);
  const [text, setText] = useState("");
  const [levels, setLevels] = useState(() => Array(BARS).fill(0));
  const [hold, setHold] = useState(null); // { via: "touch" | "key", armed } — bosib turish holati (ko'rsatish uchun)
  const [covered, setCovered] = useState(false);
  const rec = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const holdRef = useRef(null); // { t, x, via, cancel }
  const fnRef = useRef({});
  const onRef = useRef(false);

  // Holatni sarlavhadagi tugmaga bildiramiz
  const prefs = prefsOf(st);
  const on = !!st?.enabled && prefs.on;
  useEffect(() => { lastState = { enabled: on, phase, prefs }; emit("state", lastState); }, [on, phase, prefs.fab, prefs.hotkey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { lastState = { enabled: false, phase: "idle", prefs: null }; emit("state", lastState); }, []);
  // Sozlamalarda o'zgartirilsa — darhol (sahifani yangilamasdan)
  useEffect(() => {
    if (!bus) return undefined;
    const onPrefs = (e) => setSt((cur) => (cur ? { ...cur, prefs: e.detail } : cur));
    bus.addEventListener("prefs", onPrefs);
    return () => bus.removeEventListener("prefs", onPrefs);
  }, []);
  // Ekranni yopuvchi oyna ochiqmi — burchakdagi tugmani yashiramiz
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return undefined;
    let raf = 0;
    const check = () => { raf = 0; setCovered(!!document.querySelector(OVERLAY_SEL)); };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(check); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-uvix-overlay", "aria-modal"] });
    check();
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  // Bosish / qo'yib yuborish / surish — sarlavha tugmasi va F2 uchun umumiy mantiq
  useEffect(() => {
    if (!bus) return undefined;
    const down = (e) => {
      if (!onRef.current) return;
      const p = phaseRef.current;
      if (p === "busy") return;
      if (p === "rec") { holdRef.current = null; setHold(null); fnRef.current.finish(); return; } // bir marta bosish rejimida — to'xtatish
      const via = e.detail?.via || "touch";
      if (via === "click") { holdRef.current = null; setHold(null); fnRef.current.start(); return; } // oddiy bosish — «Tayyor» bilan to'xtatiladi
      holdRef.current = { t: Date.now(), x: e.detail?.x ?? null, via, cancel: false };
      setHold({ via, armed: false });
      fnRef.current.start();
    };
    const move = (e) => {
      const h = holdRef.current;
      if (!h || h.x == null || e.detail?.x == null) return;
      const cancel = e.detail.x - h.x < -CANCEL_PX;
      if (cancel !== h.cancel) { h.cancel = cancel; setHold({ via: h.via, armed: cancel }); }
    };
    const up = () => {
      const h = holdRef.current;
      holdRef.current = null; setHold(null);
      if (!h) return;
      if (h.cancel) { fnRef.current.close(); return; }
      // Ruxsat so'ralib, yozish hali boshlanmagan bo'lsa — bir marta bosish rejimida qoladi
      if (phaseRef.current === "rec" && Date.now() - h.t >= HOLD_MS) fnRef.current.finish();
    };
    bus.addEventListener("down", down); bus.addEventListener("move", move); bus.addEventListener("up", up);
    return () => { bus.removeEventListener("down", down); bus.removeEventListener("move", move); bus.removeEventListener("up", up); };
  }, []);
  onRef.current = on;
  // F2 — bosib turib gapirish (kompyuter); sozlamada o'chirilgan bo'lsa — ishlamaydi
  useEffect(() => {
    if (!on || !prefs.hotkey) return undefined;
    const kd = (e) => { if (e.key !== HOTKEY || e.altKey || e.ctrlKey || e.metaKey) return; e.preventDefault(); if (!e.repeat) emit("down", { via: "key" }); };
    const ku = (e) => { if (e.key !== HOTKEY) return; e.preventDefault(); emit("up"); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [on, prefs.hotkey]);

  useEffect(() => { fetchVoiceStatus().then(setSt).catch(() => setSt(null)); }, []);
  useEffect(() => () => stopTracks(), []);
  // Esc — yopish
  useEffect(() => {
    if (phase === "idle") return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;

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
      let last = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128));
        const lv = Math.min(1, m / 50); setLevel(lv);
        const now = Date.now(); if (now - last > 90) { last = now; setLevels((a) => [...a.slice(1), lv]); }
        r.raf = requestAnimationFrame(tick);
      };
      r.ctx = ctx; tick();
    } catch { /* halqasiz ham ishlaydi */ }
    r.timer = setInterval(() => {
      const s = Math.floor((Date.now() - r.t0) / 1000);
      setSec(s);
      if (s >= MAX_SEC) finish();
    }, 250);
    rec.current = r;
    setSec(0); setLevels(Array(BARS).fill(0)); setPhase("rec");
    recorder.start();
  }
  function finish() {
    const r = rec.current;
    if (!r) return;
    if (Date.now() - r.t0 < 700) { r.cancelled = true; try { r.recorder.stop(); } catch { /* */ } stopTracks(); setPhase("error"); setMsg("Juda qisqa — mikrofonni bosib turib gapiring, keyin qo'yib yuboring."); return; }
    try { r.recorder.stop(); } catch { stopTracks(); }
    setPhase("busy");
  }
  fnRef.current = { start, finish, close };
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

          {recording && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: THEME.rose, animation: "uvixVoiceBlink 1s infinite" }} />
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{mmss(sec)}</span>
              <span aria-hidden="true" className="uvix-voice-wave">{levels.map((v, i) => <span key={i} style={{ height: 4 + Math.round(v * 26), background: hold?.armed ? THEME.muted : THEME.violet }} />)}</span>
              {!hold && <button type="button" onClick={finish} data-testid="voice-stop" className="uvix-voice-btn" style={{ background: THEME.violet, color: THEME.onPrimary }}><Square size={14} fill="currentColor" /> Tayyor</button>}
            </div>
            <div data-testid="voice-hint" style={{ fontSize: 12.5, color: hold?.armed ? THEME.rose : THEME.muted, marginTop: 8, fontWeight: hold?.armed ? 600 : 400 }}>
              {hold?.armed ? "Qo'yib yuboring — bekor qilinadi"
                : hold?.via === "key" ? `${HOTKEY} ni qo'yib yuboring — tayyor · masalan: «Akmaldan 300 ming naqd oldim»`
                : hold ? "Qo'yib yuboring — tayyor · ← chapga suring — bekor"
                : "masalan: «Akmaldan 300 ming naqd oldim»"}
            </div>
          </>)}
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
      {(prefs.fab || phase !== "idle") && <button type="button" className={`uvix-voice-fab${recording ? " is-rec" : ""}${covered && phase === "idle" ? " is-covered" : ""}`} data-testid="voice-fab"
        aria-label={recording ? "Yozishni tugatish" : "Ovozli yordamchi"} title={`Ovozli yordamchi — bosing yoki ${HOTKEY} ni bosib turib gapiring`}
        onClick={() => (recording ? finish() : phase === "busy" ? null : start())}
        style={{ background: recording ? THEME.rose : THEME.violet, color: THEME.onPrimary, boxShadow: `0 0 0 ${ring}px color-mix(in srgb, ${recording ? THEME.rose : THEME.violet} 22%, transparent), 0 6px 16px color-mix(in srgb, ${THEME.violet} 35%, transparent)` }}>
        {phase === "busy" ? <Loader2 size={24} className="uvix-spin" /> : recording ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
      </button>}
    </>
  );
}

/**
 * Sarlavhadagi mikrofon (112/113-eskizlar). Telefonda — dumaloq tugma «+» yonida: bosib turib gapirish,
 * chapga surish — bekor, bir marta bosish — yozadi va yana bosilganda to'xtaydi. Kompyuterda — «🎤 F2» eslatmasi.
 * Ovoz o'chiq bo'lsa yoki foydalanuvchi rahbar bo'lmasa (yordamchi chizilmagan) — ko'rinmaydi.
 */
export function VoiceHeaderButton() {
  const [s, setS] = useState(lastState);
  useEffect(() => {
    if (!bus) return undefined;
    const on = (e) => setS(e.detail);
    bus.addEventListener("state", on);
    setS(lastState);
    return () => bus.removeEventListener("state", on);
  }, []);
  if (!s.enabled) return null;
  const rec = s.phase === "rec", busy = s.phase === "busy";
  const hotkey = s.prefs?.hotkey !== false;
  const pd = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); emit("down", { x: e.clientX, via: "touch" }); };
  const pm = (e) => emit("move", { x: e.clientX });
  const pu = () => emit("up");
  return (
    <>
      <button type="button" className={`uvix-hmic${rec ? " is-rec" : ""}`} data-testid="voice-hmic" aria-label={rec ? "Yozishni tugatish" : "Ovozli yordamchi — bosib turib gapiring"}
        onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerCancel={pu} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); emit("down", { via: "touch" }); } }}
        onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") emit("up"); }}
        style={{ background: rec ? THEME.rose : `color-mix(in srgb, ${THEME.violet} 14%, transparent)`, color: rec ? "#fff" : THEME.violet }}>
        {busy ? <Loader2 size={18} className="uvix-spin" /> : <Mic size={18} />}
      </button>
      {hotkey && <button type="button" className="uvix-hkey" data-testid="voice-hkey" title={`Ovozli yordamchi: ${HOTKEY} ni bosib turib gapiring, qo'yib yuboring — tayyor`}
        onClick={() => emit("down", { via: "click" })}
        style={{ color: rec ? THEME.rose : THEME.muted, background: THEME.chip, borderColor: THEME.border }}>
        <Mic size={14} /> <kbd style={{ borderColor: THEME.border2, background: THEME.card, color: THEME.text }}>{HOTKEY}</kbd>
      </button>}
    </>
  );
}

/**
 * Sozlamalar → Ko'rinish → «Ovozli yordamchi» (113-eskiz). Faqat yordamchidan foydalana oladigan xodimga ko'rinadi.
 * Asosiy o'chirgich o'chirilsa — yordamchi hamma joydan yo'qoladi (sarlavha mikrofoni, burchak tugmasi, F2).
 * Tanlov serverda, xodimning o'zi uchun saqlanadi — telefon va kompyuterda bir xil.
 */
export function VoiceSettingsCard() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetchVoiceStatus().then(setSt).catch(() => setSt(null)); }, []);
  if (!st?.enabled) return null;
  const prefs = prefsOf(st);
  async function set(patch) {
    const next = { ...prefs, ...patch };
    setErr(""); setSt((c) => ({ ...c, prefs: next })); emit("prefs", next);
    try { const r = await saveVoicePrefs(patch); setSt((c) => ({ ...c, prefs: r.prefs })); emit("prefs", r.prefs); }
    catch (e) { setErr(e.message || "Saqlab bo'lmadi"); setSt((c) => ({ ...c, prefs })); emit("prefs", prefs); }
  }
  const row = (key, title, sub, disabled) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${THEME.border}`, opacity: disabled ? 0.45 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.45, marginTop: 2 }}>{sub}</div>
      </div>
      <button type="button" role="switch" aria-checked={prefs[key]} aria-label={title} disabled={disabled} data-testid={`voice-pref-${key}`}
        onClick={() => set({ [key]: !prefs[key] })} className="uvix-voice-sw"
        style={{ background: prefs[key] ? THEME.violet : THEME.border2 }}><span /></button>
    </div>
  );
  return (
    <div data-testid="voice-settings" style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: THEME.radius, padding: "16px 18px 6px", color: THEME.text }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Mic size={17} color={THEME.violet} />
        <div style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Ovozli yordamchi</div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: THEME.muted, background: THEME.chip, borderRadius: 999, padding: "3px 9px" }}>Faqat siz uchun</span>
      </div>
      {row("on", "Ovozli yordamchi", prefs.on ? "Telefonda — sarlavhadagi mikrofon, kompyuterda — burchakdagi tugma va F2" : "O'chiq — mikrofon hamma joydan yashirilgan (telefon va kompyuter)")}
      {row("fab", "Burchakdagi tugma (kompyuter)", "Pastki o'ng burchakda; oyna ochilganda o'zi yashirinadi", !prefs.on)}
      {row("hotkey", `${HOTKEY} klavishi (kompyuter)`, `${HOTKEY} ni bosib turing — gapiring, qo'yib yuboring — tayyor`, !prefs.on)}
      {err && <div role="alert" style={{ fontSize: 12.5, color: THEME.rose, padding: "0 0 10px" }}>{err}</div>}
    </div>
  );
}

export const VOICE_CSS = () => `
  .uvix-voice-sw { width: 44px; height: 26px; border-radius: 13px; border: 0; position: relative; cursor: pointer; flex-shrink: 0; padding: 0; }
  .uvix-voice-sw:disabled { cursor: default; }
  .uvix-voice-sw > span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: left .15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
  .uvix-voice-sw[aria-checked="true"] > span { left: 21px; }
  .uvix-voice-fab { position: fixed; right: 24px; bottom: 24px; z-index: 240; width: 56px; height: 56px; border-radius: 50%; border: 0; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: box-shadow .08s linear, transform .15s ease; -webkit-tap-highlight-color: transparent; }
  .uvix-voice-fab:active { transform: scale(.93); }
  .uvix-voice-fab.is-covered { opacity: 0; transform: scale(.6); pointer-events: none; }
  .uvix-voice-wave { flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px; height: 30px; overflow: hidden; }
  .uvix-voice-wave > span { width: 3px; border-radius: 2px; flex-shrink: 0; transition: height .09s linear; }
  .uvix-hmic { display: none; }
  .uvix-hkey { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 8px; border-radius: 15px; border: 1px solid; cursor: pointer; font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .uvix-hkey kbd { font: 700 11px/1 inherit; padding: 3px 5px; border-radius: 5px; border: 1px solid; border-bottom-width: 2px; }
  .uvix-voice-panel { position: fixed; right: 24px; bottom: 92px; z-index: 241; width: 360px; max-width: calc(100vw - 24px); border-radius: 16px; padding: 14px; }
  .uvix-voice-btn { height: 36px; border: 0; border-radius: 10px; padding: 0 14px; font-weight: 600; font-size: 13.5px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .uvix-voice-x { border: 0; background: transparent; cursor: pointer; padding: 4px; display: flex; }
  .uvix-voice-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: transparent; border: 1px solid; border-radius: 10px; padding: 8px 10px; cursor: pointer; }
  .uvix-voice-row:hover { background: ${THEME.chip}; }
  .uvix-spin { animation: uvixVoiceSpin 1s linear infinite; }
  @keyframes uvixVoiceSpin { to { transform: rotate(360deg); } }
  @keyframes uvixVoiceBlink { 50% { opacity: .25; } }
  @media (max-width: 860px) {
    /* Telefonda suzuvchi tugma yo'q — mikrofon sarlavhada, «+» yonida */
    .uvix-voice-fab, .uvix-hkey { display: none !important; }
    .uvix-hmic { display: flex; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer; flex-shrink: 0; align-items: center; justify-content: center;
      touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; transition: box-shadow .15s, background .15s; }
    .uvix-hmic.is-rec { box-shadow: 0 0 0 7px color-mix(in srgb, ${THEME.rose} 22%, transparent); }
    .uvix-voice-panel { left: 12px; right: 12px; width: auto; max-width: none; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }
  }
  @media print { .uvix-voice-fab, .uvix-voice-panel, .uvix-hmic, .uvix-hkey { display: none !important; } }
  @media (prefers-reduced-motion: reduce) { .uvix-voice-wave > span, .uvix-hmic { transition: none; } }
`;
