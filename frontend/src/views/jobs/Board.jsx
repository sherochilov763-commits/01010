// Board.jsx — «Doska»: holat bo'yicha ustunlar (Yangi · mas'ulsiz → Rejalashtirilgan → Jarayonda → Bajarildi).
// Kompyuterda kartani sudrab holatni o'zgartirish; telefonda ustunlar o'rniga yorliqlar va «← Rejaga / Bajarildi →» tugmalari.
// «Guruhlash»: holat (sudrash ishlaydi) / tur / mas'ul / yo'nalish (faqat ko'rish).
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarPlus, Camera, MapPin, MessageSquare, Play, UserPlus, Zap } from "lucide-react";
import { LineTag } from "../../components/LineSwitcher.jsx";
import { THEME } from "../../theme.js";
import { Avatars, KindBadge } from "./JobParts.jsx";
import { JOB_KINDS, byWhen, isLate, mondayOf, today, whenText } from "./jobsLib.js";

export const BOARD_COLS = [
  { k: "new", l: "Yangi · mas'ulsiz", short: "Yangi", dot: "#A1A1AA" },
  { k: "planned", l: "Rejalashtirilgan", short: "Rejada", dot: "#1F5FD6" },
  { k: "doing", l: "Jarayonda", short: "Jarayonda", dot: "#D97706" },
  { k: "done", l: "Bajarildi · bu hafta", short: "Bajarildi", dot: "#15803D" },
];
export function boardCol(j, mon = mondayOf(today())) {
  if (j.status === "cancelled") return null;
  if (j.status === "done") return String(j.doneAt || j.date || "").slice(0, 10) >= mon ? "done" : null;
  if (j.status === "doing") return "doing";
  return (j.assigneeIds || []).length && j.date ? "planned" : "new";
}

