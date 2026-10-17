// JobDrawer.jsx — vazifa tafsiloti: kompyuterda o'ngdan panel, telefonda pastdan varaq.
// Holat, qachon/qayerda/kim, tekshiruv ro'yxati, rasmlar, tarix, izoh. Mas'ul xodim ham belgilaydi va rasm yuklaydi.
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, MessageSquare, Navigation, Pencil, Phone, Play, RotateCcw, Send, X } from "lucide-react";
import { SlideToDone } from "./SlideToDone.jsx";
import { LineTag } from "../../components/LineSwitcher.jsx";
import { useBackToClose } from "../../lib/history.js";
import { updateJob, uploadJobPhotos } from "../../storage.js";
import { THEME } from "../../theme.js";
import { KindBadge } from "./JobParts.jsx";
import { hm2min, isLate, isOpen, mapsUrl, min2hm, whenText } from "./jobsLib.js";

const fmtAt = (s) => { if (!s) return ""; const d = new Date(s); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${d.toTimeString().slice(0, 5)}`; };

export function JobDrawer({ job, canManage, isMobile, onClose, onChanged, onEdit, onDone, customFields = [], renderCustom, stages = [], slideDone = false }) {
  const [j, setJ] = useState(job);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [allLog, setAllLog] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => setJ(job), [job]);
  useBackToClose(true, onClose);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function patch(body) {
    setBusy(true); setErr("");
    try { const r = await updateJob(j.id, body); setJ(r.job); onChanged?.(r.job); return r.job; } catch (e) { setErr(e.message); return null; } finally { setBusy(false); }
  }
  async function upload(files) {
    if (!files?.length) return;
    setBusy(true); setErr("");
    try { const nj = await uploadJobPhotos(j.id, [...files]); setJ(nj); onChanged?.(nj); } catch (e) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  const list = j.checklist || [];
  const doneN = list.filter((c) => c.done).length;
  const start = hm2min(j.time);
  const when = j.date ? `${whenText(j)}${start != null && j.duration ? `–${min2hm(Math.min(start + j.duration, 1439))}` : ""}` : "Sanasi belgilanmagan";
  const late = isLate(j);
  const log = Array.isArray(j.log) ? j.log : [];
  const shownLog = allLog ? log : log.slice(-6);

  const row = (label, value, testid) => (
    <div data-row={testid} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 10, padding: "7px 0", fontSize: 14, alignItems: "baseline" }}>
      <span style={{ color: THEME.muted }}>{label}</span><span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
  const sec = (t) => <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: THEME.muted, margin: "16px 0 8px" }}>{t}</div>;
  const segBtn = (s, l) => {
    const on = j.status === s && !(s === "doing" && j.stage && stages.some((x) => x.id === j.stage));
    const c = s === "done" ? THEME.green : s === "doing" ? THEME.amber : THEME.muted;
    return (
      <button key={s} type="button" disabled={busy || on} data-drawer-status={s} aria-pressed={on}
        onClick={() => (s === "done" ? onDone?.(j) : patch({ status: s, stage: null }))}
        style={{ height: 32, padding: "0 12px", borderRadius: 999, cursor: on ? "default" : "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, border: `1.5px solid ${on ? c : THEME.border}`, background: on ? c + "1F" : THEME.card, color: on ? c : THEME.mutedDark || THEME.text }}>
        {on && s !== "new" ? "● " : ""}{l}
      </button>
    );
  };

  const body = (
    <div data-testid="job-drawer" data-drawer-job={j.id} style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div style={{ padding: isMobile ? "6px 18px 0" : "18px 20px 0", flexShrink: 0 }}>
        {isMobile && <div style={{ width: 40, height: 4, borderRadius: 2, background: THEME.border2, margin: "4px auto 10px" }} />}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <KindBadge kind={j.kind} />
          {j.line && <LineTag line={j.line} />}
          {late && <span style={{ fontSize: 12, fontWeight: 700, color: THEME.rose }}>· kechikdi</span>}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} aria-label="Yopish" data-testid="drawer-close" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={16} /></button>
        </div>
        <h2 style={{ margin: "12px 0 10px", fontSize: 19, lineHeight: 1.3, fontWeight: 750 }}>{j.title}</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{segBtn("new", "Yangi")}{segBtn("doing", "Jarayonda")}
          {stages.map((st) => { const on = j.status === "doing" && j.stage === st.id; return (
            <button key={st.id} type="button" disabled={busy || on} data-drawer-stage={st.id} aria-pressed={on} onClick={() => patch({ stage: st.id })}
              style={{ height: 32, padding: "0 12px", borderRadius: 999, cursor: on ? "default" : "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, border: `1.5px solid ${on ? st.color : THEME.border}`, background: on ? st.color + "1F" : THEME.card, color: on ? st.color : THEME.mutedDark || THEME.text }}>{on ? "● " : ""}{st.name}</button>); })}
          {segBtn("done", "Bajarildi")}</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "8px 18px 12px" : "8px 20px 16px" }}>
        {row("Qachon", <span style={{ color: late ? THEME.rose : undefined }}>{when}</span>, "when")}
        {j.address && row("Manzil", <a href={mapsUrl(j.address)} target="_blank" rel="noreferrer" style={{ color: THEME.blue, textDecoration: "none" }}>{j.address} ↗</a>, "address")}
        {(j.phone || j.order?.customer) && row("Mijoz", <>{j.order?.customer || ""}{j.phone ? <>{j.order?.customer ? " · " : ""}<a href={`tel:${j.phone.replace(/[^\d+]/g, "")}`} style={{ color: THEME.blue, textDecoration: "none" }}>{j.phone}</a></> : null}</>, "customer")}
        {row("Brigada", j.assignees?.length ? j.assignees.map((a) => a.name).join(", ") : <span style={{ color: THEME.amber }}>mas'ul tayinlanmagan</span>, "people")}
        {j.order && row("Buyurtma", <span>{j.order.orderNumber}{j.order.title ? ` · ${j.order.title}` : ""}</span>, "order")}
        {customFields.map((f) => <div key={f.id}>{row(<span>{f.name} <span style={{ color: THEME.blue }}>✦</span></span>, renderCustom ? renderCustom(f, j, patch) : String(j.custom?.[f.id] ?? "—"), `cf-${f.id}`)}</div>)}
        {j.note && <div style={{ marginTop: 8, padding: "9px 12px", background: THEME.chip, borderRadius: 10, fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{j.note}</div>}

        {(list.length > 0 || canManage) && <>
          {sec(`Tekshiruv ro'yxati · ${doneN}/${list.length}`)}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="job-checklist">
            {list.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36 }}>
                <button type="button" disabled={busy} onClick={() => patch({ check: { id: c.id, done: !c.done } })} data-check={c.id} aria-pressed={!!c.done} aria-label={c.text}
                  style={{ width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${c.done ? THEME.green : THEME.border2}`, background: c.done ? THEME.green : THEME.card, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}>
                  {c.done && <Check size={15} strokeWidth={3} />}
                </button>
                <span style={{ flex: 1, fontSize: 14, color: c.done ? THEME.muted : THEME.text }}>{c.text}{c.done && c.doneBy ? <span style={{ fontSize: 11.5, color: THEME.dim }}> · {c.doneBy.split(" ")[0]}</span> : null}</span>
                {canManage && <button type="button" onClick={() => patch({ checklist: list.filter((x) => x.id !== c.id) })} aria-label="Olib tashlash" style={{ border: 0, background: "none", color: THEME.dim, cursor: "pointer", padding: 4 }}><X size={14} /></button>}
              </div>
            ))}
            {canManage && (
              <form onSubmit={(e) => { e.preventDefault(); const t = newItem.trim(); if (!t) return; setNewItem(""); patch({ checklist: [...list, { text: t, done: false }] }); }} style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="+ band qo'shish" data-testid="check-new"
                  style={{ flex: 1, height: 34, border: `1px dashed ${THEME.border2}`, borderRadius: 9, padding: "0 10px", fontFamily: "inherit", fontSize: 13.5, background: THEME.card, color: THEME.text, outline: "none" }} />
              </form>
            )}
          </div>
        </>}

        {sec(`Rasmlar${j.photos?.length ? ` · ${j.photos.length}` : ""}`)}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="job-photos">
          {(j.photos || []).map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ width: 72, height: 72, borderRadius: 10, overflow: "hidden", background: THEME.chip, display: "block" }}>
              <img src={p.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </a>
          ))}
          <label style={{ width: 72, height: 72, borderRadius: 10, border: `1px dashed ${THEME.border2}`, display: "grid", placeItems: "center", color: THEME.muted, cursor: "pointer" }} aria-label="Rasm qo'shish">
            {busy ? <Loader2 size={18} className="uvix-spin" /> : <Camera size={20} />}
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={(e) => upload(e.target.files)} style={{ display: "none" }} data-testid="job-photo-input" />
          </label>
        </div>

        {log.length > 0 && <>
          {sec("Tarix")}
          <div style={{ borderLeft: `2px solid ${THEME.border}`, paddingLeft: 12, display: "flex", flexDirection: "column", gap: 7 }} data-testid="job-log">
            {log.length > 6 && !allLog && <button type="button" onClick={() => setAllLog(true)} style={{ alignSelf: "flex-start", border: 0, background: "none", color: THEME.blue, cursor: "pointer", fontSize: 12.5, padding: 0, fontFamily: "inherit" }}>yana {log.length - 6} ta…</button>}
            {shownLog.map((l, i) => (
              <div key={i} style={{ fontSize: 13, lineHeight: 1.4 }}><b>{l.who}</b> <span style={{ color: THEME.mutedDark || THEME.muted }}>— {l.text}</span> <span style={{ color: THEME.dim, fontSize: 12 }}>· {fmtAt(l.at)}</span></div>
            ))}
          </div>
        </>}
        {showComment && (
          <form onSubmit={async (e) => { e.preventDefault(); const t = comment.trim(); if (!t) return; if (await patch({ comment: t })) { setComment(""); setShowComment(false); } }} style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <input autoFocus value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Izoh yozing…" data-testid="job-comment"
              style={{ flex: 1, height: 40, border: `1px solid ${THEME.border2}`, borderRadius: 10, padding: "0 12px", fontFamily: "inherit", fontSize: 14, background: THEME.card, color: THEME.text, outline: "none" }} />
            <button type="submit" disabled={busy} aria-label="Yuborish" style={{ width: 40, height: 40, borderRadius: 10, border: 0, background: THEME.violet, color: THEME.onPrimary || "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}><Send size={16} /></button>
          </form>
        )}
        {err && <div role="alert" style={{ color: THEME.rose, fontSize: 13, marginTop: 10 }}>{err}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: isMobile ? "10px 18px calc(12px + env(safe-area-inset-bottom, 0px))" : "12px 20px 16px", borderTop: `1px solid ${THEME.border}`, flexShrink: 0, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setShowComment((v) => !v)} style={footBtn(false)} data-testid="drawer-comment"><MessageSquare size={16} /> Izoh</button>
        {canManage && <button type="button" onClick={() => onEdit?.(j)} style={footBtn(false)} data-testid="drawer-edit"><Pencil size={15} /> Tahrirlash</button>}
        {j.address && isMobile && <a href={mapsUrl(j.address)} target="_blank" rel="noreferrer" style={footBtn(false)}><Navigation size={16} /> Yo'l</a>}
        {j.phone && isMobile && <a href={`tel:${j.phone.replace(/[^\d+]/g, "")}`} style={footBtn(false)} aria-label="Qo'ng'iroq"><Phone size={16} /></a>}
        {isOpen(j) && (j.status === "new"
          ? <button type="button" disabled={busy} onClick={() => patch({ status: "doing" })} style={{ ...footBtn(true), background: "#0E7C6B" }} data-testid="drawer-start"><Play size={16} /> Boshlash</button>
          : slideDone
            ? <div style={{ flexBasis: "100%", display: "flex" }}><SlideToDone testid="drawer-slide" jobId={j.id} disabled={busy} onDone={() => onDone?.(j)} /></div>
            : <button type="button" disabled={busy} onClick={() => onDone?.(j)} style={footBtn(true)} data-testid="drawer-done"><Check size={17} /> Bajarildi</button>)}
        {/* Xato yakunlangan ish — rahbar/menejer qayta ochadi (tarixda yoziladi) */}
        {canManage && j.status === "done" && <button type="button" disabled={busy} onClick={() => patch({ status: "doing" })} style={{ ...footBtn(true), background: THEME.amberSolid || "#B45309" }} data-testid="drawer-reopen"><RotateCcw size={16} /> Qayta ochish</button>}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 260, background: "rgba(9,9,11,0.38)", display: "flex", alignItems: "flex-end" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "90vh", height: "auto", background: THEME.card, borderRadius: "20px 20px 0 0", boxShadow: THEME.shadowLg, display: "flex", flexDirection: "column", color: THEME.text }}>{body}</div>
      </div>
    );
  }
  return (
    <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 440, maxWidth: "100vw", zIndex: 260, background: THEME.card, borderLeft: `1px solid ${THEME.border}`, boxShadow: THEME.shadowLg, color: THEME.text }} aria-label="Vazifa tafsiloti">
      {body}
    </aside>
  );
}
function footBtn(primary) {
  return { flex: primary ? 1.4 : 1, minWidth: primary ? 140 : 0, height: 44, borderRadius: 12, border: primary ? 0 : `1px solid ${THEME.border2}`, background: primary ? THEME.greenSolid : THEME.card, color: primary ? "#fff" : THEME.text, fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", textDecoration: "none", padding: "0 12px" };
}
