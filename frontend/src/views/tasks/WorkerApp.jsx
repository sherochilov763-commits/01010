// WorkerApp.jsx — Dizayner va Pechatchi uchun alohida ekran: faqat o'z vazifalari, pulsiz.
// Tuzilma: Yangi → Jarayonda → Tugallangan. "Tugallandi" bosilganda dizayn ishi avtomatik pechatchiga o'tadi.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, ChevronLeft, FileImage, LayoutGrid, List, Loader2, LogOut, Play, Printer, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Button, Card, ConfirmDialog, Field, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { roleLabel } from "../../constants.js";
import { THEME } from "../../theme.js";
import { fetchTasks, setTaskStatus } from "../../storage.js";
import { storageGet, storageSet } from "../../lib/kv.js";
import PasskeySection from "../../auth/PasskeySection.jsx";
import { avatarColor, initials } from "../../auth/LoginScreen.jsx";

const COLUMNS = [
  { key: "new", label: "Yangi", color: "#3B82F6" },
  { key: "in_progress", label: "Jarayonda", color: "#F59E0B" },
  { key: "done", label: "Tugallangan", color: "#10B981" },
];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
function dayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d)) return "";
  return `${d.getDate()}-${MONTHS[d.getMonth()]}`;
}
function isOverdue(t) {
  if (!t.deadline || t.status === "done") return false;
  const end = new Date(t.deadline + "T23:59:59");
  return end < new Date();
}

