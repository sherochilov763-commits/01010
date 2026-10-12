// ConvertPanel.jsx — «To'lov va buyurtma»: avans → har pozitsiya alohida buyurtma (bitta guruh), vazifalar, to'lov taqsimoti.
// Yakuniy hisob, raqamlar va yozish serverda bitta amalda bajariladi (POST /api/quotes/convert).
import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button, Field, Modal, MultiPaymentLines, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { fmt, money, todayStr, uid } from "../../lib/format.js";
import { allocate, describeItem, predictNumbers } from "../../lib/production.js";
import { convertQuote } from "../../storage.js";
import { isWorkerRole } from "../../constants.js";

const amountOf = (l) => parseInt(String(l.amountStr || "").replace(/\s/g, ""), 10) || 0;

export function ConvertPanel({ lead, draft, items, salesCfg, employees, allOrders, currentUser, isAdmin, onCancel, onDone }) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const pct = salesCfg?.advancePct || 0;
  const need = Math.ceil((total * pct) / 100);
  const designers = (employees || []).filter((e) => e.role === "designer");
  const printers = (employees || []).filter((e) => e.role === "printer");
  const managers = (employees || []).filter((e) => !isWorkerRole(e.role)).map((e) => e.name);
  const [date, setDate] = useState(todayStr());
  const [line, setLine] = useState(lead?.quote?.subcategory || "UVIXPRINT");
  const [manager, setManager] = useState(draft?.manager || lead?.manager || currentUser?.name || managers[0] || "");
  const [lines, setLines] = useState([{ id: uid(), methodType: "naqd", amountStr: need ? fmt(need) : "" }]);
  const [mode, setMode] = useState("prop");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tasks, setTasks] = useState(() => Object.fromEntries(items.map((it) => [it.id, { mode: designers.length ? "design" : printers.length ? "print" : "none", assigneeId: designers[0]?.id || "", printerId: "" }])));
  const paid = lines.reduce((s, l) => s + amountOf(l), 0);
  const over = paid > total;
  const enough = paid >= need;
  const numbers = useMemo(() => predictNumbers(allOrders, date, items.length), [allOrders, date, items.length]);
  const share = useMemo(() => (paid > 0 && !over ? allocate(paid, items.map((i) => ({ id: i.id, due: i.total })), mode) || {} : {}), [paid, over, items, mode]);
  const no = lead?.quote?.status === "open" ? lead.quote.no : null;
  const customer = lead?.customer || draft?.customer || "";
  const setTask = (id, patch) => setTasks((t) => ({ ...t, [id]: { ...t[id], ...patch } }));

  async function submit() {
    setErr("");
    if (over) return setErr("To'lov smeta summasidan ko'p");
    if (!enough && !(isAdmin && force)) return setErr(`Avans kamida ${money(need)} bo'lishi kerak`);
    for (const it of items) { const t = tasks[it.id]; if (t.mode === "design" && !t.assigneeId) return setErr(`«${it.title || it.material}»: dizaynerni tanlang`); }
    setBusy(true);
    try {
      const body = {
        leadId: lead?.id || null, customer, phone: draft?.phone || "", source: draft?.source || "", manager, subcategory: line, date,
        items, distribute: mode, force: isAdmin && force,
        payments: lines.map((l) => ({ amount: amountOf(l), paymentType: l.methodType })).filter((l) => l.amount > 0),
        tasks: Object.fromEntries(items.map((it) => { const t = tasks[it.id]; return [it.id, { mode: t.mode, assigneeId: t.mode === "design" ? t.assigneeId : null, printerId: t.mode !== "none" ? t.printerId || null : null }]; })),
      };
      const r = await convertQuote(body);
      onDone(r);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  const inp = getInputStyle();
  const quick = (label, v) => (
    <button type="button" onClick={() => setLines([{ id: uid(), methodType: lines[0]?.methodType || "naqd", amountStr: fmt(v) }])}
      style={{ height: 28, padding: "0 10px", borderRadius: 14, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.text, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>{label}: {fmt(v)}</button>
  );
  return (
    <div data-testid="convert-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, color: THEME.muted }}>{customer}{manager ? ` · Menejer: ${manager}` : ""}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Field label="Sana"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></Field>
        <Field label="Yo'nalish">
          <div style={{ display: "flex", gap: 4, background: THEME.surface, borderRadius: 10, padding: 3 }}>
            {["UVIXPRINT", "UVONYX"].map((o) => <button key={o} type="button" onClick={() => setLine(o)} aria-pressed={line === o} style={{ flex: 1, height: 32, borderRadius: 8, border: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, background: line === o ? THEME.card : "transparent", color: line === o ? THEME.text : THEME.muted, boxShadow: line === o ? THEME.shadowSm : "none" }}>{o}</button>)}
          </div>
        </Field>
        <Field label="Menejer">
          <select value={manager} onChange={(e) => setManager(e.target.value)} style={inp}>{[...new Set([manager, ...managers].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </Field>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>To'lov</div>
        <MultiPaymentLines lines={lines} onChange={setLines} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {pct > 0 && pct < 100 && quick(`Avans ${pct}%`, need)}
          {quick("To'liq", total)}
        </div>
        <div data-testid="advance-status" style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, padding: "10px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.45, fontVariantNumeric: "tabular-nums",
          background: over ? THEME.roseBg : enough ? THEME.greenBg : THEME.amberBg, color: over ? THEME.rose : enough ? THEME.green : THEME.amber }}>
          {enough && !over ? <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>
            {over ? `To'lov (${money(paid)}) smeta summasidan (${money(total)}) ko'p` :
              enough ? <><b>{money(paid)}</b> to'lanmoqda{total ? ` — ${Math.round((paid / total) * 100)}%` : ""}{pct ? `, avans talabi ${pct}% bajarildi` : ""}. Qoladigan qarz: {money(total - paid)}</>
                : <>Avans kerak: <b>{money(need)}</b> ({pct}%) — yana {money(need - paid)} yetmaydi</>}
          </span>
        </div>
        {isAdmin && !enough && !over && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} data-testid="force-advance" style={{ width: 16, height: 16 }} />
            Avanssiz yaratish (istisno — tarixda yoziladi)
          </label>
        )}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{items.length} ta buyurtma yaratiladi{no ? ` · ${no}` : ""}</div>
          {items.length > 1 && paid > 0 && (
            <label style={{ fontSize: 12.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 6 }}>To'lov taqsimoti:
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ ...inp, minHeight: 30, height: 30, width: "auto", fontSize: 12.5 }} data-testid="distribute">
                <option value="prop">summaga mutanosib</option>
                <option value="oldest">ketma-ket (birinchidan)</option>
              </select>
            </label>
          )}
        </div>
        <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden" }}>
          {items.map((it, i) => {
            const t = tasks[it.id];
            const sel = { ...inp, minHeight: 32, height: 32, fontSize: 12.5, padding: "0 8px" };
            return (
              <div key={it.id} data-convert-item={it.id} style={{ padding: "10px 12px", borderTop: i ? `1px solid ${THEME.border}` : 0, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: THEME.violet, fontVariantNumeric: "tabular-nums" }}>{numbers[i]}</span>
                  <span style={{ flex: 1, minWidth: 140 }}><span style={{ fontWeight: 500 }}>{it.title || it.material}</span> <span style={{ fontSize: 12, color: THEME.dim }}>{describeItem(it)}</span></span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(it.total)}</span>
                  {paid > 0 && !over && <span data-share={it.id} style={{ fontVariantNumeric: "tabular-nums", color: THEME.green, fontSize: 12.5, whiteSpace: "nowrap" }}>+{fmt(share[it.id] || 0)}</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6 }}>
                  <select value={t.mode === "design" ? `d:${t.assigneeId}` : t.mode} aria-label="Vazifa" data-testid="task-mode"
                    onChange={(e) => { const v = e.target.value; if (v.startsWith("d:")) setTask(it.id, { mode: "design", assigneeId: v.slice(2) }); else setTask(it.id, { mode: v }); }} style={sel}>
                    {designers.map((d) => <option key={d.id} value={`d:${d.id}`}>Dizayner: {d.name}</option>)}
                    <option value="print">Maket tayyor → pechatga</option>
                    <option value="none">Vazifasiz (keyin beriladi)</option>
                  </select>
                  {t.mode !== "none" && printers.length > 0 && (
                    <select value={t.printerId} onChange={(e) => setTask(it.id, { printerId: e.target.value })} aria-label="Pechatchi" style={sel}>
                      <option value="">{t.mode === "design" ? "Pechatchi: keyin" : "Pechatchi: tanlanmagan"}</option>
                      {printers.map((p) => <option key={p.id} value={p.id}>Pechatchi: {p.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: THEME.surface, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            <span>Jami</span><span>{money(total)}</span>
          </div>
        </div>
      </div>

      {err && <div role="alert" style={{ color: THEME.rose, fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{onCancel?.label || "Bekor qilish"}</Button>
        <Button onClick={submit} disabled={busy || over || (!enough && !(isAdmin && force))} data-testid="convert-submit">{busy ? "Yaratilmoqda..." : `${items.length} ta buyurtma yaratish`}</Button>
      </div>
    </div>
  );
}

export function ConvertModal(props) {
  const no = props.lead?.quote?.status === "open" ? props.lead.quote.no : "";
  return (
    <Modal title={`Buyurtmaga aylantirish${no ? ` · ${no}` : ""}`} onClose={props.onCancel} width={720}>
      <ConvertPanel {...props} />
    </Modal>
  );
}
