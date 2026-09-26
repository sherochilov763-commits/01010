import { useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Modal, getIconBtn, getInputStyle } from "../components/ui.jsx";
import { uid } from "../lib/format.js";
import { roleLabel } from "../constants.js";
import { THEME } from "../theme.js";

/* ---------------- EMPLOYEES VIEW ---------------- */

/* ---------------- XODIMLAR ---------------- */
const ROLE_DESCRIPTIONS = {
  admin: "Hammasini ko'radi, qo'shadi, tahrirlaydi, o'chiradi",
  operator: "Faqat o'z tushum/rasxodlarini kiritadi va ko'radi",
  designer: "Faqat o'ziga biriktirilgan dizayn vazifalarini ko'radi — pul ma'lumotlarisiz",
  printer: "Faqat o'ziga biriktirilgan pechat vazifalarini ko'radi — pul ma'lumotlarisiz",
};
const ROLE_BADGE = (role) => ({
  admin: { color: THEME.violet, bg: THEME.violetSoft },
  designer: { color: THEME.blue, bg: THEME.blueBg },
  printer: { color: THEME.cyan, bg: THEME.cyanBg },
}[role] || { color: THEME.greenText, bg: THEME.greenBg });

export function EmployeesView({ employees, onSave, auditLog, currentUser }) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("operator");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [tab, setTab] = useState("list");
  const [editEmailFor, setEditEmailFor] = useState(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [editEmailError, setEditEmailError] = useState("");

  function saveEmail() {
    const trimmed = editEmailValue.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return setEditEmailError("Email manzili noto'g'ri formatda");
    onSave(employees.map((e) => (e.id === editEmailFor.id ? { ...e, email: trimmed } : e)));
    setEditEmailFor(null);
    setEditEmailError("");
  }

  function addEmployee() {
    if (!name.trim()) return setError("Ismni kiriting");
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN 4-6 xonali raqam bo'lishi kerak");
    if (employees.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())) return setError("Bu ism band");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Email manzili noto'g'ri formatda");
    const next = [...employees, { id: uid(), name: name.trim(), role, pin, email: email.trim() }];
    onSave(next);
    setModal(false); setName(""); setPin(""); setRole("operator"); setEmail(""); setError("");
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
        {tab === "list" && <Button onClick={() => setModal(true)}><Plus size={14} /> Xodim qo'shish</Button>}
      </div>

      {tab === "list" ? (
        <Card style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "transparent", borderBottom: `1.5px solid ${THEME.border}` }}>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Ism</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Email</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Rol</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Ruxsatlar</th>
                <th style={{ padding: "13px 16px", fontSize: 10.5, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="uvix-row" style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "13px 16px", fontWeight: 600 }}>{e.name}</td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, fontSize: 12.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {e.email || <span style={{ color: THEME.rose }}>Kiritilmagan</span>}
                      <button
                        onClick={() => { setEditEmailFor(e); setEditEmailValue(e.email || ""); setEditEmailError(""); }}
                        className="uvix-iconbtn"
                        style={{ ...getIconBtn(), padding: 3 }}
                        title="Email'ni tahrirlash"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    <Badge color={ROLE_BADGE(e.role).color} bg={ROLE_BADGE(e.role).bg}>
                      {roleLabel(e.role)}
                    </Badge>
                  </td>
                  <td style={{ padding: "13px 16px", color: THEME.muted, fontSize: 12 }}>
                    {ROLE_DESCRIPTIONS[e.role] || ROLE_DESCRIPTIONS.operator}
                  </td>
                  <td style={{ padding: "13px 16px" }}>
                    {e.id !== currentUser.id && (
                      <button onClick={() => setConfirmDel(e)} className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={14} color={THEME.rose} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card style={{ padding: 0, maxHeight: 480, overflowY: "auto" }} className="uvix-scroll">
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
                    <td style={{ padding: "9px 14px", fontWeight: 600 }}>{l.who}</td>
                    <td style={{ padding: "9px 14px" }}>{l.what}</td>
                    <td style={{ padding: "9px 14px", color: THEME.muted, whiteSpace: "nowrap" }}>{new Date(l.when).toLocaleString("uz-UZ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {modal && (
        <Modal title="Yangi xodim qo'shish" onClose={() => setModal(false)} width={380}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Ism">
              <input value={name} onChange={(e) => setName(e.target.value)} style={getInputStyle()} placeholder="Ism familiya" />
            </Field>
            <Field label="Rol">
              <select value={role} onChange={(e) => setRole(e.target.value)} style={getInputStyle()}>
                <option value="operator">Operator</option>
                <option value="designer">Dizayner</option>
                <option value="printer">Pechatchi</option>
                <option value="admin">Administrator</option>
              </select>
              <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>{ROLE_DESCRIPTIONS[role]}</div>
            </Field>
            <Field label="PIN kod (4-6 raqam)">
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={getInputStyle()} placeholder="0000" inputMode="numeric" maxLength={6} />
            </Field>
            <Field label="Email (PIN unutilganda tiklash uchun)">
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={getInputStyle()} placeholder="xodim@gmail.com" type="email" />
            </Field>
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
      {editEmailFor && (
        <Modal title={`${editEmailFor.name} — email`} onClose={() => setEditEmailFor(null)} width={380}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Email (PIN unutilganda tiklash uchun)">
              <input value={editEmailValue} onChange={(e) => setEditEmailValue(e.target.value)} style={getInputStyle()} placeholder="xodim@gmail.com" type="email" autoFocus />
            </Field>
            {editEmailError && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{editEmailError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setEditEmailFor(null)}>Bekor qilish</Button>
              <Button onClick={saveEmail}>Saqlash</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
