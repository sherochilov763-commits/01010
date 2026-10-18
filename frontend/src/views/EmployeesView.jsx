import { useContext, useEffect, useState } from "react";
import { ClipboardList, Eye, KeyRound, Lock, Pencil, Plus, Send, Trash2, Users } from "lucide-react";
import { fetchPinHelp, fetchRoles, fetchStaffTelegram, giveTempPin, startViewAs } from "../storage.js";
import { BY_KEY, PERMS, legacyOver } from "../lib/permissions.js";
import { EmpOverrides, permsFor } from "./settings/RolesSection.jsx";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Modal, getIconBtn, getInputStyle } from "../components/ui.jsx";
import { fmt, uid } from "../lib/format.js";
import { roleLabel } from "../constants.js";
import { EMP_LINE_OPTIONS, WorkStatsContext, empLineLabel, lineColor } from "../lib/lines.js";
import { THEME } from "../theme.js";
import { usePerms } from "../lib/perms.jsx";

/* ---------------- EMPLOYEES VIEW ---------------- */

/* ---------------- XODIMLAR ---------------- */
const ROLE_DESCRIPTIONS = {
  admin: "Hammasini ko'radi, qo'shadi, tahrirlaydi, o'chiradi",
  manager: "Yo'nalish rahbari: o'z yo'nalishining barcha buyurtma, rasxod va mijozlarini ko'radi; xodimlar so'rovini chegarasi doirasida tasdiqlaydi",
  operator: "Faqat o'z tushum/rasxodlarini kiritadi va ko'radi",
  designer: "Faqat o'ziga biriktirilgan dizayn vazifalarini ko'radi — pul ma'lumotlarisiz",
  printer: "Faqat o'ziga biriktirilgan pechat vazifalarini ko'radi — pul ma'lumotlarisiz",
  installer: "Faqat o'ziga berilgan o'lchov, montaj, yetkazish vazifalarini ko'radi — pul ma'lumotlarisiz",
};
const ROLE_BADGE = (role) => ({
  admin: { color: THEME.violet, bg: THEME.violetSoft },
  manager: { color: THEME.text, bg: THEME.chip },
  designer: { color: THEME.blue, bg: THEME.blueBg },
  printer: { color: THEME.cyan, bg: THEME.cyanBg },
  installer: { color: THEME.amber || "#B45309", bg: THEME.amberBg || "#FDF3E3" },
}[role] || { color: THEME.greenText, bg: THEME.greenBg });

