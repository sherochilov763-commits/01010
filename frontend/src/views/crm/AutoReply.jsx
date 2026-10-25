// AutoReply.jsx — avtojavoblar (114/115-eskizlar): Sozlamalar kartasi, Chatlar ro'yxati tepasidagi holat belgisi,
// «AI» vositasidagi «Bu chatda avtojavob» bo'limi. Server: backend/auto-reply.js. AI'siz — faqat rahbar yozgan tayyor matn.
import { useEffect, useRef, useState } from "react";
import { Bot, Check, ChevronDown, Clock, Hand, Loader2, Moon, Send } from "lucide-react";
import { Button, Card, getInputStyle } from "../../components/ui.jsx";
import { THEME } from "../../theme.js";
import { C } from "./chatPalette.js";
import { fetchAutoReply, fetchChatAutoOff, saveAutoReply, setChatAutoOff, testAutoReply } from "../../storage.js";

export const RULES = [
  { key: "greet", title: "Salomlashish", Icon: Hand },
  { key: "away", title: "Ish vaqtidan tashqari", Icon: Moon },
  { key: "late", title: "Javob kechiksa", Icon: Clock },
];
export const RULE_LABEL = Object.fromEntries(RULES.map((r) => [r.key, r.title]));
const LINES = [["UVIXPRINT", "UVIX"], ["UVONYX", "ONYX"]];
const DAY = { 0: "Ya", 1: "Du", 2: "Se", 3: "Ch", 4: "Pa", 5: "Ju", 6: "Sh" };
function daysText(days = []) {
  const d = [...days].sort((a, b) => ((a || 7) - (b || 7)));
  if (!d.length) return "har kuni";
  const ord = d.map((x) => x || 7);
  const contiguous = ord.every((v, i) => !i || v === ord[i - 1] + 1);
  return contiguous && d.length > 2 ? `${DAY[d[0]]}–${DAY[d[d.length - 1]]}` : d.map((x) => DAY[x]).join(", ");
}
const whenText = (rule, work) => ({
  greet: "yangi mijozning birinchi xabariga",
  away: `${work?.to || "19:00"} – ${work?.from || "09:00"} va dam olish kunlari`,
  late: `ish vaqtida, ${work?.slaMinutes || 15} daqiqa menejer yozmasa`,
}[rule]);

// Umumiy holat (ro'yxat belgisi va sozlamalar bir-birini darhol ko'rsin)
let cache = null;
const subs = new Set();
const publish = (d) => { cache = d; subs.forEach((f) => f(d)); };
export function useAutoReply() {
  const [d, setD] = useState(cache);
  useEffect(() => {
    subs.add(setD);
    if (!cache) fetchAutoReply().then(publish).catch(() => {});
    const t = setInterval(() => document.visibilityState === "visible" && fetchAutoReply().then(publish).catch(() => {}), 60000);
    return () => { subs.delete(setD); clearInterval(t); };
  }, []);
  return { data: d, save: async (config) => { const r = await saveAutoReply(config); publish(r); return r; } };
}

function Switch({ on, onChange, disabled, label, testid, color }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} data-testid={testid} onClick={() => onChange(!on)}
      className="uvix-ar-sw" style={{ background: on ? (color || THEME.green) : THEME.border2 }}><span /></button>
  );
}
export const autoReplyCss = () => `
  .uvix-ar-sw { width: 44px; height: 26px; border-radius: 13px; border: 0; position: relative; cursor: pointer; flex-shrink: 0; padding: 0; }
  .uvix-ar-sw:disabled { cursor: default; opacity: .5; }
  .uvix-ar-sw > span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: left .15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
  .uvix-ar-sw[aria-checked="true"] > span { left: 21px; }
  @media (prefers-reduced-motion: reduce) { .uvix-ar-sw > span { transition: none; } }
`;

