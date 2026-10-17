// JobForm.jsx — vazifani qo'shish/tahrirlash oynasi (tur, buyurtma, vaqt, davomiyligi, manzil, mas'ullar, holat).
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Field, Modal, getInputStyle } from "../../components/ui.jsx";
import { useLine } from "../../lib/lines.js";
import { createJob, deleteJob, fetchGeoLive, updateJob } from "../../storage.js";
import { THEME } from "../../theme.js";
import { JOB_KINDS, STATUS, today } from "./jobsLib.js";
import { CustomInput } from "./CustomFields.jsx";
import { fieldsFor } from "./jobsPrefs.js";
import { GeoField } from "./GeoField.jsx";
import { Avatar } from "./JobParts.jsx";
import { fmtKm, okGeo, recommend } from "./geoLib.js";

export const DURATION = { measure: 60, install: 120, deliver: 40, other: 60 };

export function JobForm({ job, employees, orders, onClose, onSaved, presetOrderId, preset, config, allJobs = [] }) {
  const { line } = useLine();
  const [f, setF] = useState(() => ({
    kind: job?.kind || preset?.kind || "measure", orderId: job?.orderId || presetOrderId || "", leadId: job?.leadId || preset?.leadId || null, title: job?.title || preset?.title || "", date: job ? job.date || "" : preset?.date !== undefined ? preset.date || "" : today(), time: job?.time || preset?.time || "",
    address: job?.address || preset?.address || "", phone: job?.phone || preset?.phone || "", note: job?.note || "", assigneeIds: job?.assigneeIds || preset?.assigneeIds || [], custom: { ...(job?.custom || {}) }, geo: job?.geo || preset?.geo || null, duration: job?.duration || preset?.duration || DURATION[job?.kind || preset?.kind || "measure"], line: job?.line || preset?.line || (line !== "all" ? line : "UVIXPRINT"),
  }));
  const [err, setErr] = useState("");
  const [live, setLive] = useState({ pos: {}, workshop: null });
  useEffect(() => { fetchGeoLive().then((r) => setLive({ pos: Object.fromEntries((r.staff || []).filter((x) => x.pos).map((x) => [x.id, x.pos])), workshop: r.workshop })).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const openOrders = useMemo(() => (orders || []).filter((o) => !o.deletedAt && (o.prodStage !== "delivered" || o.id === f.orderId)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 300), [orders, f.orderId]);
  const people = (employees || []).filter((e) => e.role !== "admin" || e.id === job?.createdById);
  const field = people.filter((e) => e.role === "installer");
  const recs = useMemo(() => (okGeo(f.geo) && f.date ? recommend({ target: f.geo, date: f.date, time: f.time, duration: f.duration, people: field.length ? field : people.filter((e) => e.role !== "admin"), jobs: allJobs, live: live.pos, workshop: live.workshop, today: today(), excludeId: job?.id }) : []), [f.geo, f.date, f.time, f.duration, allJobs, live, job?.id]);
  const toggle = (id) => set("assigneeIds", f.assigneeIds.includes(id) ? f.assigneeIds.filter((x) => x !== id) : [...f.assigneeIds, id]);

  async function save(extra = {}) {
    setBusy(true); setErr("");
    try {
      const body = { ...f, orderId: f.orderId || null, time: f.time || null, ...extra };
      if (job) await updateJob(job.id, body); else await createJob(body);
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await deleteJob(job.id); onSaved(); } catch (e) { setErr(e.message); setBusy(false); }
  }
  const inp = getInputStyle();
  return (
    <Modal title={job ? "Vazifa" : "Yangi vazifa"} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="job-form">
        <div role="group" aria-label="Turi" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["measure", "install", "deliver", "other"].map((k) => {
            const K = JOB_KINDS[k]; const on = f.kind === k;
            return (
              <button key={k} type="button" onClick={() => setF((x) => ({ ...x, kind: k, duration: x.duration === DURATION[x.kind] ? DURATION[k] : x.duration }))} aria-pressed={on} data-kind={k}
                style={{ flex: 1, minWidth: 92, height: 40, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  border: `1.5px solid ${on ? K.c : THEME.border}`, background: on ? K.c + "14" : THEME.card, color: on ? K.c : THEME.text }}>
                <K.I size={15} />{K.l}
              </button>
            );
          })}
        </div>
        {f.leadId && <div data-testid="job-lead" style={{ fontSize: 12.5, color: THEME.muted }}>CRM lidi bilan bog'langan — o'lchov bajarilsa, lid «Smeta» bosqichiga o'tadi.</div>}
        <Field label="Buyurtma (ixtiyoriy)">
          <select value={f.orderId} onChange={(e) => set("orderId", e.target.value)} style={inp} data-testid="job-order">
            <option value="">— Buyurtmasiz (masalan, yangi mijoz o'lchovi)</option>
            {openOrders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} · {o.customer}{o.title ? ` · ${o.title}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Nomi">
          <input value={f.title} onChange={(e) => set("title", e.target.value)} style={inp} placeholder={f.orderId ? "Bo'sh qolsa — buyurtma nomi" : "Masalan: Yunusobod, yangi mijoz — o'lchov"} data-testid="job-title" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Sana"><input type="date" value={f.date || ""} onChange={(e) => set("date", e.target.value)} style={inp} data-testid="job-date" /></Field>
          <Field label="Vaqt"><input type="time" value={f.time || ""} onChange={(e) => set("time", e.target.value)} style={inp} data-testid="job-time" /></Field>
        </div>
        <Field label="Taxminiy davomiyligi">
          <select value={f.duration} onChange={(e) => set("duration", Number(e.target.value))} style={inp} data-testid="job-duration">
            {[30, 40, 60, 90, 120, 180, 240, 360, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} daqiqa` : `${m / 60} soat`}</option>)}
          </select>
        </Field>
        <Field label="Manzil"><input value={f.address} onChange={(e) => set("address", e.target.value)} style={inp} placeholder="Chilonzor 9, 12-uy" data-testid="job-address" /></Field>
        <Field label="Telefon (mijoz)"><input value={f.phone} onChange={(e) => set("phone", e.target.value)} style={inp} placeholder="+998 90 123 45 67" inputMode="tel" /></Field>
        {line === "all" && !f.orderId && !f.leadId && (
          <Field label="Yo'nalish">
            <div style={{ display: "flex", gap: 6 }}>
              {["UVIXPRINT", "UVONYX"].map((l) => (
                <button key={l} type="button" onClick={() => set("line", l)} aria-pressed={f.line === l} style={{ flex: 1, height: 36, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, border: `1.5px solid ${f.line === l ? THEME.text : THEME.border}`, background: THEME.card, color: THEME.text }}>{l}</button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Joyi xaritada (ixtiyoriy — eng yaqin xodim va yo'l uchun)">
          <GeoField value={f.geo} onChange={(g) => set("geo", g)} address={f.address} />
        </Field>
        {recs.length > 0 && <Recommend recs={recs} chosen={f.assigneeIds} onToggle={toggle} />}
        <Field label="Mas'ul (bir yoki bir nechta)">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-testid="job-people">
            {people.map((e) => {
              const on = f.assigneeIds.includes(e.id);
              return (
                <button key={e.id} type="button" onClick={() => toggle(e.id)} aria-pressed={on} data-person={e.id}
                  style={{ height: 34, padding: "0 12px", borderRadius: 17, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, border: `1px solid ${on ? THEME.violet : THEME.border2}`, background: on ? THEME.violet : THEME.card, color: on ? THEME.onPrimary || "#fff" : THEME.text }}>
                  {on ? "✓ " : ""}{e.name}
                </button>
              );
            })}
          </div>
        </Field>
        {fieldsFor(config, f.kind).map((cf) => (
          <Field key={cf.id} label={<span>{cf.name} <span style={{ color: THEME.blue }}>✦</span></span>}>
            <CustomInput f={cf} value={f.custom[cf.id] ?? (cf.type === "check" ? false : "")} employees={employees} style={{ height: 40, border: `1px solid ${THEME.border2}` }}
              onChange={(v) => set("custom", { ...f.custom, [cf.id]: v })} />
          </Field>
        ))}
        <Field label="Izoh"><textarea value={f.note} onChange={(e) => set("note", e.target.value)} style={{ ...inp, minHeight: 60, resize: "vertical" }} /></Field>
        {job && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} data-testid="job-status">
            <span style={{ fontSize: 12.5, color: THEME.muted }}>Holat:</span>
            {["new", "doing", "done", "cancelled"].map((s) => (
              <button key={s} type="button" onClick={() => save({ status: s })} disabled={busy} aria-pressed={job.status === s} data-status={s}
                style={{ height: 32, padding: "0 12px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, border: `1px solid ${job.status === s ? THEME.text : THEME.border2}`, background: job.status === s ? THEME.text : THEME.card, color: job.status === s ? THEME.card : THEME.text }}>
                {STATUS[s]}
              </button>
            ))}
          </div>
        )}
        {err && <div style={{ color: THEME.rose, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {job && <button type="button" onClick={() => setDel(true)} style={{ border: 0, background: "none", color: THEME.rose, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontFamily: "inherit" }}><Trash2 size={14} /> O'chirish</button>}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={() => save()} disabled={busy} data-testid="job-save">Saqlash</Button>
        </div>
      </div>
      {del && <ConfirmDialog message="Vazifa o'chirilsinmi?" onCancel={() => setDel(false)} onConfirm={remove} />}
    </Modal>
  );
}


const hm2 = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
// Menejerga bitta tavsiya: shu vaqtda bo'sh va eng yaqin xodim — bir bosishda «Berish»
function Recommend({ recs, chosen, onToggle }) {
  const [best, ...rest] = recs;
  const line = (r) => `${r.km != null ? fmtKm(r.km) : "masofa noma'lum"} · ${r.busy ? "band" : `${hm2(r.freeFrom)}–${hm2(r.freeTo)} bo'sh`}`;
  const on = chosen.includes(best.p.id);
  return (
    <div data-testid="job-recommend" style={{ border: `1.5px solid #0E7C6B`, boxShadow: "0 0 0 3px #0E7C6B1A", borderRadius: 14, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, color: "#0B5F52", display: "flex", alignItems: "center", gap: 5 }}><Sparkles size={13} /> TAVSIYA · ENG YAQIN VA BO'SH</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar id={best.p.id} name={best.p.name} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{best.p.name}</b><div style={{ fontSize: 12.5, color: THEME.muted }} data-rec-best={best.p.id}>{line(best)}{best.from === "live" ? " · hozirgi joyidan" : best.from === "job" ? " · oldingi ishidan" : best.from === "workshop" ? " · sexdan" : ""}</div></div>
        <button type="button" onClick={() => onToggle(best.p.id)} aria-pressed={on} data-testid="rec-give"
          style={{ height: 34, padding: "0 14px", borderRadius: 10, border: 0, background: on ? THEME.greenSolid : "#0E7C6B", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>{on ? "✓ Berildi" : "Berish"}</button>
      </div>
      {rest.slice(0, 3).map((r) => (
        <div key={r.p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: r.busy ? THEME.dim : THEME.text }}>
          <Avatar id={r.p.id} name={r.p.name} size={24} /><b style={{ fontWeight: 600 }}>{r.p.name.split(" ")[0]}</b><span style={{ color: THEME.muted }}>{line(r)}</span>
        </div>
      ))}
    </div>
  );
}
