// TaskAssignModal.jsx — lidni Dizayn yoki Pechat bosqichiga o'tkazishda mas'ul va vazifa ma'lumotlarini kiritish
import { useState } from "react";
import { FileImage, Printer } from "lucide-react";
import { Button, Field, Modal, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";

const FILE_TYPES = ["CDR", "AI", "PSD", "PDF", "TIFF"];
const QUALITIES = ["720 dpi", "1080 dpi", "1440 dpi"];
const COLOR_PROFILES = ["CMYK", "CMYK + oq", "RGB"];
const MATERIALS = ["Shisha", "Oniks", "Akril", "Banner", "Plyonka", "Kompozit"];

export function TaskAssignModal({ lead, kind, employees, onSave, onCancel }) {
  const isDesign = kind === "design";
  const role = isDesign ? "designer" : "printer";
  const people = (employees || []).filter((e) => e.role === role);
  const printers = (employees || []).filter((e) => e.role === "printer");
  const existing = lead[kind] || {};

  const [f, setF] = useState({
    jobTitle: lead.jobTitle || "",
    assigneeId: existing.assigneeId || (people.length === 1 ? people[0].id : ""),
    deadline: existing.deadline || "",
    notes: existing.notes || "",
    format: existing.format || "",
    fileType: existing.fileType || "CDR",
    quality: existing.quality || "1440 dpi",
    colorProfile: existing.colorProfile || "CMYK",
    material: existing.material || "",
    area: existing.area || "",
    preassignPrinter: lead.print?.assigneeId || "",
  });
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const input = { ...getInputStyle(), boxSizing: "border-box" };

  function submit() {
    if (!f.jobTitle.trim()) return setError("Ish nomini kiriting, masalan \"Fasad lavhasi\"");
    if (!f.assigneeId) return setError(isDesign ? "Dizaynerni tanlang" : "Pechatchini tanlang");
    const fields = isDesign
      ? { format: f.format.trim(), fileType: f.fileType.trim() }
      : { quality: f.quality.trim(), colorProfile: f.colorProfile.trim(), material: f.material.trim(), area: f.area ? Number(String(f.area).replace(",", ".")) || "" : "" };
    onSave({
      jobTitle: f.jobTitle.trim(),
      task: { assigneeId: f.assigneeId, deadline: f.deadline || null, notes: f.notes.trim(), ...fields },
      preassignPrinter: isDesign ? f.preassignPrinter || null : null,
    });
  }

  const Icon = isDesign ? FileImage : Printer;
  return (
    <Modal title={isDesign ? "Dizayn vazifasi" : "Pechat vazifasi"} onClose={onCancel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: THEME.chip, fontSize: 13.5 }}>
          <Icon size={18} color={isDesign ? THEME.blue : THEME.cyan} />
          <span><b>{lead.customer}</b> — {isDesign ? "maket tayyorlash" : "bosma ish"}</span>
        </div>

        {people.length === 0 ? (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: THEME.amberBg, color: THEME.text, fontSize: 13.5, lineHeight: 1.5 }}>
            Hali birorta {isDesign ? "dizayner" : "pechatchi"} yo'q. Avval <b>Xodimlar</b> bo'limida "{isDesign ? "Dizayner" : "Pechatchi"}" rolidagi xodim qo'shing.
          </div>
        ) : (
          <Field label={isDesign ? "Mas'ul dizayner" : "Mas'ul pechatchi"}>
            <select value={f.assigneeId} onChange={set("assigneeId")} style={input}>
              <option value="">— tanlang —</option>
              {people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="Ish nomi">
          <input value={f.jobTitle} onChange={set("jobTitle")} style={input} placeholder="Masalan: Fasad lavhasi" />
        </Field>

        {isDesign ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Format / o'lcham">
              <input value={f.format} onChange={set("format")} style={input} placeholder="3×1.2 m" />
            </Field>
            <Field label="Fayl turi">
              <input value={f.fileType} onChange={set("fileType")} style={input} list="uvix-filetypes" />
              <datalist id="uvix-filetypes">{FILE_TYPES.map((x) => <option key={x} value={x} />)}</datalist>
            </Field>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Sifat">
                <input value={f.quality} onChange={set("quality")} style={input} list="uvix-qualities" />
                <datalist id="uvix-qualities">{QUALITIES.map((x) => <option key={x} value={x} />)}</datalist>
              </Field>
              <Field label="Rang profili">
                <input value={f.colorProfile} onChange={set("colorProfile")} style={input} list="uvix-profiles" />
                <datalist id="uvix-profiles">{COLOR_PROFILES.map((x) => <option key={x} value={x} />)}</datalist>
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Material">
                <input value={f.material} onChange={set("material")} style={input} list="uvix-materials" placeholder="Shisha" />
                <datalist id="uvix-materials">{MATERIALS.map((x) => <option key={x} value={x} />)}</datalist>
              </Field>
              <Field label="Hajmi (kv/m)">
                <input value={f.area} onChange={set("area")} style={input} inputMode="decimal" placeholder="3.6" />
              </Field>
            </div>
          </>
        )}

        <Field label="Muddat">
          <input type="date" value={f.deadline} onChange={set("deadline")} style={input} />
        </Field>
        <Field label="Izoh (ixtiyoriy)">
          <textarea value={f.notes} onChange={set("notes")} rows={2} style={{ ...input, resize: "vertical" }} placeholder={isDesign ? "Mijoz istaklari, ranglar, logotip..." : "Qirqish, laminatsiya, o'rnatish..."} />
        </Field>

        {isDesign && printers.length > 0 && (
          <Field label="Pechatchi (ixtiyoriy, oldindan)">
            <select value={f.preassignPrinter} onChange={set("preassignPrinter")} style={input}>
              <option value="">— dizayn tugagach tanlayman —</option>
              {printers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>Tanlasangiz, maket tayyor bo'lganda ish avtomatik shu pechatchiga tushadi.</div>
          </Field>
        )}

        {error && <div role="alert" style={{ fontSize: 13, color: THEME.rose }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onCancel}>Bekor qilish</Button>
          <Button onClick={submit} disabled={people.length === 0}>Tayinlash</Button>
        </div>
      </div>
    </Modal>
  );
}

// CRM kartochkalarida vazifa holatini ko'rsatish
const STATUS = { new: ["Yangi", "#3B82F6"], in_progress: ["Jarayonda", "#F59E0B"], done: ["Tugallandi", "#10B981"], unassigned: ["Tayinlanmagan", "#EF4444"] };

export function TaskChips({ lead, employees, onOpen, compact }) {
  const rows = [];
  for (const kind of ["design", "print"]) {
    const t = lead[kind];
    if (!t) continue;
    if (!t.status && kind === "print") {
      if (t.assigneeId) rows.push({ kind, name: nameOf(employees, t.assigneeId), st: ["Navbatda", THEME.muted] });
      continue;
    }
    rows.push({ kind, name: t.assigneeId ? nameOf(employees, t.assigneeId) : null, st: STATUS[t.status] || [t.status, THEME.muted] });
  }
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {rows.map((r) => {
        const Icon = r.kind === "design" ? FileImage : Printer;
        const unassigned = !r.name;
        return (
          <button key={r.kind} type="button" onClick={(e) => { e.stopPropagation(); onOpen?.(r.kind); }}
            style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: compact ? "5px 8px" : "7px 10px", borderRadius: 9, cursor: onOpen ? "pointer" : "default",
              border: `1px solid ${unassigned ? THEME.roseBorder : THEME.border}`, background: unassigned ? THEME.roseBg : THEME.chip, color: THEME.text, fontSize: 12, textAlign: "left", minHeight: compact ? 30 : 36 }}>
            <Icon size={13} color={r.kind === "design" ? THEME.blue : THEME.cyan} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
              {unassigned ? (r.kind === "print" ? "Pechatchi tayinlang" : "Dizayner tayinlang") : r.name}
            </span>
            <span style={{ fontWeight: 700, color: r.st[1], whiteSpace: "nowrap" }}>{r.st[0]}</span>
          </button>
        );
      })}
    </div>
  );
}
function nameOf(employees, id) {
  return (employees || []).find((e) => e.id === id)?.name || "Noma'lum xodim";
}