/** Sozlamalar → Savdo → «Avtojavoblar» (114-eskiz) */
export function AutoRepliesSection() {
  const { data, save } = useAutoReply();
  const [cfg, setCfg] = useState(null);
  const [line, setLine] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [testing, setTesting] = useState(null);
  useEffect(() => { if (data && !dirty) setCfg(data.config); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !cfg) return null;
  const edit = data.canEdit;
  const set = (fn) => { setCfg((c) => fn(structuredClone(c))); setDirty(true); setMsg(""); };
  async function onSave() {
    setBusy(true); setMsg("");
    try { const r = await save(cfg); setCfg(r.config); setDirty(false); setMsg("Saqlandi"); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function onTest(rule) {
    const l = line[rule] || "UVIXPRINT";
    setTesting(rule); setMsg("");
    try { await testAutoReply(rule, l, cfg.rules[rule].texts[l]); setMsg("Sinov xabari sizning Telegramingizga («Saqlangan xabarlar») yuborildi"); }
    catch (e) { setMsg(e.message); } finally { setTesting(null); }
  }
  const total = Object.values(data.today || {}).reduce((a, b) => a + b, 0);
  const inp = { ...getInputStyle(), minHeight: 64, resize: "vertical", lineHeight: 1.45 };
  const chip = (t, blue) => <span style={{ fontSize: 12, fontWeight: 600, color: blue ? THEME.violet : THEME.muted, background: blue ? THEME.violetSoft : THEME.chip, borderRadius: 7, padding: "2px 8px", whiteSpace: "nowrap" }}>{t}</span>;
  return (
    <Card data-testid="auto-replies" style={{ padding: 0, overflow: "hidden" }}>
      <style>{autoReplyCss()}</style>
      <div style={{ padding: "16px 18px 12px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 7 }}><Bot size={17} color={THEME.violet} /> Avtojavoblar</div>
          <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 3, lineHeight: 1.45 }}>Telegram akkauntingizdan, faqat shaxsiy chatlarga, siz yozgan tayyor matn bilan. Narx, to'lov, smeta haqida avtojavob yozmang — bular menejer ishi.</div>
        </div>
        <Switch on={cfg.on} disabled={!edit} label="Avtojavoblar" testid="ar-on" onChange={(v) => set((c) => { c.on = v; return c; })} />
      </div>
      {RULES.map(({ key, title, Icon }) => {
        const r = cfg.rules[key];
        const l = line[key] || "UVIXPRINT";
        const off = !cfg.on;
        return (
          <div key={key} data-rule={key} style={{ display: "flex", gap: 12, padding: "14px 18px", borderTop: `1px solid ${THEME.border}`, opacity: off ? 0.55 : 1 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: THEME.chip, color: THEME.text, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={17} /></span>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 14 }}>{title}</b>
                <span style={{ fontSize: 12.5, color: THEME.muted }}>{whenText(key, data.work)}</span>
              </div>
              <div role="tablist" aria-label="Yo'nalish" style={{ display: "inline-flex", alignSelf: "flex-start", background: THEME.chip, borderRadius: 8, padding: 2 }}>
                {LINES.map(([k, lab]) => (
                  <button key={k} type="button" role="tab" aria-selected={l === k} data-line={k} onClick={() => setLine((x) => ({ ...x, [key]: k }))}
                    style={{ border: 0, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: l === k ? THEME.card : "transparent", color: l === k ? THEME.text : THEME.muted }}>{lab}</button>
                ))}
              </div>
              <textarea value={r.texts[l]} readOnly={!edit} rows={2} aria-label={`${title} — ${l === "UVONYX" ? "ONYX" : "UVIX"} matni`} data-testid={`ar-text-${key}`}
                onChange={(e) => { const v = e.target.value; set((c) => { c.rules[key].texts[l] = v; return c; }); }} style={inp} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {key === "greet" && <>{chip("darhol")}{chip("1 mijozga — 1 marta")}</>}
                {key === "away" && <>{chip(`ish vaqti: ${daysText(data.work?.days)} ${data.work?.from || "09:00"}–${data.work?.to || "19:00"}`, true)}{chip("1 mijozga — kuniga 1 marta")}{chip("{ish_boshi} — ish boshlanish vaqti")}</>}
                {key === "late" && <>{chip(`${data.work?.slaMinutes || 15} daq`, true)}{chip("1 mijoz xabariga — 1 marta")}</>}
                {edit && <button type="button" onClick={() => onTest(key)} disabled={!!testing} data-testid={`ar-test-${key}`}
                  style={{ marginLeft: "auto", border: 0, background: "none", color: THEME.violet, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {testing === key ? <Loader2 size={13} className="uvix-spin" /> : <Send size={13} />} Sinab ko'rish (o'zimga)</button>}
              </div>
            </div>
            <Switch on={r.on} disabled={!edit} label={title} testid={`ar-rule-${key}`} onChange={(v) => set((c) => { c.rules[key].on = v; return c; })} />
          </div>
        );
      })}
      <div style={{ padding: "12px 18px", borderTop: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
        <span style={{ color: THEME.muted, flex: 1, minWidth: 0 }}>Bugun avtojavob <b style={{ color: THEME.text }} data-testid="ar-today">{total} marta</b> ishladi. Ish vaqti va «{data.work?.slaMinutes || 15} daqiqa» — «Tayyor javoblar» kartasidagi sozlamadan.</span>
        {msg && <span role="status" style={{ fontSize: 12.5, color: msg === "Saqlandi" || msg.startsWith("Sinov") ? THEME.green : THEME.rose }}>{msg}</span>}
        {edit && <Button onClick={onSave} disabled={!dirty || busy} data-testid="ar-save">{busy ? "Saqlanmoqda…" : "Saqlash"}</Button>}
      </div>
    </Card>
  );
}

/** Chatlar ro'yxati tepasidagi holat belgisi + tez boshqaruv oynasi (115-eskiz) */
export function AutoReplyChip({ onOpenSettings }) {
  const { data, save } = useAutoReply();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDoc); window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!data) return null;
  const cfg = data.config;
  const anyRule = RULES.some((r) => cfg.rules[r.key].on);
  const active = cfg.on && anyRule;
  const label = !active ? "o'chiq" : data.night ? "yoqilgan · tungi rejim" : "yoqilgan";
  async function toggle(patch) {
    setErr("");
    const next = structuredClone(cfg);
    patch(next);
    try { await save(next); } catch (e) { setErr(e.message); }
  }
  return (
    <div ref={ref} style={{ position: "relative", marginTop: 10 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="ar-chip" data-active={active ? "1" : undefined}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 16, border: `1px solid ${active ? `${C.link}55` : C.border}`, background: active ? `${C.link}14` : "transparent",
          color: active ? C.link : C.muted, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
        <Bot size={14} style={{ flexShrink: 0 }} /> <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Avtojavob: {label}</span> <ChevronDown size={14} />
      </button>
      {open && (
        <div role="dialog" aria-label="Avtojavoblar" data-testid="ar-pop"
          style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 6px)", zIndex: 30, background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, padding: "10px 12px", minWidth: 250 }}>
          <style>{autoReplyCss()}</style>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <b style={{ flex: 1, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}><Bot size={15} /> Avtojavoblar</b>
            <Switch on={cfg.on} disabled={!data.canEdit} label="Avtojavoblar" testid="ar-pop-on" onChange={(v) => toggle((c) => { c.on = v; })} />
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Hozir: {data.night ? `ish vaqtidan tashqari (${data.work?.to}–${data.work?.from})` : `ish vaqti (${data.work?.from}–${data.work?.to})`}</div>
          {RULES.map(({ key, title }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: `1px solid ${C.border}`, marginTop: key === "greet" ? 8 : 0, opacity: cfg.on ? 1 : 0.55 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{title}<span style={{ display: "block", fontSize: 11.5, color: C.muted }}>
                {cfg.rules[key].on ? `bugun ${data.today?.[key] || 0} marta${key === "away" && data.night && cfg.on ? " · hozir faol" : ""}` : "o'chiq"}</span></span>
              <Switch on={cfg.rules[key].on} disabled={!data.canEdit} label={title} testid={`ar-pop-${key}`} onChange={(v) => toggle((c) => { c.rules[key].on = v; })} />
            </div>
          ))}
          {err && <div role="alert" style={{ fontSize: 12, color: C.red, paddingBottom: 6 }}>{err}</div>}
          {!data.canEdit && <div style={{ fontSize: 11.5, color: C.muted, padding: "6px 0", borderTop: `1px solid ${C.border}` }}>O'zgartirish — rahbar yoki ruxsati bor xodim.</div>}
          {data.canEdit && onOpenSettings && (
            <button type="button" onClick={() => { setOpen(false); onOpenSettings(); }} data-testid="ar-open-settings"
              style={{ border: 0, borderTop: `1px solid ${C.border}`, width: "100%", textAlign: "left", background: "none", color: C.link, fontWeight: 600, fontSize: 12.5, padding: "8px 0 2px", cursor: "pointer", fontFamily: "inherit" }}>Matnlarni o'zgartirish →</button>
          )}
        </div>
      )}
    </div>
  );
}

const fmtTime = (iso) => { const d = new Date(iso); const today = new Date(); const t = d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }); return d.toDateString() === today.toDateString() ? `bugun ${t}` : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${t}`; };

/** «AI» vositasidagi avtojavob bo'limi: shu chatda o'chirish va shu mijozga ketganlar (115-eskiz) */
export function ChatAutoReply({ chatId, messages = [], onOpenSettings }) {
  const { data } = useAutoReply();
  const [off, setOff] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true; setOff(null); setErr("");
    if (chatId) fetchChatAutoOff(chatId).then((v) => alive && setOff(v)).catch(() => alive && setOff(false));
    return () => { alive = false; };
  }, [chatId]);
  const history = messages.filter((m) => m.auto).slice(-6).reverse();
  const globalOn = !!data?.config?.on;
  async function toggle(v) {
    setErr(""); const prev = off; setOff(!v);
    try { setOff(await setChatAutoOff(chatId, !v)); } catch (e) { setOff(prev); setErr(e.message); }
  }
  return (
    <div data-testid="chat-auto" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <style>{autoReplyCss()}</style>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: "10px 11px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Bu chatda avtojavob</div>
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>
            {off === null ? "…" : off ? "O'chirilgan — bu mijozga avtojavob ketmaydi" : globalOn ? "Yoqilgan · doimiy mijozga o'chirib qo'yish mumkin" : "Umumiy avtojavob o'chiq"}
          </div>
        </div>
        <Switch on={off === false} disabled={off === null} label="Bu chatda avtojavob" testid="chat-auto-toggle" color={C.greenSolid} onChange={toggle} />
      </div>
      {err && <div role="alert" style={{ fontSize: 12, color: C.red }}>{err}</div>}
      <div>
        <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 4 }}>Shu mijozga yuborilgan</div>
        {history.length ? history.map((m) => (
          <div key={m.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}>
            <Bot size={14} color={C.link} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{RULE_LABEL[m.auto] || "Avtojavob"}<span style={{ display: "block", fontSize: 11.5, color: C.muted }}>{fmtTime(m.date)}</span></span>
            <Check size={14} color={C.muted} />
          </div>
        )) : <div style={{ fontSize: 12.5, color: C.muted }}>Hali avtojavob ketmagan.</div>}
      </div>
      {data?.canEdit && onOpenSettings && <button type="button" onClick={onOpenSettings} style={{ alignSelf: "flex-start", border: 0, background: "none", padding: 0, color: C.link, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Avtojavob sozlamalari →</button>}
    </div>
  );
}