export function EmployeesView({ employees, onSave, auditLog, currentUser }) {
  const work = useContext(WorkStatsContext);
  const curMonth = new Date().toISOString().slice(0, 7);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("operator");
  const [line, setLine] = useState("UVIXPRINT");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [editEmp, setEditEmp] = useState(null);
  const [tab, setTab] = useState("list");
  // Kirish holati: Telegram ulanganmi (PIN tiklash kodi shu yerga keladi) va kim PIN so'radi
  const isAdmin = currentUser?.role === "admin";
  const { can } = usePerms();
  const canManage = isAdmin || can("staff.manage");
  const [tg, setTg] = useState(null);
  const [help, setHelp] = useState({});
  const [temp, setTemp] = useState(null); // { emp, stage: "confirm" | "busy" | "done", pin, expiresAt, error }
  useEffect(() => {
    if (!isAdmin) return;
    fetchStaffTelegram().then(setTg).catch(() => setTg({}));
    fetchPinHelp().then(setHelp).catch(() => {});
  }, [isAdmin]);
  async function makeTemp() {
    setTemp((t) => ({ ...t, stage: "busy", error: "" }));
    try {
      const r = await giveTempPin(temp.emp.id);
      setTemp((t) => ({ ...t, stage: "done", pin: r.pin, expiresAt: r.expiresAt }));
      setHelp((h) => { const n = { ...h }; delete n[temp.emp.id]; return n; });
    } catch (e) { setTemp((t) => ({ ...t, stage: "confirm", error: e.message })); }
  }

  function addEmployee() {
    if (!name.trim()) return setError("Ismni kiriting");
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN 4-6 xonali raqam bo'lishi kerak");
    if (employees.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())) return setError("Bu ism band");
    const next = [...employees, { id: uid(), name: name.trim(), role, pin, ...(role === "admin" ? {} : { line }) }];
    onSave(next);
    setModal(false); setName(""); setPin(""); setRole("operator"); setLine("UVIXPRINT"); setError("");
  }
  // Yo'nalishni rahbar biriktiradi: xodim faqat shu yo'nalish buyurtma/rasxodlarini ko'radi (server ham tekshiradi)
  function setEmpLine(emp, v) {
    onSave(employees.map((e) => (e.id === emp.id ? { ...e, line: v } : e)));
  }
  function removeEmployee(emp) {
    onSave(employees.filter((e) => e.id !== emp.id));
    setConfirmDel(null);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Button variant={tab === "list" ? "primary" : "ghost"} onClick={() => setTab("list")}><Users size={14} /> Xodimlar</Button>
        <Button variant={tab === "log" ? "primary" : "ghost"} onClick={() => setTab("log")}><ClipboardList size={14} /> O'zgarishlar tarixi</Button>
        {tab === "list" && <div style={{ flex: 1 }} />}
        {tab === "list" && canManage && <Button onClick={() => setModal(true)}><Plus size={14} /> Xodim qo'shish</Button>}
      </div>

      {tab === "list" ? (
        <Card style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Ism</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Kirish</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Rol</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Yo'nalish</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Ruxsatlar</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "13px 16px", fontWeight: 600 }}>{e.name}</td>
                  <td style={{ padding: "13px 16px", fontSize: 12.5 }} data-access={e.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {tg && (tg[e.id]
                        ? <span title={`PIN tiklash kodi va eslatmalar shu Telegram'ga keladi`} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: THEME.muted }}><Send size={12} color="#229ED9" />{tg[e.id].username ? `@${tg[e.id].username}` : "Telegram ulangan"}</span>
                        : <span data-testid="tg-missing" title="Xodim UVIX'ga kirib, Sozlamalar → «Telegram'ni ulash»ni bosishi kerak (faqat o'zi ulay oladi)" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: THEME.amber || "#B45309", background: THEME.amberBg || "#FDF3E3", borderRadius: 999, padding: "2px 8px", fontWeight: 600, fontSize: 11.5 }}><Send size={11} /> Telegram ulanmagan</span>)}
                      {help[e.id] && <span data-testid="pin-help" style={{ color: THEME.rose, background: THEME.roseBg || "#FDECEC", borderRadius: 999, padding: "2px 8px", fontWeight: 600, fontSize: 11.5 }}>PIN'ni unutdi</span>}
                      {e.mustChangePin && <span style={{ color: THEME.muted, fontSize: 11.5 }}>· vaqtinchalik PIN berilgan</span>}
                      {isAdmin && e.id !== currentUser.id && (
                        <button type="button" onClick={() => setTemp({ emp: e, stage: "confirm" })} className="uvix-iconbtn" data-testid="temp-pin-btn"
                          style={{ ...getIconBtn(), padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: help[e.id] ? THEME.violet : THEME.muted }} title="Vaqtinchalik PIN berish">
                          <KeyRound size={12} /> Vaqtinchalik PIN
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <Badge color={ROLE_BADGE(e.role).color} bg={ROLE_BADGE(e.role).bg}>
                      {roleLabel(e.role)}
                    </Badge>
                  </td>
                  <td style={{ padding: "13px 16px" }} data-emp-line={e.id}>
                    {isAdmin && e.role !== "admin" ? (
                      <select value={e.line === "UVONYX" || e.line === "common" ? e.line : "UVIXPRINT"} onChange={(ev) => setEmpLine(e, ev.target.value)} aria-label={`${e.name}: yo'nalish`}
                        style={{ ...getInputStyle(), width: "auto", minWidth: 128, padding: "5px 8px", fontSize: 12.5, fontWeight: 700, color: e.line === "common" ? THEME.text : lineColor(e.line === "UVONYX" ? "UVONYX" : "UVIXPRINT", THEME.isDark) }}>
                        {EMP_LINE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                      </select>
                    ) : <span style={{ fontSize: 12.5, fontWeight: 600, color: THEME.muted }}>{empLineLabel(e)}</span>}
                    {e.line === "common" && (() => {
                      const r = work?.[curMonth]?.[e.id];
                      const tot = r ? r.UVIXPRINT + r.UVONYX : 0;
                      return (
                        <div data-emp-work={e.id} style={{ fontSize: 11.5, color: THEME.muted, marginTop: 4, whiteSpace: "nowrap" }} title="Oylik shu nisbatda bo'linadi (bajarilgan vazifalar)">
                          {tot ? <>Shu oy: <b style={{ color: lineColor("UVIXPRINT", THEME.isDark) }}>{r.UVIXPRINT} UV</b> · <b style={{ color: lineColor("UVONYX", THEME.isDark) }}>{r.UVONYX} ON</b> → {Math.round((r.UVIXPRINT / tot) * 100)}% / {100 - Math.round((r.UVIXPRINT / tot) * 100)}%</> : "Shu oy bajarilgan ish yo'q"}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, fontSize: 12 }}>
                    {ROLE_DESCRIPTIONS[e.role] || ROLE_DESCRIPTIONS.operator}
                    <PermChips e={e} />
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {isAdmin && e.role !== "admin" && (
                      <button onClick={() => setEditEmp(e)} className="uvix-iconbtn" style={getIconBtn()} title="Rol va huquqlar" aria-label={`${e.name}: rol va huquqlar`} data-emp-edit={e.id}><Pencil size={14} /></button>
                    )}
                    {e.id !== currentUser.id && canManage && (isAdmin || e.role !== "admin") && (
                      <button onClick={() => setConfirmDel(e)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card style={{ padding: 0, maxHeight: 480, overflowY: "auto" }} className="uvix-scroll">
          <div data-testid="audit-note" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: 12, color: THEME.greenText, background: THEME.greenBg, borderBottom: `1px solid ${THEME.border}` }}>
            <Lock size={13} /> Jurnalni server yozadi — yozuvlarni o'zgartirib yoki o'chirib bo'lmaydi
          </div>
          {auditLog.length === 0 ? <EmptyState text="Hozircha tarix yo'q" /> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                  <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Kim</th>
                  <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Nima o'zgartirdi</th>
                  <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Qachon</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((l) => (
                  <tr key={l.id} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                    <td style={{ padding: "9px 14px", fontWeight: 600 }}>{l.who}{l.dev && <div style={{ fontSize: 11, fontWeight: 500, color: THEME.dim }}>{l.dev}</div>}</td>
                    <td style={{ padding: "9px 14px", color: /^Rad etildi/.test(l.what) ? THEME.rose : undefined }}>{l.src === "server" && <Lock size={11} style={{ verticalAlign: -1, marginRight: 5, color: THEME.dim }} aria-label="server yozuvi" />}{l.what}</td>
                    <td style={{ padding: "9px 14px", color: THEME.muted, whiteSpace: "nowrap" }}>{new Date(l.when).toLocaleString("uz-UZ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {editEmp && <EmpRights emp={editEmp} onClose={() => setEditEmp(null)} onSave={(next) => { onSave(employees.map((x) => (x.id === next.id ? next : x))); setEditEmp(null); }} />}
      {modal && (
        <Modal title="Yangi xodim qo'shish" onClose={() => setModal(false)} width={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Ism">
              <input value={name} onChange={(e) => setName(e.target.value)} style={getInputStyle()} placeholder="Ism familiya" />
            </Field>
            <Field label="Rol">
              <select value={role} onChange={(e) => { setRole(e.target.value); setLine(["designer", "printer", "installer"].includes(e.target.value) ? "common" : "UVIXPRINT"); }} style={getInputStyle()}>
                <option value="operator">Operator (sotuv menejeri)</option>
                <option value="manager">Katta menejer</option>
                <option value="designer">Dizayner</option>
                <option value="printer">Pechatchi</option>
                <option value="installer">Montajchi</option>
                {isAdmin && <option value="admin">Administrator</option>}
              </select>
              <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>{ROLE_DESCRIPTIONS[role]}</div>
            </Field>
            {role !== "admin" && (
              <Field label="Yo'nalish">
                <div role="group" aria-label="Yo'nalish" data-testid="new-emp-line" style={{ display: "flex", gap: 6 }}>
                  {EMP_LINE_OPTIONS.map((o) => {
                    const on = line === o.key;
                    const c = o.key === "common" ? THEME.text : lineColor(o.key, THEME.isDark);
                    return (
                      <button key={o.key} type="button" onClick={() => setLine(o.key)} aria-pressed={on} data-line={o.key}
                        style={{ flex: 1, padding: "7px 6px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", background: THEME.card, color: THEME.text, border: `1.5px solid ${on ? c : THEME.border}` }}>
                        <b style={{ display: "block", fontSize: 12.5, color: c }}>{o.name}</b>
                        <small style={{ fontSize: 10.5, color: THEME.muted }}>{o.sub}</small>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>Xodim faqat o'z yo'nalishini ko'radi. «Umumiy» — ikkala yo'nalishdagi o'z ishlari (pechatnik, dizayner).</div>
              </Field>
            )}
            <Field label="PIN kod (4-6 raqam)">
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={getInputStyle()} placeholder="0000" inputMode="numeric" maxLength={6} />
            </Field>
            <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>PIN unutilsa — xodim Telegram orqali kod oladi (Telegram'ni o'zi ulagan bo'lsa) yoki sizdan vaqtinchalik PIN so'raydi.</div>
            {error && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setModal(false)}>Bekor qilish</Button>
              <Button onClick={addEmployee}>Qo'shish</Button>
            </div>
          </div>
        </Modal>
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`${confirmDel.name}ni xodimlar ro'yxatidan o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => removeEmployee(confirmDel)}
        />
      )}
      {temp && (
        <Modal title={`${temp.emp.name} — vaqtinchalik PIN`} onClose={() => setTemp(null)} width={400}>
          {temp.stage === "done" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="temp-pin-result">
              <div style={{ fontSize: 13, color: THEME.muted }}>Bu PIN'ni xodimga ayting (yoki yozib bering):</div>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 8, textAlign: "center", padding: "12px 0", borderRadius: 12, background: THEME.chip || THEME.hover, fontVariantNumeric: "tabular-nums" }} data-testid="temp-pin-value">{temp.pin}</div>
              <div style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.5 }}>24 soat amal qiladi ({new Date(temp.expiresAt).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} gacha). Xodim u bilan kirishi bilan o'zining yangi PIN'ini qo'yadi — siz uni bilmaysiz.</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}><Button onClick={() => setTemp(null)}>Tayyor</Button></div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{temp.emp.name}ning hozirgi PIN'i bekor qilinadi va 6 xonali vaqtinchalik PIN yaratiladi. Xodim u bilan kirgach, o'z PIN'ini qo'yishi shart.</div>
              {temp.error && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{temp.error}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => setTemp(null)}>Bekor qilish</Button>
                <Button onClick={makeTemp} disabled={temp.stage === "busy"} data-testid="temp-pin-confirm">Vaqtinchalik PIN yaratish</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// Huquqlar: rol andozasi (Sozlamalar → Rollar va huquqlar) + shu xodimga istisno (permOver)
const overOf = (e) => ({ ...legacyOver(e), ...(e?.permOver || {}) });
function PermChips({ e }) {
  const n = e.role === "admin" ? 0 : Object.keys(overOf(e)).filter((k) => BY_KEY.has(k)).length;
  if (!n) return null;
  return <div><span data-perm="over" data-n={n} title="Shu xodimga roldan farqli huquqlar" style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 6, fontSize: 11, fontWeight: 600, marginTop: 5, color: THEME.amberText, background: THEME.amberBg }}>+{n} istisno</span></div>;
}
function EmpRights({ emp, onClose, onSave }) {
  const [role, setRole] = useState(emp.role);
  const [over, setOver] = useState(() => overOf(emp));
  const [rolesCfg, setRolesCfg] = useState({});
  const [err, setErr] = useState("");
  useEffect(() => { fetchRoles().then((r) => setRolesCfg(r.roles || {})).catch(() => {}); }, []);
  // Rol almashsa — ishchi roliga tegishli bo'lmagan istisnolar tushib qoladi
  const shown = Object.fromEntries(Object.entries(over).filter(([k]) => permsFor(role).some((p) => p.k === k)));
  const base = { ...Object.fromEntries(PERMS.map((p) => [p.k, p.def[role]])), ...(rolesCfg[role] || {}) };
  const clean = Object.fromEntries(Object.entries(shown).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k])));
  async function viewAs() {
    try { await startViewAs({ employeeId: emp.id }); window.location.assign(window.location.pathname); } catch (e) { setErr(e.message); }
  }
  return (
    <Modal title={`${emp.name} — rol va huquqlar`} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value)} style={getInputStyle()} data-testid="emp-role">
            <option value="operator">Operator (sotuv menejeri)</option>
            <option value="manager">Katta menejer</option>
            <option value="designer">Dizayner</option>
            <option value="printer">Pechatchi</option>
            <option value="installer">Montajchi</option>
          </select>
          <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>{ROLE_DESCRIPTIONS[role]} · huquqlar rol andozasidan olinadi (Sozlamalar → Rollar va huquqlar)</div>
        </Field>
        <EmpOverrides role={role} base={base} value={shown} onChange={setOver} />
        {err && <div role="alert" style={{ fontSize: 12.5, color: THEME.rose }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {emp.id && !emp.deletedAt && <Button variant="ghost" onClick={viewAs} data-testid="emp-viewas" style={{ marginRight: "auto" }}><Eye size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{emp.name.split(" ")[0]} bo'lib ko'rish</Button>}
          <Button variant="ghost" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={() => onSave({ ...emp, role, perm: null, permOver: clean })} data-testid="emp-rights-save">Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}
