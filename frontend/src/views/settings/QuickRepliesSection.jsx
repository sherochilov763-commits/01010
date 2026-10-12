// QuickRepliesSection.jsx — Chatlar uchun tayyor javoblar (/narx, /karta ...) va javobsiz chat ogohlantirishi
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { fetchChatTools, saveChatConfig, saveQuickReplies } from "../../storage.js";

const DAYS = [[1, "Du"], [2, "Se"], [3, "Ch"], [4, "Pa"], [5, "Ju"], [6, "Sh"], [0, "Ya"]];

export function QuickRepliesSection() {
  const [list, setList] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { fetchChatTools().then((d) => { setList(d.replies || []); setCfg(d.config); }).catch((e) => setMsg(e.message)); }, []);
  if (!list || !cfg) return null;

  const upd = (i, patch) => { setList((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r))); setDirty(true); };
  const setC = (patch) => { setCfg((c) => ({ ...c, ...patch })); setDirty(true); };
  async function save() {
    setBusy(true); setMsg("");
    try {
      const saved = await saveQuickReplies(list.filter((r) => r.key.trim() && r.text.trim()));
      const c = await saveChatConfig(cfg);
      setList(saved); setCfg(c); setDirty(false); setMsg("Saqlandi");
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  const inp = { ...getInputStyle(), minHeight: 34 };

  return (
    <Card data-testid="quick-replies">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>Chat: tayyor javoblar</div>
          <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>Chatda «/» yozilganda yoki ⚡ tugmasi bosilganda chiqadi. Barcha xodimlar uchun umumiy.</div>
        </div>
        <Button variant="ghost" onClick={() => { setList((l) => [...l, { id: `n${Date.now()}`, key: "", text: "" }]); setDirty(true); }}><Plus size={14} /> Qo'shish</Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {list.map((r, i) => (
          <div key={r.id || i} data-reply={r.key} style={{ display: "grid", gridTemplateColumns: "120px 1fr 34px", gap: 8, alignItems: "start" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: 9, color: THEME.violet, fontWeight: 700 }}>/</span>
              <input value={r.key} onChange={(e) => upd(i, { key: e.target.value.replace(/^\//, "").replace(/\s/g, "").toLowerCase() })} placeholder="narx" aria-label="Qisqa nom" style={{ ...inp, paddingLeft: 20, color: THEME.violet, fontWeight: 600 }} />
            </div>
            <textarea value={r.text} onChange={(e) => upd(i, { text: e.target.value })} rows={2} placeholder="Javob matni" aria-label="Javob matni" style={{ ...inp, resize: "vertical", lineHeight: 1.4 }} />
            <button type="button" onClick={() => { setList((l) => l.filter((_, j) => j !== i)); setDirty(true); }} aria-label="O'chirish" title="O'chirish" className="uvix-iconbtn"
              style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${THEME.border2}`, background: THEME.card, color: THEME.rose, display: "grid", placeItems: "center", cursor: "pointer" }}><Trash2 size={14} /></button>
          </div>
        ))}
        {!list.length && <div style={{ fontSize: 13, color: THEME.dim }}>Hali tayyor javob yo'q.</div>}
      </div>

      <div style={{ borderTop: `1px solid ${THEME.border}`, marginTop: 14, paddingTop: 14, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13 }}>
        <span style={{ fontWeight: 500 }}>Javobsiz chat ogohlantirishi:</span>
        <select value={cfg.slaMinutes} onChange={(e) => setC({ slaMinutes: Number(e.target.value) })} aria-label="Necha daqiqadan keyin" style={{ ...inp, width: 140 }}>
          {[0, 5, 10, 15, 20, 30, 45, 60, 120].map((m) => <option key={m} value={m}>{m ? `${m} daqiqa` : "O'chiq"}</option>)}
        </select>
        <span style={{ color: THEME.muted }}>ish vaqtida</span>
        <input type="time" value={cfg.workFrom} onChange={(e) => setC({ workFrom: e.target.value })} aria-label="Ish boshlanishi" style={{ ...inp, width: 110 }} />
        <span style={{ color: THEME.muted }}>—</span>
        <input type="time" value={cfg.workTo} onChange={(e) => setC({ workTo: e.target.value })} aria-label="Ish tugashi" style={{ ...inp, width: 110 }} />
        <div style={{ display: "flex", gap: 4 }} role="group" aria-label="Ish kunlari">
          {DAYS.map(([d, l]) => {
            const on = (cfg.workDays || []).includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => setC({ workDays: on ? cfg.workDays.filter((x) => x !== d) : [...(cfg.workDays || []), d] })}
                style={{ width: 32, height: 30, borderRadius: 7, border: `1px solid ${on ? THEME.text : THEME.border2}`, background: on ? THEME.text : THEME.card, color: on ? THEME.card : THEME.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{l}</button>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 12, color: THEME.dim, marginTop: 8, lineHeight: 1.5 }}>
        Mijoz yozib, belgilangan vaqt ichida javob berilmasa — chat ro'yxatda qizil bilan belgilanadi va mas'ul menejerga (tayinlanmagan bo'lsa hammaga) bildirishnoma keladi.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
        <Button onClick={save} disabled={busy || !dirty}>Saqlash</Button>
        {msg && <span role="status" style={{ fontSize: 12.5, color: msg === "Saqlandi" ? THEME.green : THEME.rose }}>{msg}</span>}
      </div>
    </Card>
  );
}
