// WorkerApp.jsx — Dizayner va Pechatchi uchun alohida ekran: faqat o'z vazifalari, pulsiz.
// Tuzilma: Yangi → Jarayonda → Tugallangan. "Tugallandi" bosilganda dizayn ishi avtomatik pechatchiga o'tadi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarClock, Check, CircleUser, FileImage, LayoutGrid, List, ListChecks, Loader2, LogOut, Pause, Play, Printer, RefreshCw, RotateCcw, ScanLine, Search, X } from "lucide-react";
import { Button, Card, ConfirmDialog, Field, getInputStyle, useIsMobile } from "../../components/ui.jsx";
import { roleLabel } from "../../constants.js";
import { LINE_META, lineColor } from "../../lib/lines.js";
import { MyJobs } from "../jobs/JobsView.jsx";
import { GeoConsentCard, GeoTracker } from "../jobs/GeoTracker.jsx";
import { SC, THEME, readableOn } from "../../theme.js";
import { fetchTasks, setTaskStatus } from "../../storage.js";
import { storageGet, storageSet } from "../../lib/kv.js";
import { useHistoryView } from "../../lib/history.js";
import PasskeySection from "../../auth/PasskeySection.jsx";
import { TelegramLinkCard } from "../../components/TelegramLinkCard.jsx";
import { TgPrefsCard } from "../../components/TgPrefsCard.jsx";
import { avatarColor, initials } from "../../auth/LoginScreen.jsx";
import { CheckInButton } from "../../components/CheckInButton.jsx";
import { usePerms } from "../../lib/perms.jsx";
import { ORDER_SCAN_EVT, QrApproveHost, QrScanButton, openScanner, takePendingOrder } from "../../components/PhoneToDesktop.jsx";

