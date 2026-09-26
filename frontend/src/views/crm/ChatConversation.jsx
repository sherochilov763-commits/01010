// ChatConversation.jsx — suhbat oynasi: xabarlar (rasm, ovoz, joylashuv, javob, reaksiya) va yozish paneli
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Copy, MoreHorizontal, Download, File as FileIcon, FileText, Image as ImageIcon, Loader2, MapPin, Mic, Pause, Paperclip, Play, Reply, Send, SmilePlus, Trash2, X } from "lucide-react";
import { useBackToClose } from "../../lib/history.js";

export const REACTIONS = ["👍", "❤", "🔥", "😁", "😢", "🙏", "👌"];

const C = {
  bg: "#0E1621", panel: "#17212B", hover: "#202B36", border: "#101921", text: "#E4ECF2", muted: "#6D7F91",
  blue: "#0088CC", link: "#6AB3F3", outBubble: "#2B5278", inBubble: "#182533", red: "#E5484D", green: "#4FAE4E",
};

const time = (iso) => new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
function snippet(m) {
  if (!m) return "Xabar";
  if (m.mediaType === "photo") return m.text ? `📷 ${m.text}` : "📷 Rasm";
  if (m.mediaType === "voice") return "🎤 Ovozli xabar";
  if (m.mediaType === "location") return "📍 Joylashuv";
  if (m.mediaType === "video") return m.text ? `🎥 ${m.text}` : "🎥 Video";
  if (m.mediaType === "document") return `📎 ${m.fileName || "Hujjat"}`;
  return m.text || "Xabar";
}
function mapUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
export function fmtSize(b) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
const extOf = (name) => ((name || "").split(".").pop() || "").slice(0, 4).toUpperCase();
function fmtDur(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export const CHAT_CSS = `
  .uc-bubble { cursor: pointer; transition: filter .12s ease; -webkit-tap-highlight-color: transparent; }
  .uc-bubble:hover { filter: brightness(1.08); }
  .uc-row { position: relative; }
  .uc-quick { position: absolute; top: 50%; transform: translateY(-50%); display: none; gap: 4px; }
  .uc-row:hover .uc-quick { display: flex; }
  .uc-quick button { width: 30px; height: 30px; border-radius: 50%; border: 0; background: ${C.hover}; color: ${C.muted}; display: grid; place-items: center; cursor: pointer; }
  .uc-quick button:hover { color: ${C.text}; }
  .uc-flash { animation: ucFlash 1.2s ease; }
  @keyframes ucFlash { 0%,100% { filter: none } 30% { filter: brightness(1.6) } }
  .uc-iconbtn { width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; border: 0; background: none; color: ${C.muted}; display: grid; place-items: center; cursor: pointer; }
  .uc-iconbtn:hover { color: ${C.text}; background: ${C.hover}; }
  .uc-menuitem { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 46px; padding: 0 14px; border: 0; background: none; color: ${C.text}; font: inherit; font-size: 14.5px; text-align: left; cursor: pointer; border-radius: 10px; }
  .uc-menuitem:hover { background: ${C.hover}; }
  .uc-menuitem:disabled { opacity: .4; cursor: default; }
  .uc-react { width: 40px; height: 40px; border-radius: 50%; border: 0; background: none; font-size: 22px; cursor: pointer; transition: transform .1s ease; }
  .uc-react:hover { transform: scale(1.2); background: ${C.hover}; }
  .uc-react.on { background: ${C.outBubble}; }
  .uc-rec-dot { width: 10px; height: 10px; border-radius: 50%; background: ${C.red}; animation: ucPulse 1s ease infinite; }
  @keyframes ucPulse { 50% { opacity: .3 } }
  .uc-spin { animation: ucSpin .9s linear infinite; }
  @keyframes ucSpin { to { transform: rotate(360deg) } }
  @media (prefers-reduced-motion: reduce) { .uc-flash, .uc-rec-dot, .uc-spin { animation: none } }
`;

/* ============================ XABARLAR ============================ */
export function MessageList({ messages, loading, isMobile, customerName, onReply, onReact }) {
  const [menu, setMenu] = useState(null); // { m, rect }
  const [lightbox, setLightbox] = useState(null);
  const byTgId = useMemo(() => {
    const map = new Map();
    for (const m of messages) if (m.tgId) map.set(m.tgId, m);
    return map;
  }, [messages]);

  function jumpTo(tgId) {
    const el = document.getElementById(`uc-msg-${tgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("uc-flash");
    void el.offsetWidth;
    el.classList.add("uc-flash");
  }
  function openMenu(e, m) {
    setMenu({ m, rect: e.currentTarget.getBoundingClientRect() });
  }

  if (loading) return <div style={{ textAlign: "center", color: C.muted, fontSize: 12.5, marginTop: 20 }}>Yuklanmoqda...</div>;
  if (messages.length === 0) return <div style={{ textAlign: "center", color: C.muted, fontSize: 12.5, marginTop: 20 }}>Hali xabar yo'q</div>;

  return (
    <>
      {messages.map((m) => {
        const quoted = m.replyToTgId ? byTgId.get(m.replyToTgId) : null;
        const bubbleBg = m.out ? C.outBubble : C.inBubble;
        const canAct = !!m.tgId;
        return (
          <div key={m.id} className="uc-row" style={{ alignSelf: m.out ? "flex-end" : "flex-start", maxWidth: isMobile ? "84%" : "62%", display: "flex", flexDirection: "column", alignItems: m.out ? "flex-end" : "flex-start" }}>
            {!isMobile && canAct && (
              <div className="uc-quick" style={m.out ? { right: "calc(100% + 6px)" } : { left: "calc(100% + 6px)" }}>
                <button type="button" aria-label="Javob berish" title="Javob berish" onClick={() => onReply(m)}><Reply size={15} /></button>
                <button type="button" aria-label="Reaksiya" title="Reaksiya" onClick={(e) => setMenu({ m, rect: e.currentTarget.parentElement.parentElement.getBoundingClientRect() })}><SmilePlus size={15} /></button>
              </div>
            )}
            <div
              id={m.tgId ? `uc-msg-${m.tgId}` : undefined}
              className="uc-bubble"
              role="button"
              tabIndex={0}
              aria-label="Xabar amallari"
              onClick={(e) => openMenu(e, m)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openMenu(e, m))}
              style={{
                background: m.mediaType === "photo" && !m.text && !quoted ? "transparent" : bubbleBg,
                color: C.text, borderRadius: 14, overflow: "hidden",
                borderBottomRightRadius: m.out ? 4 : 14, borderBottomLeftRadius: m.out ? 14 : 4,
                fontSize: 14, wordBreak: "break-word", maxWidth: "100%",
              }}
            >
              {quoted !== null && m.replyToTgId && (
                <div onClick={(e) => { e.stopPropagation(); jumpTo(m.replyToTgId); }}
                  style={{ margin: "6px 6px 0", padding: "4px 8px", borderLeft: `3px solid ${C.link}`, background: "rgba(255,255,255,0.06)", borderRadius: 6, cursor: "pointer", minWidth: 120 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.link }}>{quoted ? (quoted.out ? "Siz" : customerName) : "Xabar"}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{quoted ? snippet(quoted) : "Asl xabar topilmadi"}</div>
                </div>
              )}
              <MessageBody m={m} onPhoto={(url, e) => (isMobile ? openMenu(e, m) : setLightbox(url))} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
              {m.myReaction && (
                <button type="button" onClick={() => onReact(m, null)} title="Reaksiyani olib tashlash"
                  style={{ height: 24, padding: "0 7px", borderRadius: 12, border: `1px solid ${C.link}55`, background: `${C.outBubble}`, color: C.text, fontSize: 14, cursor: "pointer", lineHeight: 1 }}>
                  {m.myReaction}
                </button>
              )}
              {isMobile && (m.mediaType === "video" || m.mediaType === "document") && (
                <button type="button" aria-label="Xabar amallari" onClick={(e) => setMenu({ m, rect: e.currentTarget.getBoundingClientRect() })}
                  style={{ width: 32, height: 24, borderRadius: 12, border: 0, background: C.hover, color: C.muted, display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <MoreHorizontal size={16} />
                </button>
              )}
              <span style={{ fontSize: 10.5, color: C.muted }}>{time(m.date)}</span>
              {m.out && <CheckCheck size={12} color={C.blue} />}
            </div>
          </div>
        );
      })}

      {menu && (
        <MessageMenu
          m={menu.m}
          rect={menu.rect}
          isMobile={isMobile}
          onClose={() => setMenu(null)}
          onReply={() => { onReply(menu.m); setMenu(null); }}
          onReact={(emoji) => { onReact(menu.m, emoji); setMenu(null); }}
          onView={menu.m.mediaType === "photo" && menu.m.mediaUrl ? () => { setMenu(null); setTimeout(() => setLightbox(menu.m.mediaUrl), 0); } : null}
        />
      )}
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

function MessageBody({ m, onPhoto }) {
  if (m.mediaType === "photo" && m.mediaUrl) {
    return (
      <>
        <img src={m.mediaUrl} alt="Rasm" loading="lazy"
          onClick={(e) => { e.stopPropagation(); onPhoto(m.mediaUrl, e); }}
          style={{ display: "block", width: "100%", maxWidth: 300, maxHeight: 360, objectFit: "cover", cursor: "zoom-in", background: C.hover }} />
        {m.text && <div style={{ padding: "7px 11px", fontSize: 14 }}>{m.text}</div>}
      </>
    );
  }
  if (m.mediaType === "video") {
    return (
      <>
        {m.mediaUrl ? (
          <video src={m.mediaUrl} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()}
            style={{ display: "block", width: "100%", maxWidth: 320, maxHeight: 360, background: "#000" }} />
        ) : (
          <div style={{ padding: "12px 14px", color: C.muted, fontSize: 13 }}>🎥 Video ({fmtSize(m.fileSize)}) — 50 MB dan katta, Telegram'da oching</div>
        )}
        {m.text && <div style={{ padding: "7px 11px", fontSize: 14 }}>{m.text}</div>}
      </>
    );
  }
  if (m.mediaType === "document") {
    const href = m.mediaUrl ? `${m.mediaUrl}?dl=1&name=${encodeURIComponent(m.fileName || "fayl")}` : null;
    const Tag = href ? "a" : "div";
    return (
      <>
        <Tag {...(href ? { href, download: m.fileName || "fayl" } : {})} onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", minWidth: 220, color: C.text, textDecoration: "none" }}>
          <span style={{ width: 44, height: 44, borderRadius: 10, background: m.out ? "rgba(255,255,255,0.14)" : C.blue, display: "grid", placeItems: "center", flexShrink: 0, position: "relative" }}>
            {href ? <Download size={20} color="#fff" /> : <FileText size={20} color="#fff" />}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{m.fileName || "Hujjat"}</span>
            <span style={{ display: "block", fontSize: 12, color: m.out ? "rgba(255,255,255,0.7)" : C.muted }}>
              {[extOf(m.fileName), fmtSize(m.fileSize)].filter(Boolean).join(" · ")}{!href && m.fileSize ? " · Telegram'da oching" : ""}
            </span>
          </span>
        </Tag>
        {m.text && <div style={{ padding: "0 12px 8px", fontSize: 14 }}>{m.text}</div>}
      </>
    );
  }
  if (m.mediaType === "voice" && m.mediaUrl) return <VoicePlayer url={m.mediaUrl} altUrl={m.mediaUrlAlt} out={m.out} knownDuration={m.duration} />;
  if (m.mediaType === "location" && Number.isFinite(m.lat)) {
    return (
      <div style={{ padding: 10, minWidth: 220 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.08)", display: "grid", placeItems: "center", flexShrink: 0 }}><MapPin size={20} color={C.red} /></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Joylashuv</div>
            <div style={{ fontSize: 12, color: C.muted }}>{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</div>
          </div>
        </div>
        <a href={mapUrl(m.lat, m.lng)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          style={{ display: "block", marginTop: 8, padding: "8px 0", textAlign: "center", borderRadius: 8, background: "rgba(255,255,255,0.08)", color: C.link, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
          Xaritada ochish
        </a>
      </div>
    );
  }
  return <div style={{ padding: "8px 12px", whiteSpace: "pre-wrap" }}>{m.text}</div>;
}

const audioType = (u) => (u.endsWith(".m4a") ? "audio/mp4" : u.endsWith(".ogg") ? "audio/ogg" : u.endsWith(".webm") ? "audio/webm" : undefined);
function VoicePlayer({ url, altUrl, out, knownDuration }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(knownDuration || 0);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => setPos(a.currentTime);
    const onMeta = () => Number.isFinite(a.duration) && a.duration > 0 && setDur(a.duration);
    const onEnd = () => { setPlaying(false); setPos(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    return () => { a.removeEventListener("timeupdate", onTime); a.removeEventListener("loadedmetadata", onMeta); a.removeEventListener("durationchange", onMeta); a.removeEventListener("ended", onEnd); };
  }, []);
  function toggle(e) {
    e.stopPropagation();
    const a = ref.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else {
      document.querySelectorAll("audio[data-uc]").forEach((x) => x !== a && x.pause());
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }
  function seek(e) {
    e.stopPropagation();
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  }
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px 8px 8px", minWidth: 210 }} onClick={(e) => e.stopPropagation()}>
      <audio ref={ref} preload="metadata" data-uc onPause={() => setPlaying(false)}>
        {/* Brauzer o'zi qo'llaydigan formatni tanlaydi: M4A (iPhone) yoki OGG (qolganlari) */}
        <source src={url} type={audioType(url)} />
        {altUrl && <source src={altUrl} type={audioType(altUrl)} />}
      </audio>
      <button type="button" onClick={toggle} aria-label={playing ? "To'xtatish" : "Tinglash"}
        style={{ width: 40, height: 40, borderRadius: "50%", border: 0, background: out ? "#fff" : C.blue, color: out ? C.outBubble : "#fff", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div onClick={seek} role="slider" aria-label="Ovoz o'rni" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)}
          style={{ height: 18, display: "flex", alignItems: "center", cursor: "pointer" }}>
          <div style={{ height: 4, width: "100%", borderRadius: 2, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: out ? "#fff" : C.link }} />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: out ? "rgba(255,255,255,0.75)" : C.muted }}>{fmtDur(playing || pos ? pos : dur)}</div>
      </div>
    </div>
  );
}

function MessageMenu({ m, rect, isMobile, onClose, onReply, onReact, onView }) {
  useBackToClose(true, onClose);
  const boxRef = useRef(null);
  const [pos, setPos] = useState(null);
  const canAct = !!m.tgId;
  useLayoutEffect(() => {
    if (isMobile || !boxRef.current) return;
    const b = boxRef.current.getBoundingClientRect();
    let top = rect.bottom + 6;
    if (top + b.height > window.innerHeight - 8) top = Math.max(8, rect.top - b.height - 6);
    let left = m.out ? rect.right - b.width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - b.width - 8));
    setPos({ top, left });
  }, [isMobile, rect, m.out]);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  async function copy() {
    try { await navigator.clipboard.writeText(m.text || ""); } catch { /* ruxsat yo'q */ }
    onClose();
  }
  const box = isMobile
    ? { position: "fixed", left: 8, right: 8, bottom: "calc(8px + env(safe-area-inset-bottom, 0px))", borderRadius: 18 }
    : { position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: 300, borderRadius: 14 };
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: isMobile ? "rgba(0,0,0,0.45)" : "transparent" }} />
      <div ref={boxRef} role="menu" aria-label="Xabar amallari"
        style={{ ...box, zIndex: 401, background: C.panel, border: `1px solid ${C.hover}`, boxShadow: "0 16px 40px rgba(0,0,0,0.5)", padding: 6 }}>
        {canAct ? (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 2px 6px", borderBottom: `1px solid ${C.hover}`, marginBottom: 4 }}>
            {REACTIONS.map((r) => (
              <button key={r} type="button" className={`uc-react${m.myReaction === r ? " on" : ""}`} aria-label={`Reaksiya ${r}`}
                onClick={() => onReact(m.myReaction === r ? null : r)}>{r}</button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.muted, padding: "6px 10px 8px" }}>Bu xabar yangilanishdan oldin kelgan — reaksiya va javob faqat yangi xabarlarga ishlaydi.</div>
        )}
        {onView && <button type="button" className="uc-menuitem" onClick={onView}><ImageIcon size={18} color={C.muted} /> Rasmni ko'rish</button>}
        <button type="button" className="uc-menuitem" onClick={onReply} disabled={!canAct}><Reply size={18} color={C.muted} /> Javob berish</button>
        {m.text && <button type="button" className="uc-menuitem" onClick={copy}><Copy size={18} color={C.muted} /> Nusxa olish</button>}
        {isMobile && <button type="button" className="uc-menuitem" onClick={onClose} style={{ justifyContent: "center", color: C.muted }}>Bekor qilish</button>}
      </div>
    </>
  );
}

function Lightbox({ url, onClose }) {
  useBackToClose(true, onClose);
  return (
    <div onClick={onClose} role="dialog" aria-label="Rasm"
      style={{ position: "fixed", inset: 0, zIndex: 450, background: "rgba(0,0,0,0.92)", display: "grid", placeItems: "center", padding: 16 }}>
      <img src={url} alt="Rasm" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
      <button type="button" aria-label="Yopish" onClick={onClose}
        style={{ position: "fixed", top: "calc(12px + env(safe-area-inset-top, 0px))", right: 12, width: 44, height: 44, borderRadius: "50%", border: 0, background: "rgba(255,255,255,0.15)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
        <X size={22} />
      </button>
    </div>
  );
}

/* ============================ YOZISH PANELI ============================ */
function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

export function Composer({ isMobile, customerName, replyTo, onCancelReply, onSendText, onSendFile, onSendVoice, onSendLocation }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [media, setMedia] = useState(null); // { file, url, kind: photo|video|document, caption }
  const [loc, setLoc] = useState(null); // { lat, lng, accuracy } | "loading"
  const [rec, setRec] = useState(null); // { started }
  const [recSecs, setRecSecs] = useState(0);
  const fileRef = useRef(null);
  const docRef = useRef(null);
  const inputRef = useRef(null);
  const recRef = useRef(null); // { recorder, chunks, stream, cancelled }
  const MAX_REC = 300;

  useEffect(() => { if (replyTo) inputRef.current?.focus(); }, [replyTo]);
  useEffect(() => () => stopStream(), []);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - rec.started) / 1000);
      setRecSecs(s);
      if (s >= MAX_REC) finishRecording(true);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  async function run(fn) {
    setBusy(true);
    setError("");
    try { await fn(); return true; } catch (e) { setError(e?.message || "Yuborilmadi"); return false; } finally { setBusy(false); }
  }

  async function sendText() {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    const ok = await run(() => onSendText(t));
    if (!ok) setText(t);
  }

  // ---- Foto/video va hujjat ----
  function pickMedia() {
    setAttachOpen(false);
    fileRef.current?.click();
  }
  function pickDocument() {
    setAttachOpen(false);
    docRef.current?.click();
  }
  function onFile(e, asDocument) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const kind = asDocument ? "document" : f.type.startsWith("image/") ? "photo" : f.type.startsWith("video/") ? "video" : "document";
    const limit = kind === "photo" ? 15 : 50;
    if (f.size > limit * 1024 * 1024) return setError(`Fayl ${limit} MB dan katta bo'lmasin (${fmtSize(f.size)})`);
    setMedia({ file: f, kind, url: kind === "document" ? null : URL.createObjectURL(f), caption: text.trim() });
  }
  function closeMedia() {
    if (media?.url) URL.revokeObjectURL(media.url);
    setMedia(null);
  }
  async function sendMedia() {
    const p = media;
    const ok = await run(() => onSendFile(p.kind, p.file, p.caption));
    if (ok) {
      if (p.caption === text.trim()) setText("");
      if (p.url) URL.revokeObjectURL(p.url);
      setMedia(null);
    }
  }

  // ---- Joylashuv ----
  function pickLocation() {
    setAttachOpen(false);
    if (!navigator.geolocation) return setError("Bu qurilma joylashuvni aniqlay olmaydi");
    setLoc("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => {
        setLoc(null);
        setError(e.code === 1 ? "Joylashuvga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering." : "Joylashuvni aniqlab bo'lmadi, qaytadan urinib ko'ring");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }
  async function sendLocation() {
    const l = loc;
    const ok = await run(() => onSendLocation(l.lat, l.lng));
    if (ok) setLoc(null);
  }

  // ---- Ovozli xabar ----
  function stopStream() {
    recRef.current?.stream?.getTracks().forEach((t) => t.stop());
  }
  async function startRecording() {
    setError("");
    const mime = pickRecorderMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) return setError("Bu brauzer ovoz yozishni qo'llamaydi");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      return setError(e?.name === "NotAllowedError" ? "Mikrofonga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering." : "Mikrofonni ochib bo'lmadi");
    }
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const state = { recorder, chunks: [], stream, cancelled: false, mime: recorder.mimeType || mime || "audio/webm" };
    recorder.ondataavailable = (e) => e.data?.size && state.chunks.push(e.data);
    recRef.current = state;
    recorder.start(250);
    setRecSecs(0);
    setRec({ started: Date.now() });
  }
  function finishRecording(send) {
    const state = recRef.current;
    if (!state) return;
    state.cancelled = !send;
    state.recorder.onstop = async () => {
      stopStream();
      recRef.current = null;
      const secs = Math.floor((Date.now() - (rec?.started || Date.now())) / 1000);
      setRec(null);
      if (state.cancelled) return;
      if (secs < 1) return setError("Ovozli xabar juda qisqa");
      const blob = new Blob(state.chunks, { type: state.mime.split(";")[0] });
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      await run(() => onSendVoice(blob, `voice.${ext}`));
    };
    if (state.recorder.state !== "inactive") state.recorder.stop();
  }

  const hasText = text.trim().length > 0;
  const bar = { display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "8px 8px" : "10px 14px", background: C.panel, borderTop: `1px solid ${C.border}` };

  return (
    <div style={{ position: "relative" }}>
      {error && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(229,72,77,0.12)", color: "#FF9EA1", fontSize: 12.5 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Yopish" style={{ border: 0, background: "none", color: "inherit", cursor: "pointer", display: "flex" }}><X size={15} /></button>
        </div>
      )}
      {replyTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: C.panel, borderTop: `1px solid ${C.border}` }}>
          <Reply size={18} color={C.link} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, borderLeft: `3px solid ${C.link}`, paddingLeft: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.link }}>Javob: {replyTo.out ? "o'z xabaringiz" : customerName}</div>
            <div style={{ fontSize: 13, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{snippet(replyTo)}</div>
          </div>
          <button type="button" className="uc-iconbtn" onClick={onCancelReply} aria-label="Javobni bekor qilish"><X size={18} /></button>
        </div>
      )}

      {rec ? (
        <div style={bar}>
          <button type="button" className="uc-iconbtn" onClick={() => finishRecording(false)} aria-label="Ovozli xabarni bekor qilish" style={{ color: C.red }}><Trash2 size={20} /></button>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, color: C.text, fontSize: 15 }}>
            <span className="uc-rec-dot" />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDur(recSecs)}</span>
            <span style={{ color: C.muted, fontSize: 13 }}>Yozilmoqda…</span>
          </div>
          <button type="button" onClick={() => finishRecording(true)} aria-label="Ovozli xabarni yuborish"
            style={{ width: 44, height: 44, borderRadius: "50%", border: 0, background: C.blue, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
            <Send size={18} />
          </button>
        </div>
      ) : (
        <div style={bar}>
          <button type="button" className="uc-iconbtn" onClick={() => setAttachOpen((v) => !v)} aria-label="Biriktirish" aria-expanded={attachOpen} disabled={busy}><Paperclip size={21} /></button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
            placeholder="Xabar yozing..."
            aria-label="Xabar"
            style={{ flex: 1, minWidth: 0, background: C.hover, border: "none", borderRadius: 20, padding: "11px 16px", fontSize: isMobile ? 16 : 14, outline: "none", color: C.text }}
          />
          {hasText ? (
            <button type="button" onClick={sendText} disabled={busy} aria-label="Yuborish"
              style={{ width: 44, height: 44, borderRadius: "50%", background: C.blue, border: "none", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={18} className="uc-spin" /> : <Send size={18} />}
            </button>
          ) : (
            <button type="button" onClick={startRecording} disabled={busy} aria-label="Ovozli xabar yozish" title="Ovozli xabar"
              style={{ width: 44, height: 44, borderRadius: "50%", background: busy ? C.hover : C.blue, border: "none", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
              {busy ? <Loader2 size={18} className="uc-spin" /> : <Mic size={19} />}
            </button>
          )}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*,video/*" onChange={(e) => onFile(e, false)} style={{ display: "none" }} />
      <input ref={docRef} type="file" onChange={(e) => onFile(e, true)} style={{ display: "none" }} />

      {attachOpen && (
        <>
          <div onClick={() => setAttachOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 300 }} />
          <div role="menu" style={{ position: "absolute", left: 8, bottom: "calc(100% + 6px)", zIndex: 301, width: 230, padding: 6, borderRadius: 14, background: C.panel, border: `1px solid ${C.hover}`, boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
            <button type="button" role="menuitem" className="uc-menuitem" onClick={pickMedia}><ImageIcon size={19} color="#6AB3F3" /> Foto yoki video</button>
            <button type="button" role="menuitem" className="uc-menuitem" onClick={pickDocument}><FileIcon size={19} color="#F5A524" /> Hujjat</button>
            <button type="button" role="menuitem" className="uc-menuitem" onClick={pickLocation}><MapPin size={19} color={C.red} /> Joylashuvim</button>
          </div>
        </>
      )}

      {media && (
        <SendSheet title={media.kind === "photo" ? "Rasm yuborish" : media.kind === "video" ? "Video yuborish" : "Hujjat yuborish"} onClose={closeMedia} onSend={sendMedia} busy={busy} isMobile={isMobile}>
          {media.kind === "photo" && (
            <img src={media.url} alt="Tanlangan rasm" style={{ display: "block", width: "100%", maxHeight: isMobile ? "45vh" : 360, objectFit: "contain", borderRadius: 10, background: "#000" }} />
          )}
          {media.kind === "video" && (
            <video src={media.url} controls playsInline style={{ display: "block", width: "100%", maxHeight: isMobile ? "45vh" : 360, borderRadius: 10, background: "#000" }} />
          )}
          {media.kind === "document" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, background: C.hover }}>
              <span style={{ width: 48, height: 48, borderRadius: 12, background: C.blue, display: "grid", placeItems: "center", flexShrink: 0 }}><FileText size={22} color="#fff" /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{media.file.name}</div>
                <div style={{ color: C.muted, fontSize: 12.5 }}>{[extOf(media.file.name), fmtSize(media.file.size)].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          )}
          {busy && media.file.size > 5 * 1024 * 1024 && (
            <div style={{ color: C.muted, fontSize: 12.5, marginTop: 8 }}>Katta fayl yuklanmoqda, biroz kuting…</div>
          )}
          <input value={media.caption} onChange={(e) => setMedia((p) => ({ ...p, caption: e.target.value }))} placeholder="Izoh qo'shish (ixtiyoriy)" aria-label="Izoh"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), sendMedia())}
            style={{ marginTop: 10, width: "100%", boxSizing: "border-box", background: C.hover, border: "none", borderRadius: 12, padding: "11px 14px", fontSize: isMobile ? 16 : 14, color: C.text, outline: "none" }} />
        </SendSheet>
      )}
      {loc && (
        <SendSheet title="Joylashuvni yuborish" onClose={() => setLoc(null)} onSend={sendLocation} busy={busy || loc === "loading"} isMobile={isMobile}>
          {loc === "loading" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.muted, padding: "18px 4px" }}><Loader2 size={18} className="uc-spin" /> Joylashuv aniqlanmoqda…</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 2px" }}>
              <span style={{ width: 48, height: 48, borderRadius: 12, background: C.hover, display: "grid", placeItems: "center", flexShrink: 0 }}><MapPin size={24} color={C.red} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, fontWeight: 600 }}>{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</div>
                <div style={{ color: C.muted, fontSize: 12.5 }}>Aniqlik: ~{loc.accuracy} m · <a href={mapUrl(loc.lat, loc.lng)} target="_blank" rel="noopener noreferrer" style={{ color: C.link }}>xaritada tekshirish</a></div>
              </div>
            </div>
          )}
        </SendSheet>
      )}
    </div>
  );
}

function SendSheet({ title, children, onClose, onSend, busy, isMobile }) {
  useBackToClose(true, onClose);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.55)" }} />
      <div role="dialog" aria-label={title}
        style={isMobile
          ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 401, background: C.panel, borderRadius: "18px 18px 0 0", padding: "14px 14px calc(14px + env(safe-area-inset-bottom, 0px))" }
          : { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 401, width: 420, maxWidth: "calc(100vw - 32px)", background: C.panel, borderRadius: 16, padding: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15.5 }}>{title}</div>
          <button type="button" className="uc-iconbtn" onClick={onClose} aria-label="Yopish"><X size={19} /></button>
        </div>
        {children}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, height: 44, borderRadius: 12, border: `1px solid ${C.hover}`, background: "none", color: C.text, fontSize: 14.5, cursor: "pointer" }}>Bekor qilish</button>
          <button type="button" onClick={onSend} disabled={busy}
            style={{ flex: 1, height: 44, borderRadius: 12, border: 0, background: C.blue, color: "#fff", fontSize: 14.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {busy ? <Loader2 size={17} className="uc-spin" /> : <Send size={17} />} Yuborish
          </button>
        </div>
      </div>
    </>
  );
}