export function Board({ list, isMobile, showLine, canManage, employees, onOpen, onPatch, onDone, onPlan }) {
  const [groupBy, setGroupBy] = useState(() => { try { return localStorage.getItem("uvix_board_group") || "status"; } catch { return "status"; } });
  const [mcol, setMcol] = useState(null);
  const [over, setOver] = useState(null);
  const [drag, setDrag] = useState(null);
  const [more, setMore] = useState(false);
  const setG = (g) => { setGroupBy(g); try { localStorage.setItem("uvix_board_group", g); } catch { /* */ } };

  const cols = useMemo(() => {
    const mon = mondayOf(today());
    if (groupBy === "status") return BOARD_COLS.map((c) => ({ ...c, items: list.filter((j) => boardCol(j, mon) === c.k).sort(c.k === "done" ? (a, b) => String(b.doneAt || "").localeCompare(String(a.doneAt || "")) : byWhen) }));
    const open = list.filter((j) => boardCol(j, mon) && j.status !== "done");
    if (groupBy === "kind") return Object.entries(JOB_KINDS).map(([k, K]) => ({ k, l: K.l, dot: K.c, items: open.filter((j) => j.kind === k).sort(byWhen) })).filter((c) => c.items.length);
    if (groupBy === "line") return ["UVIXPRINT", "UVONYX"].map((k) => ({ k, l: k, dot: k === "UVONYX" ? "#0E7C6B" : "#1F5FD6", items: open.filter((j) => j.line === k).sort(byWhen) }));
    const ppl = [...new Map(open.flatMap((j) => j.assignees || []).map((a) => [a.id, a])).values()];
    return [{ k: "none", l: "Mas'ulsiz", dot: "#A1A1AA", items: open.filter((j) => !(j.assigneeIds || []).length).sort(byWhen) },
      ...ppl.map((a) => ({ k: a.id, l: a.name, dot: "#6D28D9", items: open.filter((j) => (j.assigneeIds || []).includes(a.id)).sort(byWhen) }))];
  }, [list, groupBy]);
  const dnd = groupBy === "status" && canManage && !isMobile;

  function dropTo(col, j) {
    if (!j || j.ro || boardCol(j) === col) return;
    if (col === "done") return onDone(j);
    if (col === "doing") return onPatch(j, { status: "doing" });
    if (col === "planned") {
      if (!(j.assigneeIds || []).length || !j.date) return onPlan(j);
      return onPatch(j, { status: "new" });
    }
    if (col === "new") return onPatch(j, { status: "new", ...(j.status === "new" ? { assigneeIds: [] } : {}) });
  }
  const sel = { height: 34, borderRadius: 10, border: `1px dashed ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 13.5, padding: "0 10px", cursor: "pointer" };

  if (isMobile) {
    const active = mcol || (cols.find((c) => c.k === "doing")?.items.length ? "doing" : cols[0]?.k);
    const c = cols.find((x) => x.k === active) || cols[0];
    return (
      <div data-testid="jobs-board">
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10 }} className="uvix-scroll">
          {cols.map((x) => {
            const on = x.k === c?.k;
            return <button key={x.k} type="button" onClick={() => setMcol(x.k)} aria-pressed={on} data-board-tab={x.k}
              style={{ height: 36, padding: "0 14px", borderRadius: 18, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, border: `1.5px solid ${on ? THEME.text : THEME.border}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : THEME.text }}>
              {x.short || x.l} <span style={{ opacity: 0.6 }}>{x.items.length}</span></button>;
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-board-col={c?.k}>
          {!c?.items.length && <div style={{ color: THEME.muted, fontSize: 14, textAlign: "center", padding: 22, border: `1.5px dashed ${THEME.border}`, borderRadius: 14 }}>Bu yerda ish yo'q</div>}
          {c?.items.map((j) => (
            <BoardCard key={j.id} j={j} showLine={showLine} onOpen={onOpen} footer={!j.ro && canManage && groupBy === "status" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                {c.k === "new" && <button type="button" style={mBtn(false)} onClick={() => onPlan(j)}><UserPlus size={15} /> Biriktirish</button>}
                {c.k === "planned" && <button type="button" style={mBtn(true, "#0E7C6B")} onClick={() => onPatch(j, { status: "doing" })} data-board-next={j.id}>Boshlash <ArrowRight size={15} /></button>}
                {c.k === "doing" && <><button type="button" style={mBtn(false)} onClick={() => onPatch(j, { status: "new" })} data-board-back={j.id}><ArrowLeft size={15} /> Rejaga</button>
                  <button type="button" style={mBtn(true, THEME.greenSolid)} onClick={() => onDone(j)} data-board-next={j.id}>Bajarildi <ArrowRight size={15} /></button></>}
              </div>
            )} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="jobs-board">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <select value={groupBy} onChange={(e) => setG(e.target.value)} style={sel} aria-label="Guruhlash" data-testid="board-group">
          <option value="status">Guruhlash: holat bo'yicha</option><option value="kind">Guruhlash: tur bo'yicha</option>
          <option value="person">Guruhlash: mas'ul bo'yicha</option><option value="line">Guruhlash: yo'nalish bo'yicha</option>
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(250px, 1fr))`, gap: 12, overflowX: "auto", paddingBottom: 6, alignItems: "start" }} className="uvix-scroll">
        {cols.map((c) => {
          const items = c.k === "done" && !more ? c.items.slice(0, 5) : c.items;
          return (
            <div key={c.k} data-board-col={c.k}
              onDragOver={dnd ? (e) => { e.preventDefault(); setOver(c.k); } : undefined} onDragLeave={dnd ? () => setOver(null) : undefined}
              onDrop={dnd ? (e) => { e.preventDefault(); setOver(null); dropTo(c.k, drag); setDrag(null); } : undefined}
              style={{ background: over === c.k ? THEME.blueBg : THEME.chip, borderRadius: 16, padding: 10, minHeight: 360, outline: over === c.k ? `2px dashed ${THEME.blue}` : "none", transition: "background .12s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px 10px" }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: c.dot }} />
                <b style={{ fontSize: 14.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.l}</b>
                <span style={{ fontSize: 12.5, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: THEME.card, color: THEME.muted }}>{c.items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((j) => (
                  <BoardCard key={j.id} j={j} showLine={showLine} onOpen={onOpen} draggable={dnd && !j.ro} dragging={drag?.id === j.id}
                    onDragStart={() => setDrag(j)} onDragEnd={() => { setDrag(null); setOver(null); }}
                    footer={c.k === "new" && canManage && !j.ro && groupBy === "status" ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onPlan(j); }} style={{ ...chipBtn, marginLeft: "auto" }} data-board-plan={j.id}>
                        {(j.assigneeIds || []).length ? <><CalendarPlus size={14} /> Sana</> : <><UserPlus size={14} /> Biriktirish</>}
                      </button>) : c.k === "planned" && canManage && !j.ro ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onPatch(j, { status: "doing" }); }} style={{ ...chipBtn, marginLeft: "auto" }} aria-label="Boshlash"><Play size={13} /></button>) : null} />
                ))}
                {c.k === "done" && c.items.length > 5 && !more && <button type="button" onClick={() => setMore(true)} style={{ height: 40, borderRadius: 12, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.muted, fontFamily: "inherit", fontSize: 13.5, cursor: "pointer" }}>Yana {c.items.length - 5} tasi →</button>}
                {c.k === "new" && canManage && groupBy === "status" && <button type="button" onClick={() => onPlan(null)} data-testid="board-add" style={{ height: 42, borderRadius: 12, border: `1.5px dashed ${THEME.border2}`, background: "transparent", color: THEME.muted, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>+ Vazifa qo'shish</button>}
                {!items.length && c.k !== "new" && <div style={{ fontSize: 12.5, color: THEME.dim, textAlign: "center", padding: "16px 6px" }}>{dnd ? "kartani shu yerga sudrang" : "bo'sh"}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const chipBtn = { height: 30, padding: "0 10px", borderRadius: 9, border: `1px dashed ${THEME.border2}`, background: THEME.card, color: THEME.text, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" };
const mBtn = (primary, bg) => ({ flex: 1, height: 42, borderRadius: 11, border: primary ? 0 : `1px solid ${THEME.border2}`, background: primary ? bg : THEME.card, color: primary ? "#fff" : THEME.text, fontFamily: "inherit", fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" });

function BoardCard({ j, showLine, onOpen, footer, draggable, dragging, onDragStart, onDragEnd }) {
  const k = JOB_KINDS[j.kind] || JOB_KINDS.other;
  const late = isLate(j);
  const comments = (j.log || []).filter((l) => String(l.text).startsWith("💬")).length;
  const cl = j.checklist || [];
  return (
    <div data-board-card={j.id} onClick={() => !j.ro && onOpen(j)} draggable={draggable} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", j.id); } catch { /* */ } onDragStart?.(); }} onDragEnd={onDragEnd}
      style={{ background: THEME.card, border: `1px solid ${late ? THEME.roseBorder : THEME.border}`, borderLeft: `4px solid ${k.c}`, borderRadius: 13, padding: "10px 12px", cursor: j.ro ? "default" : draggable ? "grab" : "pointer", opacity: dragging ? 0.45 : j.status === "done" ? 0.75 : 1, boxShadow: THEME.shadowSm }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><KindBadge kind={j.kind} small />{showLine && j.line && <LineTag line={j.line} />}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, marginTop: 7 }}>{j.title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 5, fontSize: 12.5, color: THEME.muted }}>
        {j.address && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><MapPin size={13} />{j.address}</span>}
        {j.auto && j.status === "new" && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Zap size={13} />avtomatik · buyurtma «Tayyor»</span>}
        {(cl.length > 0 || comments > 0 || j.photos?.length > 0) && (
          <span style={{ display: "inline-flex", gap: 10 }}>
            {cl.length > 0 && <span>☑ {cl.filter((c) => c.done).length}/{cl.length}</span>}
            {j.photos?.length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Camera size={12} />{j.photos.length}</span>}
            {comments > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><MessageSquare size={12} />{comments}</span>}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: late ? THEME.rose : j.date ? THEME.text : THEME.dim }}>{whenText(j)}</span>
        <div style={{ flex: 1 }} />
        {footer || <Avatars list={j.assignees} size={26} />}
      </div>
      {footer && j.assignees?.length > 0 && <div style={{ marginTop: 6 }}><Avatars list={j.assignees} size={24} /></div>}
    </div>
  );
}