// Pastki menyudagi «Skaner» — hozircha o'chiq (keyin yo'lga qo'yiladi)
const WORKER_SCANNER = false;
const COLUMNS = [
  { key: "new", label: "Yangi", get color() { return SC.blue; } },
  { key: "in_progress", label: "Jarayonda", get color() { return SC.amber; } },
  { key: "done", label: "Tugallangan", get color() { return SC.green; } },
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
  const viewOnly = !!usePerms().viewAs; // «Rol bo'lib ko'rish» — joylashuv/«Keldim» ishlamaydi
  // tasks | settings — tarix orqali, telefonning "orqaga" harakati ham ishlaydi
  const { view: screen, go: goScreen, back: goBack } = useHistoryView("tasks", true);
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState("board"); // board | list
  const [mobileCol, setMobileCol] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmDone, setConfirmDone] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const isDesigner = currentUser.role === "designer";
  const isInstaller = currentUser.role === "installer";
  // QR yorliq: skanerlangan buyurtma (telefon kamerasi havolasi yoki ilovadagi «Skaner»)
  const [scanned, setScanned] = useState(() => takePendingOrder());
  useEffect(() => {
    const on = (e) => e.detail?.id && setScanned(e.detail.id);
    window.addEventListener(ORDER_SCAN_EVT, on);
    return () => window.removeEventListener(ORDER_SCAN_EVT, on);
  }, []);

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
      return updated;
    } catch (e) {
      setError(e.message);
      load();
      return null;
    } finally {
      setBusyId(null);
    }
  }

  const counts = { open: (byCol.new?.length || 0) + (byCol.in_progress?.length || 0), overdue: filtered.filter(isOverdue).length };

  return (
    <div style={{ minHeight: "100vh", background: THEME.surface, color: THEME.text, fontFamily: THEME.font }}>
      <style>{`body{background:${THEME.surface}} @keyframes uvixSpin{to{transform:rotate(360deg)}} .uvix-spin{animation:uvixSpin .9s linear infinite} @media (max-width:860px){input,select,textarea{font-size:16px!important}} @media (max-width:430px){.uvix-worker-name{display:none}} ${WORKER_NAV_CSS}`}</style>

      {!viewOnly && <GeoTracker user={currentUser} />}
      {/* Yuqori panel */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: THEME.card, borderBottom: `1px solid ${THEME.border}`, paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {screen === "settings" ? (
            <button type="button" onClick={goBack} aria-label="Orqaga" style={{ display: "flex", alignItems: "center", gap: 6, border: 0, background: "none", color: THEME.text, fontSize: 15, fontWeight: 600, cursor: "pointer", minHeight: 44, padding: 0 }}>
              <ArrowLeft size={20} /> Vazifalar
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: THEME.text, color: THEME.card, fontWeight: 700, fontSize: 11.5 }}>UV</span>
              <span style={{ fontWeight: 600, fontSize: 15 }}>UVIX</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <QrScanButton compact />
          {!viewOnly && <CheckInButton compact />}
          <div className="uvix-worker-name" style={{ textAlign: "right", lineHeight: 1.25 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{currentUser.name}</div>
            <div style={{ fontSize: 12, color: THEME.muted }}>{roleLabel(currentUser.role)}</div>
          </div>
          <button type="button" onClick={() => (screen === "settings" ? goBack() : goScreen("settings"))} aria-label="Sozlamalar"
            style={{ width: 44, height: 44, borderRadius: "50%", border: 0, cursor: "pointer", fontWeight: 700, fontSize: 14, color: readableOn(avatarColor(currentUser.id)), background: `${avatarColor(currentUser.id)}26` }}>
            {initials(currentUser.name)}
          </button>
        </div>
      </header>

      <main className="uvix-worker-main" style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 16px calc(32px + env(safe-area-inset-bottom, 0px))" }}>
        {screen === "settings" ? (
          <WorkerSettings currentUser={currentUser} onLogout={onLogout} />
        ) : (
          <>
            <MyJobs currentUser={currentUser} hideEmpty={!isInstaller} />
            {!isInstaller && <>
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
                      background: layout === k ? THEME.violet : "transparent", color: layout === k ? THEME.onPrimary : THEME.muted }}>
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
            </>}
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
      {scanned && <ScanTaskSheet orderId={scanned} tasks={tasks} busyId={busyId} onChange={change} onReload={load} onClose={() => setScanned(null)} onScanAgain={() => { setScanned(null); openScanner("order"); }} />}
      {isMobile && (
        <nav className="uvix-worker-nav" aria-label="Asosiy menyu" style={{ background: THEME.card, borderTop: `1px solid ${THEME.border}` }}>
          {[
            { k: "tasks", l: isInstaller ? "Ishlarim" : "Vazifalar", I: ListChecks, on: () => (screen === "settings" ? goBack() : null), active: screen !== "settings" },
            // Skaner hozircha xodimlarga ko'rsatilmaydi (keyin yoqiladi: WORKER_SCANNER = true)
            ...(WORKER_SCANNER ? [{ k: "scan", l: "Skaner", I: ScanLine, on: () => openScanner("order"), active: false, main: true }] : []),
            { k: "profile", l: "Profil", I: CircleUser, on: () => (screen === "settings" ? null : goScreen("settings")), active: screen === "settings" },
          ].map((t) => (
            <button key={t.k} type="button" data-wtab={t.k} onClick={t.on} aria-current={t.active ? "page" : undefined}
              style={{ color: t.main ? THEME.violet : t.active ? THEME.text : THEME.muted, fontWeight: t.active || t.main ? 700 : 500 }}>
              <t.I size={t.main ? 26 : 22} strokeWidth={t.active || t.main ? 2.2 : 1.8} />
              <span>{t.l}</span>
            </button>
          ))}
        </nav>
      )}
      <QrApproveHost />
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
        <span style={{ marginLeft: "auto", minWidth: 26, height: 26, borderRadius: 13, display: "grid", placeItems: "center", background: THEME.violet, color: THEME.onPrimary, fontSize: 12.5, fontWeight: 700 }}>{tasks.length}</span>
      </div>
      {body}
    </section>
  );
}

function TaskCard({ task: t, busy, onStart, onDone, onBack }) {
  const overdue = isOverdue(t);
  const Icon = t.kind === "design" ? FileImage : Printer;
  const statusStyle = {
    new: { l: "Yangi", c: SC.blue },
    in_progress: { l: "Jarayonda", c: SC.amber },
    done: { l: "Tugallandi", c: SC.green },
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
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: THEME.muted, fontWeight: 600, whiteSpace: "nowrap" }}><LineShort line={t.line} />№ {t.taskNo}</span>
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
      {t.refs?.length > 0 && (
        <div data-testid="task-refs" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {t.refs.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" title={r.name || "Mijoz rasmi"} onClick={(e) => e.stopPropagation()}
              style={{ display: "block", width: 84, height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${THEME.border}`, background: THEME.chip }}>
              {r.kind === "document" ? <span style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 11, color: THEME.muted }}>Fayl</span>
                : <img src={r.url} alt={r.name || "Mijoz rasmi"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </a>
          ))}
        </div>
      )}

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
          <Button onClick={() => onDone(t)} disabled={busy} style={{ minHeight: 40, background: THEME.greenSolid, borderColor: THEME.greenSolid, color: "#fff" }}>{busy ? <Loader2 size={15} className="uvix-spin" /> : <Check size={15} />} Tugallandi</Button>
        )}
      </div>
    </Card>
  );
}

function TaskList({ tasks, busyId, onStart, onDone }) {
  if (tasks.length === 0) return <Card style={{ textAlign: "center", color: THEME.muted, fontSize: 13.5, padding: 28 }}>Vazifa topilmadi</Card>;
  const dot = { new: SC.blue, in_progress: SC.amber, done: SC.green };
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {tasks.map((t, i) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i ? `1px solid ${THEME.border}` : 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot[t.status], flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><LineShort line={t.line} />{t.jobTitle}</div>
            <div style={{ fontSize: 12.5, color: isOverdue(t) ? THEME.rose : THEME.muted }}>
              {[t.customer, `№ ${t.taskNo}`, t.deadline && `muddat ${dayLabel(t.deadline)}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          {t.status === "new" && <Button onClick={() => onStart(t)} disabled={busyId === t.id} style={{ minHeight: 38 }}><Play size={14} /> Boshlash</Button>}
          {t.status === "in_progress" && <Button onClick={() => onDone(t)} disabled={busyId === t.id} style={{ minHeight: 38, background: THEME.greenSolid, borderColor: THEME.greenSolid, color: "#fff" }}><Check size={14} /> Tugallandi</Button>}
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
          <span style={{ width: 48, height: 48, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 700, color: readableOn(avatarColor(currentUser.id)), background: `${avatarColor(currentUser.id)}26` }}>{initials(currentUser.name)}</span>
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
      <TelegramLinkCard />
      <GeoConsentCard Card={Card} />
      <TgPrefsCard Card={Card} showLink={false} />
      <PasskeySection currentUser={currentUser} theme={THEME} Card={Card} />
      <Button variant="ghost" onClick={onLogout} style={{ alignSelf: "flex-start" }}><LogOut size={15} /> Tizimdan chiqish</Button>
    </div>
  );
}

const WORKER_NAV_CSS = `
  .uvix-worker-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 150; display: flex; padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px)); }
  .uvix-worker-nav button { flex: 1; height: 56px; border: 0; background: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-family: inherit; font-size: 11.5px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  @media (max-width: 720px) { .uvix-worker-main { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important; } }
  @keyframes uvixScanUp { from { transform: translateY(100%); } to { transform: none; } }
`;

// Skanerlangan yorliq → shu buyurtmadagi mening vazifam: katta «Boshlash» / «Tayyor» tugmalari.
// «Tayyor» ikki bosqichli (adashib bosilmasin): birinchi bosishda «Tasdiqlang», 4 soniya ichida ikkinchisi.
export function ScanTaskSheet({ orderId, tasks, busyId, onChange, onReload, onClose, onScanAgain }) {
  const [arm, setArm] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState("");
  const tried = useRef(false);
  const mine = useMemo(() => (tasks || []).filter((t) => t.orderId === orderId), [tasks, orderId]);
  // Ochiq vazifa birinchi (jarayonda → yangi), keyin tugallangani
  const task = mine.find((t) => t.status === "in_progress") || mine.find((t) => t.status === "new") || mine[0] || null;
  useEffect(() => { if (tasks && !task && !tried.current) { tried.current = true; onReload(); } }, [tasks, task]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!arm) return undefined; const t = setTimeout(() => setArm(false), 4000); return () => clearTimeout(t); }, [arm]);
  const busy = task && busyId === task.id;
  async function go(status) {
    setErr("");
    try {
      const u = await onChange(task, status);
      if (!u) throw new Error("Bajarib bo'lmadi — qayta urinib ko'ring");
      navigator.vibrate?.(40);
      setArm(false);
      setMsg(status === "done" ? (task.kind === "design" ? "Maket tayyor — ish pechatchiga o'tdi" : "Tayyor — buyurtma yakunlandi") : status === "in_progress" ? "Ish boshlandi" : "Pauza — ish navbatga qaytdi");
      return u;
    } catch (e) { setErr(e.message || "Bajarib bo'lmadi"); return null; }
  }
  const st = task ? { new: { l: "Navbatda", c: SC.blue }, in_progress: { l: task.kind === "design" ? "Dizaynda · siz" : "Pechatda · siz", c: SC.amber }, done: { l: "Tugallangan", c: SC.green } }[task.status] : null;
  const big = { height: 64, borderRadius: 18, fontSize: 19, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer" };
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(9,9,11,.45)" }} />
      <div role="dialog" aria-modal="true" aria-label="Skanerlangan buyurtma" data-testid="scan-task"
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 301, maxWidth: 560, margin: "0 auto", background: THEME.card, color: THEME.text, borderRadius: "24px 24px 0 0", padding: "14px 18px calc(22px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -12px 40px rgba(0,0,0,.25)", animation: "uvixScanUp .25s cubic-bezier(.16,1,.3,1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 40, height: 5, borderRadius: 3, background: THEME.border2, margin: "0 auto 0 calc(50% - 20px)" }} />
          <button type="button" onClick={onClose} aria-label="Yopish" style={{ border: 0, background: THEME.chip, color: THEME.muted, width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={18} /></button>
        </div>
        {tasks === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Loader2 size={24} className="uvix-spin" /></div>
        ) : !task ? (
          <div data-testid="scan-none" style={{ padding: "8px 2px 4px" }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>Bu buyurtmada sizga vazifa yo'q</div>
            <div style={{ fontSize: 14, color: THEME.muted, marginTop: 6, lineHeight: 1.5 }}>Yorliq boshqa xodimning ishiga tegishli yoki vazifa hali berilmagan. Savol bo'lsa — menejerga murojaat qiling.</div>
            <button type="button" onClick={onScanAgain} style={{ ...big, width: "100%", marginTop: 18, border: `1.5px solid ${THEME.border2}`, background: THEME.card, color: THEME.text }}><ScanLine size={22} /> Boshqasini skanerlash</button>
          </div>
        ) : (
          <div style={{ paddingTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span data-testid="scan-no" style={{ fontFamily: "ui-monospace, 'Courier New', monospace", fontWeight: 700, fontSize: 17 }}>{task.taskNo}</span>
              <span data-testid="scan-status" style={{ height: 30, padding: "0 12px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, color: st.c, background: `${st.c}1F` }}>● {st.l}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 10, lineHeight: 1.2 }}>{task.jobTitle}</div>
            <div style={{ fontSize: 15, color: THEME.muted, marginTop: 4 }}>{[...task.details.filter((d) => d.label === "Material" || d.label === "Format" || d.label === "Hajmi").map((d) => d.value), task.customer].filter(Boolean).join(" · ")}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <span style={{ height: 34, padding: "0 12px", borderRadius: 10, border: `1px solid ${THEME.border2}`, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600 }}>{task.kind === "design" ? <FileImage size={16} /> : <Printer size={16} />} {task.kind === "design" ? "Maket" : "Bosma"}</span>
              {task.status === "in_progress" && task.startedAt && <span style={{ height: 34, padding: "0 12px", borderRadius: 10, border: `1px solid ${THEME.border2}`, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600 }}><CalendarClock size={16} /> {Math.max(0, Math.round((Date.now() - Date.parse(task.startedAt)) / 60000))} daq</span>}
              {task.deadline && <span style={{ height: 34, padding: "0 12px", borderRadius: 10, border: `1px solid ${isOverdue(task) ? THEME.rose : THEME.border2}`, color: isOverdue(task) ? THEME.rose : THEME.text, display: "inline-flex", alignItems: "center", fontSize: 14, fontWeight: 600 }}>Muddat: {dayLabel(task.deadline)}</span>}
            </div>
            {task.notes && <div style={{ fontSize: 14, background: THEME.chip, padding: "9px 12px", borderRadius: 12, marginTop: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{task.notes}</div>}
            {msg && <div role="status" data-testid="scan-msg" style={{ marginTop: 14, padding: "10px 12px", borderRadius: 12, background: THEME.greenBg, color: THEME.green, fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 8 }}><Check size={18} /> {msg}</div>}
            {err && <div role="alert" style={{ marginTop: 12, color: THEME.rose, fontSize: 14 }}>{err}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              {task.status === "new" && (
                <button type="button" onClick={() => go("in_progress")} disabled={busy} data-testid="scan-start" style={{ ...big, flex: 1, border: 0, background: THEME.primarySolid, color: "#fff" }}>
                  {busy ? <Loader2 size={22} className="uvix-spin" /> : <Play size={22} />} Boshlash
                </button>
              )}
              {task.status === "in_progress" && (
                <>
                  <button type="button" onClick={() => go("new")} disabled={busy} data-testid="scan-pause" style={{ ...big, flex: "0 0 34%", border: `2px solid ${THEME.text}`, background: THEME.card, color: THEME.text }}><Pause size={20} /> Pauza</button>
                  <button type="button" onClick={() => (arm ? go("done") : setArm(true))} disabled={busy} data-testid="scan-done" aria-live="polite"
                    style={{ ...big, flex: 1, border: 0, background: THEME.greenSolid, color: "#fff", boxShadow: arm ? `0 0 0 4px ${THEME.greenBg}` : "none" }}>
                    {busy ? <Loader2 size={22} className="uvix-spin" /> : <Check size={24} />} {arm ? "Tasdiqlang" : "Tayyor"}
                  </button>
                </>
              )}
              {task.status === "done" && (
                <button type="button" onClick={onScanAgain} data-testid="scan-again" style={{ ...big, flex: 1, border: `1.5px solid ${THEME.border2}`, background: THEME.card, color: THEME.text }}><ScanLine size={22} /> Keyingisini skanerlash</button>
              )}
            </div>
            {arm && <div style={{ fontSize: 13, color: THEME.muted, textAlign: "center", marginTop: 8 }}>Ish tayyor bo'lsa — yana bir marta bosing</div>}
          </div>
        )}
      </div>
    </>
  );
}

// Vazifa qaysi yo'nalishniki: kichik «UV» / «ON» belgisi (umumiy xodim ikkalasini ko'radi)
function LineShort({ line }) {
  if (!LINE_META[line]) return null;
  const c = lineColor(line, THEME.isDark);
  return <span data-task-line={line} style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 6px", marginRight: 6, borderRadius: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, color: c, background: c + "1F", verticalAlign: 2 }}>{LINE_META[line].short}</span>;
}
