// JobParts.jsx — Vazifalar bo'limining kichik qismlari: tur belgisi, holat, avatarlar, bo'sh holat.
import { THEME } from "../../theme.js";
import { avatarColor, initials } from "../../auth/LoginScreen.jsx";
import { JOB_KINDS, STATUS, isLate } from "./jobsLib.js";

export function KindBadge({ kind, small, suffix }) {
  const k = JOB_KINDS[kind] || JOB_KINDS.other;
  return (
    <span data-job-kind={kind} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: small ? 20 : 24, padding: small ? "0 6px" : "0 8px", borderRadius: 7, fontSize: small ? 11 : 12, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: k.c, background: k.c + "1A", whiteSpace: "nowrap" }}>
      <k.I size={small ? 12 : 13} />{k.l}{suffix ? <span style={{ fontWeight: 700 }}>· {suffix}</span> : null}
    </span>
  );
}

export function StatusPill({ j, small }) {
  const late = isLate(j);
  const s = late ? "late" : j.status;
  const map = {
    late: [THEME.roseBg, THEME.roseText, "Kechikdi"],
    new: [THEME.chip, THEME.mutedDark || THEME.muted, "Yangi"],
    doing: [THEME.amberBg, THEME.amberText, "Jarayonda"],
    done: [THEME.greenBg, THEME.greenText, "Bajarildi"],
    cancelled: [THEME.chip, THEME.muted, "Bekor"],
  };
  const [bg, fg, l] = map[s] || map.new;
  return (
    <span data-status-pill={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: small ? 22 : 26, padding: "0 10px", borderRadius: 999, background: bg, color: fg, fontSize: small ? 12 : 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
      {s === "doing" || s === "late" ? <span style={{ width: 6, height: 6, borderRadius: 3, background: fg }} /> : null}{l || STATUS[s]}
    </span>
  );
}

export function Avatar({ id, name, size = 28, ring }) {
  const c = avatarColor(id || name || "");
  return (
    <span title={name} style={{ width: size, height: size, borderRadius: "50%", background: c, color: "#fff", display: "inline-grid", placeItems: "center", fontSize: Math.round(size * 0.36), fontWeight: 800, flexShrink: 0, border: `2px solid ${ring || THEME.card}`, boxSizing: "border-box" }}>
      {initials(name || "?")}
    </span>
  );
}
export function Avatars({ list, size = 28, max = 3 }) {
  if (!list?.length) return <span style={{ fontSize: 12.5, color: THEME.amber, fontWeight: 600, whiteSpace: "nowrap" }}>mas'ulsiz</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }} title={list.map((a) => a.name).join(", ")}>
      {list.slice(0, max).map((a, i) => <span key={a.id || i} style={{ marginLeft: i ? -8 : 0 }}><Avatar id={a.id} name={a.name} size={size} /></span>)}
      {list.length > max && <span style={{ marginLeft: 4, fontSize: 12, color: THEME.muted }}>+{list.length - max}</span>}
    </span>
  );
}

// Bo'sh holat — nima uchun bo'sh va nima qilish kerakligini aytadi
export function JobsEmpty({ kind, group, canManage, onAdd, onGo }) {
  const K = JOB_KINDS[kind];
  const btn = (primary) => ({ height: 40, padding: "0 16px", borderRadius: 10, border: primary ? 0 : `1px solid ${THEME.border2}`, background: primary ? (K?.c || THEME.violet) : THEME.card, color: primary ? "#fff" : THEME.text, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 });
  let title = "Hozircha vazifa yo'q", text = "Vazifa — aniq odamga aniq ish: o'lchov, montaj, yetkazish. Tepada bir satrda yozing yoki «+ Vazifa» tugmasini bosing.", steps = null, actions = null;
  if (group === "late") { title = "Kechikkan ish yo'q"; text = "Hamma ish o'z vaqtida — zo'r!"; }
  else if (group === "done") { title = "Hali bajarilgan ish yo'q"; text = "«Bajarildi» belgilangan ishlar shu yerda ko'rinadi."; }
  else if (group) { title = "Bu guruhda ish yo'q"; text = "Boshqa kartani tanlang yoki filtrni olib tashlang."; }
  else if (kind === "measure") {
    title = "Hozircha o'lchov yo'q"; text = "O'lchov vazifasi mijoz uyiga borib o'lchash uchun. U ikki yo'l bilan paydo bo'ladi:";
    steps = [<><b>CRM</b>da lid kartasidagi 📏 tugma — lid «O'lchov» bosqichiga o'tadi</>, <>Shu yerda <b>«+ O'lchov qo'shish»</b> — mijoz, manzil, vaqt, kim boradi</>];
    actions = <>{canManage && <button type="button" style={btn(true)} onClick={() => onAdd?.("measure")} data-testid="empty-add">+ O'lchov qo'shish</button>}{onGo && <button type="button" style={btn(false)} onClick={() => onGo("crm")}>CRM'ga o'tish</button>}</>;
  } else if (kind === "install" || kind === "deliver") {
    title = `Hozircha ${K.l.toLowerCase()} yo'q`; text = "Buyurtma «Tayyor» bo'lganda o'zi paydo bo'ladi: UVONYX — montaj, UVIXPRINT — yetkazish. Mas'ulni menejer tayinlaydi.";
    actions = canManage ? <button type="button" style={btn(true)} onClick={() => onAdd?.(kind)} data-testid="empty-add">+ {K.l} qo'shish</button> : null;
  } else if (kind === "print" || kind === "design") {
    title = `Ochiq ${K.l.toLowerCase()} ishi yo'q`; text = `${K.l} vazifasi buyurtma ichida beriladi — «Buyurtmalar»da buyurtmani ochib, ${K.l.toLowerCase()}chini tanlang.`;
    actions = onGo ? <button type="button" style={btn(false)} onClick={() => onGo("orders")}>Buyurtmalarga o'tish</button> : null;
  } else if (canManage) {
    actions = <button type="button" style={btn(true)} onClick={() => onAdd?.("measure")} data-testid="empty-add">+ Vazifa qo'shish</button>;
  }
  const I = K?.I;
  return (
    <div data-testid="jobs-empty" style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
      {I && <span style={{ width: 44, height: 44, borderRadius: 12, background: K.c + "1A", color: K.c, display: "grid", placeItems: "center" }}><I size={22} /></span>}
      <b style={{ fontSize: 17 }}>{title}</b>
      <div style={{ fontSize: 14, color: THEME.muted, lineHeight: 1.5 }}>{text}</div>
      {steps && <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>{actions}</div>}
    </div>
  );
}