export function WorkerApp({ currentUser, onLogout }) {
  const isMobile = useIsMobile();
  const [screen, setScreen] = useState("tasks"); // tasks | settings
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState("board"); // board | list
  const [mobileCol, setMobileCol] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmDone, setConfirmDone] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const isDesigner = currentUser.role === "designer";

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setTasks(await fetchTasks());
      setError("");
    } catch (e) {
      setError(e.message || "Vazifalarni olib bo'lmadi");
      setTasks((t) => t || []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Yangi vazifalar kelishini kuzatish: har 30 soniyada va ilovaga qaytilganda
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onFocus); };
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (tasks || []).filter((t) => !q || [t.jobTitle, t.customer, t.taskNo].some((v) => (v || "").toLowerCase().includes(q)));
    // Muddati yaqinlari tepada; tugallanganlar — oxirgi tugallangani tepada
    return list.sort((a, b) => {
      if (a.status === "done" && b.status === "done") return (b.doneAt || "").localeCompare(a.doneAt || "");
      return (a.deadline || "9999").localeCompare(b.deadline || "9999");
    });
  }, [tasks, query]);
  const byCol = useMemo(() => Object.fromEntries(COLUMNS.map((c) => [c.key, filtered.filter((t) => t.status === c.key)])), [filtered]);
  const activeMobileCol = mobileCol || (byCol.in_progress?.length ? "in_progress" : "new");

  async function change(task, status) {
    setBusyId(task.id);
    setError("");
    try {
      const updated = await setTaskStatus(task.leadId, task.kind, status);
      setTasks((list) => list.map((t) => (t.id === task.id ? updated : t)));
      if (isMobile && status !== "new") setMobileCol(status);
    } catch (e) {
      setError(e.message);
      load();
    } finally {
      setBusyId(null);
    }
  }

  const counts = { open: (byCol.new?.length || 0) + (byCol.in_progress?.length || 0), overdue: filtered.filter(isOverdue).length };

  return (
    <div style={{ minHeight: "100vh", background: THEME.surface, color: THEME.text, fontFamily: THEME.font }}>
      <style>{`body{background:${THEME.surface}} @keyframes uvixSpin{to{transform:rotate(360deg)}} .uvix-spin{animation:uvixSpin .9s linear infinite} @media (max-width:860px){input,select,textarea{font-size:16px!important}}`}</style>

      {/* Yuqori panel */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: THEME.card, borderBottom: `1px solid ${THEME.border}`, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          {screen === "settings" ? (
            <button type="button" onClick={() => setScreen("tasks")} style={{ display: "flex", alignItems: "center", gap: 6, border: 0, background: "none", color: THEME.text, fontSize: 15, fontWeight: 600, cursor: "pointer", minHeight: 44, padding: 0 }}>
              <ChevronLeft size={20} /> Vazifalar
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: `linear-gradient(135deg, ${THEME.violet}, ${THEME.cyan})`, color: "#fff", fontWeight: 800, fontSize: 12 }}>UV</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>UVIX</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: "right", lineHeight: 1.25 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{currentUser.name}</div>
            <div style={{ fontSize: 12, color: THEME.muted }}>{roleLabel(currentUser.role)}</div>
          </div>
          <button type="button" onClick={() => setScreen(screen === "settings" ? "tasks" : "settings")} aria-label="Sozlamalar"
            style={{ width: 44, height: 44, borderRadius: "50%", border: 0, cursor: "pointer", fontWeight: 700, fontSize: 14, color: avatarColor(currentUser.id), background: `${avatarColor(currentUser.id)}26` }}>
            {initials(currentUser.name)}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 16px calc(32px + env(safe-area-inset-bottom, 0px))" }}>
        {screen === "settings" ? (
          <WorkerSettings currentUser={currentUser} onLogout={onLogout} />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Mening vazifalarim</h1>
                <div style={{ fontSize: 13, color: THEME.muted, marginTop: 2 }}>
                  {tasks === null ? "Yuklanmoqda…" : `${counts.open} ta ochiq ${isDesigner ? "maket" : "bosma ish"}`}
                  {counts.overdue > 0 && <span style={{ color: THEME.rose, fontWeight: 600 }}> · {counts.overdue} tasi muddatidan o'tgan</span>}
                </div>
              </div>
              <button type="button" onClick={load} aria-label="Yangilash" disabled={refreshing}
                style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${THEME.border}`, background: THEME.card, color: THEME.muted, display: "grid", placeItems: "center", cursor: "pointer" }}>
                <RefreshCw size={16} className={refreshing ? "uvix-spin" : ""} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <label style={{ position: "relative", flex: 1, display: "block" }}>
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Qidiruv</span>
                <Search size={17} style={{ position: "absolute", left: 13, top: 14, color: THEME.muted }} />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ish, buyurtmachi yoki №"
                  style={{ ...getInputStyle(), height: 46, paddingLeft: 38, background: THEME.card, boxSizing: "border-box" }} />
              </label>
              <div role="group" aria-label="Ko'rinish" style={{ display: "flex", padding: 3, borderRadius: 12, background: THEME.card, border: `1px solid ${THEME.border}` }}>
                {[["board", "Doska", LayoutGrid], ["list", "Ro'yxat", List]].map(([k, l, Ic]) => (
                  <button key={k} type="button" onClick={() => setLayout(k)} aria-pressed={layout === k} aria-label={l}
                    style={{ height: 38, padding: isMobile ? "0 10px" : "0 14px", border: 0, borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600,
                      background: layout === k ? THEME.violet : "transparent", color: layout === k ? "#fff" : THEME.muted }}>
                    <Ic size={16} />{!isMobile && l}
                  </button>
                ))}
              </div>
            </div>

            {error && <div role="alert" style={{ padding: "10px 14px", borderRadius: 12, background: THEME.roseBg, color: THEME.roseText, fontSize: 13.5, marginBottom: 12 }}>{error}</div>}

            {tasks === null ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 48, color: THEME.muted }}><Loader2 size={22} className="uvix-spin" /></div>
            ) : layout === "list" ? (
              <TaskList tasks={filtered} busyId={busyId} onStart={(t) => change(t, "in_progress")} onDone={setConfirmDone} />
            ) : isMobile ? (
              <>
                <div role="tablist" aria-label="Holat" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {COLUMNS.map((c) => {
                    const on = c.key === activeMobileCol;
                    return (
                      <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => setMobileCol(c.key)}
                        style={{ flex: 1, height: 40, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13.5, fontWeight: on ? 600 : 500,
                          border: `1px solid ${on ? c.color : THEME.border}`, background: on ? `${c.color}22` : THEME.card, color: THEME.text }}>
                        {c.label}<span style={{ color: THEME.muted, fontWeight: 600 }}>{byCol[c.key].length}</span>
                      </button>
                    );
                  })}
                </div>
                <Column tasks={byCol[activeMobileCol]} col={COLUMNS.find((c) => c.key === activeMobileCol)} busyId={busyId}
                  onStart={(t) => change(t, "in_progress")} onDone={setConfirmDone} onBack={(t) => change(t, "new")} bare />
              </>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, alignItems: "start" }}>
                {COLUMNS.map((c) => (
                  <Column key={c.key} tasks={byCol[c.key]} col={c} busyId={busyId}
                    onStart={(t) => change(t, "in_progress")} onDone={setConfirmDone} onBack={(t) => change(t, "new")} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {confirmDone && (
        <ConfirmDialog
          message={confirmDone.kind === "design"
            ? `"${confirmDone.jobTitle}" maketi tayyormi? Tasdiqlaganingizda ish avtomatik pechatchiga o'tadi.`
            : `"${confirmDone.jobTitle}" bosma ishi tayyormi? Tasdiqlaganingizda buyurtma yakunlanadi.`}
          title={confirmDone.kind === "design" ? "Maket tayyor" : "Bosma ish tayyor"}
          confirmLabel="Ha, tayyor"
          tone="primary"
          icon={Check}
          onCancel={() => setConfirmDone(null)}
          onConfirm={() => { const t = confirmDone; setConfirmDone(null); change(t, "done"); }}
        />
      )}
    </div>
  );
}

