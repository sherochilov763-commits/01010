// JobsSettings.jsx — ⚙️ «Bo'limni sozlash» (Bitrix24 uslubi): ko'rinishlar, kartalar, ustunlar, filtrlar.
// Yoqish/o'chirish va sudrab tartiblash; «+ Ustun qo'shish» — 3 qadam; doska holatlari; «Faqat menga / Hamma uchun».
// Telefonda — atigi bir nechta tugma, murakkab sozlama kompyuterda.
import { useState } from "react";
import { Archive, CalendarDays, Check, CheckSquare, GripVertical, Hash, List as ListIcon, Lock, Monitor, Pencil, RotateCcw, Settings, Type, User, X } from "lucide-react";
import { Modal } from "../../components/ui.jsx";
import { useBackToClose } from "../../lib/history.js";
import { THEME } from "../../theme.js";
import { CARD_DEFS, FIELD_TYPES, VIEW_DEFS, colDefs, filterDefs } from "./jobsPrefs.js";
import { FIELD_KINDS, JOB_KINDS } from "./jobsLib.js";

const TYPE_ICON = { text: Type, number: Hash, date: CalendarDays, select: ListIcon, check: CheckSquare, person: User };

function Toggle({ on, onChange, label, testid }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} data-toggle={testid}
      style={{ width: 46, height: 26, borderRadius: 13, border: 0, padding: 3, background: on ? THEME.blueSolid || THEME.blue : THEME.border2, cursor: "pointer", flexShrink: 0, transition: "background .15s" }}>
      <span style={{ display: "block", width: 20, height: 20, borderRadius: 10, background: "#fff", transform: `translateX(${on ? 20 : 0}px)`, transition: "transform .15s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
    </button>
  );
}

// Sudrab tartiblanadigan ro'yxat
function SortList({ items, defs, onChange, locked, extra, testid }) {
  const [dragK, setDragK] = useState(null);
  const label = (k) => defs.find((d) => d[0] === k)?.[1] || k;
  const move = (from, to) => { if (from === to) return; const a = [...items]; const i = a.findIndex((x) => x.k === from), t = a.findIndex((x) => x.k === to); const [x] = a.splice(i, 1); a.splice(t, 0, x); onChange(a); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-sortlist={testid}>
      {locked && <div style={{ ...rowSt, background: THEME.chip }}><Lock size={15} style={{ color: THEME.muted }} /><span style={{ flex: 1 }}>{locked}</span><span style={{ fontSize: 12.5, color: THEME.muted }}>doim</span></div>}
      {items.map((x) => (
        <div key={x.k} draggable onDragStart={() => setDragK(x.k)} onDragOver={(e) => e.preventDefault()} onDrop={() => { move(dragK, x.k); setDragK(null); }} onDragEnd={() => setDragK(null)}
          data-pref-row={x.k} style={{ ...rowSt, opacity: dragK === x.k ? 0.4 : 1, background: x.on ? (x.k.startsWith("f:") ? THEME.blueBg : THEME.card) : THEME.chip }}>
          <GripVertical size={16} style={{ color: THEME.dim, cursor: "grab", flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, color: x.on ? THEME.text : THEME.muted }}>{label(x.k)}{x.k.startsWith("f:") && <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 700, color: THEME.blue, background: THEME.card, borderRadius: 6, padding: "1px 6px" }}>o'zim qo'shgan</span>}{x.k === "list" && <span style={{ fontSize: 12, color: THEME.dim }}> · standart</span>}</span>
          {extra?.(x)}
          <Toggle on={x.on} label={label(x.k)} testid={`${testid}:${x.k}`} onChange={(on) => onChange(items.map((y) => (y.k === x.k ? { ...y, on } : y)))} />
        </div>
      ))}
    </div>
  );
}
const rowSt = { display: "flex", alignItems: "center", gap: 10, minHeight: 46, padding: "0 12px", border: `1px solid ${THEME.border}`, borderRadius: 12, fontSize: 14 };
const sec = (t) => <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: THEME.muted, margin: "18px 0 8px" }}>{t}</div>;