function Column({ tasks, col, busyId, onStart, onDone, onBack, bare }) {
  const body = tasks.length === 0 ? (
    <div style={{ fontSize: 13, color: THEME.muted, textAlign: "center", padding: "22px 12px", border: `1.5px dashed ${THEME.border}`, borderRadius: 14 }}>
      {col.key === "new" ? "Yangi vazifa yo'q" : col.key === "in_progress" ? "Hozir hech narsa ustida ishlamayapsiz" : "Hali tugallangan ish yo'q"}
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {tasks.map((t) => <TaskCard key={t.id} task={t} busy={busyId === t.id} onStart={onStart} onDone={onDone} onBack={onBack} />)}
    </div>
  );
  if (bare) return body;
  return (
    <section aria-label={col.label} style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 18, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 12px" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: col.color }} />
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{col.label}</span>
        <span style={{ marginLeft: "auto", minWidth: 26, height: 26, borderRadius: 13, display: "grid", placeItems: "center", background: THEME.violet, color: "#fff", fontSize: 12.5, fontWeight: 700 }}>{tasks.length}</span>
      </div>
      {body}
    </section>
  );
}

function TaskCard({ task: t, busy, onStart, onDone, onBack }) {
  const overdue = isOverdue(t);
  const Icon = t.kind === "design" ? FileImage : Printer;
  const statusStyle = {
    new: { l: "Yangi", c: "#3B82F6" },
    in_progress: { l: "Jarayonda", c: "#F59E0B" },
    done: { l: "Tugallandi", c: "#10B981" },
  }[t.status] || { l: t.status, c: THEME.muted };
  const row = (label, value, strong) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
      <span style={{ color: THEME.muted }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 600, textAlign: "right" }}>{value}</span>
    </div>
  );
  return (
    <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9, boxShadow: overdue ? `inset 3px 0 0 ${THEME.rose}` : undefined, background: THEME.isDark ? undefined : "#FAFAFB" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 700,
          background: overdue ? THEME.roseBg : THEME.violetSoft, color: overdue ? THEME.rose : THEME.violet }}>
          <CalendarClock size={13} /> {t.deadline ? (overdue ? `Muddat o'tgan: ${dayLabel(t.deadline)}` : `Muddat: ${dayLabel(t.deadline)}`) : dayLabel(t.assignedAt) || "Muddatsiz"}
        </span>
        <span style={{ fontSize: 12.5, color: THEME.muted, fontWeight: 600, whiteSpace: "nowrap" }}>№ {t.taskNo}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 2 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: THEME.chip, color: t.kind === "design" ? THEME.blue : THEME.cyan }}><Icon size={18} /></span>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
          {t.jobTitle} <span style={{ color: THEME.muted, fontWeight: 500 }}>— {t.kind === "design" ? "maket" : "bosma"}</span>
        </div>
      </div>
      {row("Buyurtmachi", t.customer || "—", true)}
      {t.details.map((d) => row(d.label, d.value))}
      {row("Mas'ul", t.assigneeName || "—")}
      {t.notes && <div style={{ fontSize: 13, color: THEME.mutedDark, background: THEME.chip, padding: "8px 10px", borderRadius: 10, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{t.notes}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <span style={{ height: 30, padding: "0 12px", borderRadius: 999, display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 700, color: statusStyle.c, background: `${statusStyle.c}1F` }}>{statusStyle.l}</span>
        {t.status === "done" && t.doneAt && <span style={{ fontSize: 12.5, color: THEME.muted }}>{dayLabel(t.doneAt)}</span>}
        <div style={{ flex: 1 }} />
        {t.status === "in_progress" && onBack && (
          <button type="button" onClick={() => onBack(t)} disabled={busy} aria-label="Yangiga qaytarish" title="Yangiga qaytarish"
            style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${THEME.border}`, background: "none", color: THEME.muted, display: "grid", placeItems: "center", cursor: "pointer" }}>
            <RotateCcw size={15} />
          </button>
        )}
        {t.status === "new" && (
          <Button onClick={() => onStart(t)} disabled={busy} style={{ minHeight: 40 }}>{busy ? <Loader2 size={15} className="uvix-spin" /> : <Play size={15} />} Boshlash</Button>
        )}
        {t.status === "in_progress" && (
          <Button onClick={() => onDone(t)} disabled={busy} style={{ minHeight: 40, background: "#10B981", borderColor: "#10B981" }}>{busy ? <Loader2 size={15} className="uvix-spin" /> : <Check size={15} />} Tugallandi</Button>
        )}
      </div>
    </Card>
  );
}

function TaskList({ tasks, busyId, onStart, onDone }) {
  if (tasks.length === 0) return <Card style={{ textAlign: "center", color: THEME.muted, fontSize: 13.5, padding: 28 }}>Vazifa topilmadi</Card>;
  const dot = { new: "#3B82F6", in_progress: "#F59E0B", done: "#10B981" };
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {tasks.map((t, i) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i ? `1px solid ${THEME.border}` : 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot[t.status], flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.jobTitle}</div>
            <div style={{ fontSize: 12.5, color: isOverdue(t) ? THEME.rose : THEME.muted }}>
              {[t.customer, `№ ${t.taskNo}`, t.deadline && `muddat ${dayLabel(t.deadline)}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          {t.status === "new" && <Button onClick={() => onStart(t)} disabled={busyId === t.id} style={{ minHeight: 38 }}><Play size={14} /> Boshlash</Button>}
          {t.status === "in_progress" && <Button onClick={() => onDone(t)} disabled={busyId === t.id} style={{ minHeight: 38, background: "#10B981", borderColor: "#10B981" }}><Check size={14} /> Tugallandi</Button>}
          {t.status === "done" && <span style={{ fontSize: 12.5, color: THEME.muted }}>{dayLabel(t.doneAt)}</span>}
        </div>
      ))}
    </Card>
  );
}

function WorkerSettings({ currentUser, onLogout }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState(null);
  async function savePin() {
    if (!/^\d{4,6}$/.test(pin)) return setMsg({ err: true, t: "PIN 4–6 xonali raqam bo'lishi kerak" });
    const list = await storageGet("uvix:employees", true, []);
    // Server faqat o'z PIN'ingizni qabul qiladi — boshqa maydonlar e'tiborsiz qoldiriladi
    await storageSet("uvix:employees", true, list.map((e) => (e.id === currentUser.id ? { ...e, pin } : e)));
    setPin("");
    setMsg({ err: false, t: "PIN yangilandi" });
  }
  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ width: 48, height: 48, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, color: avatarColor(currentUser.id), background: `${avatarColor(currentUser.id)}26` }}>{initials(currentUser.name)}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{currentUser.name}</div>
            <div style={{ fontSize: 13, color: THEME.muted }}>{roleLabel(currentUser.role)}</div>
          </div>
        </div>
        <Field label="Yangi PIN kod">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} type="password" autoComplete="new-password"
              style={{ ...getInputStyle(), boxSizing: "border-box" }} placeholder="4–6 raqam" />
            <Button onClick={savePin} style={{ flexShrink: 0 }}>Saqlash</Button>
          </div>
        </Field>
        {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.err ? THEME.rose : THEME.green }}>{msg.t}</div>}
      </Card>
      <PasskeySection currentUser={currentUser} theme={THEME} Card={Card} />
      <Button variant="ghost" onClick={onLogout} style={{ alignSelf: "flex-start" }}><LogOut size={15} /> Tizimdan chiqish</Button>
    </div>
  );
}