export function JobsSettings({ prefs, setPrefs, config, canConfig, scope, setScope, onSaveConfig, onReset, isMobile, onClose }) {
  const [tab, setTab] = useState("view");
  const [field, setField] = useState(null);
  const [stageName, setStageName] = useState("");
  useBackToClose(true, onClose);
  const up = (patch) => setPrefs({ ...prefs, ...patch });
  const fields = config.fields || [];
  const archived = fields.filter((f) => f.archived);

  if (isMobile) {
    return (
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 270, background: "rgba(9,9,11,0.38)", display: "flex", alignItems: "flex-end" }}>
        <div onClick={(e) => e.stopPropagation()} data-testid="jobs-settings" style={{ width: "100%", maxHeight: "86vh", overflowY: "auto", background: THEME.card, color: THEME.text, borderRadius: "20px 20px 0 0", padding: "8px 18px calc(18px + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: THEME.border2, margin: "4px auto 12px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 800 }}><Settings size={19} /> Sozlash</div>
          {sec("Ko'rinishlar")}
          <SortList items={prefs.views} defs={VIEW_DEFS} onChange={(views) => up({ views: views.some((v) => v.on) ? views : prefs.views })} testid="views" />
          {sec("Boshqa")}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={rowSt}><span style={{ flex: 1 }}>Faqat mening ishlarim</span><Toggle on={prefs.mine} onChange={(v) => up({ mine: v })} label="Faqat mening ishlarim" testid="mine" /></div>
            <div style={rowSt}><span style={{ flex: 1 }}>Bajarilganlarni ko'rsatish</span><Toggle on={prefs.showDone} onChange={(v) => up({ showDone: v })} label="Bajarilganlarni ko'rsatish" testid="showDone" /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "10px 12px", background: THEME.chip, borderRadius: 12, fontSize: 13, color: THEME.muted }}><Monitor size={16} /> Ustun qo'shish va tartib — kompyuterda</div>
        </div>
      </div>
    );
  }

  return (
    <aside data-testid="jobs-settings" aria-label="Bo'limni sozlash" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 440, zIndex: 265, background: THEME.card, color: THEME.text, borderLeft: `1px solid ${THEME.border}`, boxShadow: THEME.shadowLg, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${THEME.border}` }}>
        <Settings size={19} /><b style={{ fontSize: 17, flex: 1 }}>Bo'limni sozlash</b>
        <button type="button" onClick={onClose} aria-label="Yopish" data-testid="settings-close" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.text, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div style={{ display: "flex", gap: 6, padding: "12px 20px 0" }}>
        {[["view", "Ko'rinish"], ["cols", "Ustunlar"], ["filters", "Filtrlar"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-settings-tab={k}
            style={{ height: 36, padding: "0 14px", borderRadius: 10, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, background: tab === k ? THEME.text : "transparent", color: tab === k ? THEME.card : THEME.text }}>{l}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 16px" }}>
        {tab === "view" && <>
          {sec("Ko'rinishlar")}
          <SortList items={prefs.views} defs={VIEW_DEFS} onChange={(views) => up({ views: views.some((v) => v.on) ? views : prefs.views })} testid="views" />
          {sec("Tepadagi kartalar")}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {prefs.cards.map((c) => {
              const l = CARD_DEFS.find((d) => d[0] === c.k)?.[1];
              return <button key={c.k} type="button" aria-pressed={c.on} data-card-toggle={c.k} onClick={() => up({ cards: prefs.cards.map((x) => (x.k === c.k ? { ...x, on: !x.on } : x)) })}
                style={{ height: 34, padding: "0 12px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, border: `1.5px solid ${c.on ? THEME.text : THEME.border2}`, background: c.on ? THEME.text : THEME.card, color: c.on ? THEME.card : THEME.text }}>{c.on ? "✓ " : ""}{l}</button>;
            })}
          </div>
          {sec("Boshqa")}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={rowSt}><span style={{ flex: 1 }}>Bajarilganlarni ko'rsatish</span><Toggle on={prefs.showDone} onChange={(v) => up({ showDone: v })} label="Bajarilganlarni ko'rsatish" testid="showDone" /></div>
            <div style={rowSt}><span style={{ flex: 1 }}>Ixcham qatorlar</span><Toggle on={prefs.compact} onChange={(v) => up({ compact: v })} label="Ixcham qatorlar" testid="compact" /></div>
            <div style={rowSt}><span style={{ flex: 1 }}>Ochilganda — faqat mening ishlarim</span><Toggle on={prefs.mine} onChange={(v) => up({ mine: v })} label="Faqat mening ishlarim" testid="mine" /></div>
          </div>
        </>}
        {tab === "cols" && <>
          {sec("Ro'yxat ustunlari")}
          <SortList items={prefs.columns} defs={colDefs(config)} locked="Vazifa nomi" onChange={(columns) => up({ columns })} testid="cols"
            extra={(x) => x.k.startsWith("f:") && canConfig ? (
              <span style={{ display: "inline-flex", gap: 4 }}>
                <button type="button" aria-label="Tahrirlash" data-field-edit={x.k.slice(2)} onClick={() => setField(fields.find((f) => f.id === x.k.slice(2)))} style={smallBtn}><Pencil size={14} /></button>
                <button type="button" aria-label="Yashirish (ma'lumot qoladi)" title="O'chirish — ma'lumot yo'qolmaydi, yashiriladi" data-field-archive={x.k.slice(2)} onClick={() => onSaveConfig({ fields: fields.map((f) => (f.id === x.k.slice(2) ? { ...f, archived: true } : f)) })} style={smallBtn}><Archive size={14} /></button>
              </span>) : null} />
          {canConfig
            ? <button type="button" onClick={() => setField({})} data-testid="field-add" style={{ width: "100%", height: 46, marginTop: 8, borderRadius: 12, border: `1.5px dashed ${THEME.blue}`, background: THEME.blueBg, color: THEME.blue, fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>+ Ustun qo'shish</button>
            : <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 8 }}>Yangi ustunni rahbar yoki katta menejer qo'shadi</div>}
          {archived.length > 0 && canConfig && <>
            {sec("Yashirilgan ustunlar (ma'lumot saqlangan)")}
            {archived.map((f) => <div key={f.id} style={{ ...rowSt, marginBottom: 6, background: THEME.chip }}><span style={{ flex: 1, color: THEME.muted }}>{f.name}</span>
              <button type="button" onClick={() => onSaveConfig({ fields: fields.map((x) => (x.id === f.id ? { ...x, archived: false } : x)) })} style={{ ...smallBtn, width: "auto", padding: "0 10px", gap: 5, display: "inline-flex", alignItems: "center", fontFamily: "inherit", fontSize: 12.5 }}><RotateCcw size={13} /> Qaytarish</button></div>)}
          </>}
          {sec("Doska ustunlari (holatlar)")}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} data-testid="stages">
            {[["Yangi", THEME.chip, THEME.text], ["Rejalashtirilgan", THEME.blueBg, THEME.blueText], ["Jarayonda", THEME.amberBg, THEME.amberText]].map(([l, bg, c]) => <span key={l} style={{ ...stageSt, background: bg, color: c }}>{l}</span>)}
            {(config.stages || []).map((s) => (
              <span key={s.id} style={{ ...stageSt, background: s.color + "1F", color: s.color }} data-stage={s.id}>{s.name}
                {canConfig && <button type="button" aria-label={`${s.name} — o'chirish`} onClick={() => onSaveConfig({ stages: config.stages.filter((x) => x.id !== s.id) })} style={{ border: 0, background: "none", color: "inherit", cursor: "pointer", padding: 0, display: "grid" }}><X size={13} /></button>}</span>
            ))}
            <span style={{ ...stageSt, background: THEME.greenBg, color: THEME.greenText }}>Bajarildi</span>
            {canConfig && (
              <form onSubmit={(e) => { e.preventDefault(); const n = stageName.trim(); if (!n) return; setStageName(""); onSaveConfig({ stages: [...(config.stages || []), { name: n, color: ["#BE185D", "#7C3AED", "#0E7490", "#C2410C"][(config.stages || []).length % 4] }] }); }} style={{ display: "inline-flex" }}>
                <input value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="+ holat" data-testid="stage-new" style={{ ...stageSt, width: 120, border: `1.5px dashed ${THEME.blue}`, background: THEME.card, color: THEME.text, outline: "none", fontFamily: "inherit" }} />
              </form>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 8, lineHeight: 1.45 }}>Qo'shilgan holat «Jarayonda» bilan «Bajarildi» orasida ustun bo'ladi (masalan, «Mijoz tasdig'i»).</div>
        </>}
        {tab === "filters" && <>
          {sec("Filtrlar paneli")}
          <SortList items={prefs.filters} defs={filterDefs(config)} onChange={(filters) => up({ filters })} testid="filters" />
          <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 8 }}>O'z ustuningiz (Tanlov, Belgi, Xodim turidagi) bo'yicha ham filtr qo'shish mumkin.</div>
        </>}
      </div>
      <div style={{ borderTop: `1px solid ${THEME.border}`, padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[["me", "Faqat menga", ""], ["all", "Hamma uchun", "(rahbar)"]].map(([k, l, h]) => {
            const on = scope === k; const dis = k === "all" && !canConfig;
            return <button key={k} type="button" disabled={dis} onClick={() => setScope(k)} aria-pressed={on} data-scope={k}
              style={{ flex: 1, height: 44, borderRadius: 12, cursor: dis ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: dis ? 0.5 : 1,
                border: `1.5px solid ${on ? THEME.blue : THEME.border2}`, background: on ? THEME.blueBg : THEME.card, color: THEME.text }}>
              <span style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${on ? THEME.blue : THEME.border2}`, display: "grid", placeItems: "center" }}>{on && <span style={{ width: 8, height: 8, borderRadius: 4, background: THEME.blue }} />}</span>
              {l} <span style={{ fontWeight: 500, color: THEME.muted, fontSize: 12 }}>{h}</span></button>;
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: THEME.muted }}>
          <span><Check size={13} style={{ verticalAlign: -2 }} /> o'zi saqlanadi{scope === "all" ? " — hamma xodimga" : ""}</span>
          <button type="button" onClick={onReset} data-testid="prefs-reset" style={{ border: 0, background: "none", color: THEME.blue, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}><RotateCcw size={13} /> Standartga qaytarish</button>
        </div>
      </div>
      {field && <FieldDialog field={field.id ? field : null} onClose={() => setField(null)} onSave={(f) => { onSaveConfig({ fields: field.id ? fields.map((x) => (x.id === field.id ? { ...x, ...f } : x)) : [...fields, f] }); setField(null); }} />}
    </aside>
  );
}
const smallBtn = { width: 30, height: 30, borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.muted, display: "grid", placeItems: "center", cursor: "pointer" };
const stageSt = { height: 32, padding: "0 12px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, boxSizing: "border-box" };

// «Yangi ustun»: 1. Nomi  2. Turi  3. Qaysi vazifalarda
function FieldDialog({ field, onClose, onSave }) {
  const [name, setName] = useState(field?.name || "");
  const [type, setType] = useState(field?.type || "text");
  const [opts, setOpts] = useState((field?.options || []).join(", "));
  const [kinds, setKinds] = useState(field?.kinds || []);
  const [err, setErr] = useState("");
  const toggleKind = (k) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  const lab = (t) => <div style={{ fontSize: 14, fontWeight: 700, margin: "14px 0 8px" }}>{t}</div>;
  function save() {
    if (!name.trim()) return setErr("Nomini yozing");
    const options = opts.split(/[,\n/]/).map((x) => x.trim()).filter(Boolean);
    if (type === "select" && options.length < 2) return setErr("Tanlov uchun kamida 2 ta variant yozing (vergul bilan)");
    onSave({ ...(field?.id ? { id: field.id } : {}), name: name.trim(), type, options: type === "select" ? options : [], kinds });
  }
  return (
    <Modal title={field ? "Ustunni tahrirlash" : "Yangi ustun"} onClose={onClose} width={560}>
      <div data-testid="field-dialog">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>1. Nomi</div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Material" data-testid="field-name"
          style={{ width: "100%", boxSizing: "border-box", height: 46, borderRadius: 12, border: `1.5px solid ${THEME.blue}`, padding: "0 14px", fontFamily: "inherit", fontSize: 15, background: THEME.card, color: THEME.text, outline: "none" }} />
        {lab("2. Turi")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {FIELD_TYPES.map(([k, l, ex]) => {
            const I = TYPE_ICON[k]; const on = type === k;
            return <button key={k} type="button" onClick={() => setType(k)} aria-pressed={on} data-field-type={k}
              style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${on ? THEME.blue : THEME.border}`, background: on ? THEME.blueBg : THEME.card, color: THEME.text }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 14.5 }}><I size={16} />{l}</div>
              <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 3 }}>{ex}</div></button>;
          })}
        </div>
        {type === "select" && <input value={opts} onChange={(e) => setOpts(e.target.value)} placeholder="Variantlar: Oniks, Shisha, Akril" data-testid="field-options"
          style={{ width: "100%", boxSizing: "border-box", height: 42, marginTop: 8, borderRadius: 10, border: `1px solid ${THEME.border2}`, padding: "0 12px", fontFamily: "inherit", fontSize: 14, background: THEME.card, color: THEME.text, outline: "none" }} />}
        {lab("3. Qaysi vazifalarda")}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setKinds([])} aria-pressed={!kinds.length} style={kChip(!kinds.length)} data-field-kind="all">Hammasi</button>
          {FIELD_KINDS.map((k) => <button key={k} type="button" onClick={() => toggleKind(k)} aria-pressed={kinds.includes(k)} style={kChip(kinds.includes(k))} data-field-kind={k}>{JOB_KINDS[k].l}</button>)}
        </div>
        {err && <div style={{ color: THEME.rose, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ height: 44, padding: "0 18px", borderRadius: 12, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>Bekor qilish</button>
          <button type="button" onClick={save} data-testid="field-save" style={{ height: 44, padding: "0 22px", borderRadius: 12, border: 0, background: THEME.blueSolid || THEME.blue, color: "#fff", fontFamily: "inherit", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>{field ? "Saqlash" : "Qo'shish"}</button>
        </div>
      </div>
    </Modal>
  );
}
const kChip = (on) => ({ height: 36, padding: "0 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, border: `1.5px solid ${on ? THEME.text : THEME.border2}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : THEME.text });
