// DesktopLogin.jsx — kompyuterdan kirish: chapda fon + soat, o'ngda «PIN bilan | Telefon bilan».
//  PIN: xodimlar ro'yxati (sichqoncha yoki ↑↓), PIN klaviaturadan, Enter — kirish.
//  Telefon: QR (60 s, bir martalik) → telefonda Face ID → kompyuter o'zi ochiladi.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Lock, QrCode, RefreshCw, Search, ShieldCheck, UserRound } from "lucide-react";
import { authLogin, qrPoll, qrStart } from "../storage.js";
import { roleLabel } from "../constants.js";
import { ForgotStep, NewPinStep, avatarColor, initials } from "./LoginScreen.jsx";
import loginBg from "./login-bg.webp";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const LAST = "uvix:lastDesktopUser";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000 * 15); return () => clearInterval(t); }, []);
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (
    <div>
      <div className="dl-clock" data-testid="dl-clock">{hm}</div>
      <div className="dl-date">{DAYS[now.getDay()]}, {now.getDate()}-{MONTHS[now.getMonth()]}</div>
    </div>
  );
}

function Av({ e, size = 40 }) {
  const c = avatarColor(e.id || e.name);
  return <span className="dl-av" style={{ width: size, height: size, color: c, background: `${c}1F` }} aria-hidden="true">{initials(e.name)}</span>;
}

export default function DesktopLogin({ employees, onAuthenticated }) {
  const [tab, setTab] = useState("pin");
  const [step, setStep] = useState("main"); // main | forgot | newpin
  const [pending, setPending] = useState(null); // vaqtinchalik PIN bilan kirgan xodim
  const lastId = (() => { try { return localStorage.getItem(LAST); } catch { return null; } })();
  // Oxirgi kirgan xodim tanlangan turadi; yangi kompyuterda — hech kim (ro'yxat yashirin). Bitta xodim bo'lsa — o'zi.
  const [selId, setSelId] = useState(() => employees.find((e) => e.id === lastId)?.id || (employees.length === 1 ? employees[0].id : null));
  useEffect(() => { if (!selId && employees.length === 1) setSelId(employees[0].id); }, [employees, selId]);
  const sel = employees.find((e) => e.id === selId) || null;

  const done = useCallback((user) => {
    try { localStorage.setItem(LAST, user.id); } catch { /* shart emas */ }
    if (user.mustChangePin) { setPending(user); setStep("newpin"); return; }
    onAuthenticated(user);
  }, [onAuthenticated]);

  return (
    <div className="dl-root" data-testid="desktop-login">
      <aside className="dl-left" style={{ backgroundImage: `url(${loginBg})` }}>
        <div className="dl-shade" />
        <div className="dl-brand"><span className="dl-mark">UV</span><div><b>UVIX</b><span>Moliya va ishlab chiqarish</span></div></div>
        {/* soat — osmonda (pastda shahar ko'rinib tursin) */}
        <div className="dl-left-top"><Clock /></div>
      </aside>
      <main className="dl-right">
        <div className="dl-panel">
          {step === "forgot" ? (
            <div className="ul-root dl-embed"><div className="ul-panel"><ForgotStep employee={sel} employees={employees} onBack={() => setStep("main")} onDone={(e) => { setSelId(e.id); setStep("main"); setTab("pin"); }} /></div></div>
          ) : step === "newpin" && pending ? (
            <div className="ul-root dl-embed"><div className="ul-panel"><NewPinStep employee={pending} onDone={() => { const u = { ...pending }; delete u.mustChangePin; onAuthenticated(u); }} /></div></div>
          ) : (
            <>
              <h1 className="dl-title">Xush kelibsiz</h1>
              <p className="dl-sub">Kirish usulini tanlang</p>
              <div className="dl-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "pin"} className={tab === "pin" ? "on" : ""} onClick={() => setTab("pin")} data-testid="dl-tab-pin"><Lock size={16} /> PIN bilan</button>
                <button type="button" role="tab" aria-selected={tab === "qr"} className={tab === "qr" ? "on" : ""} onClick={() => setTab("qr")} data-testid="dl-tab-qr"><QrCode size={16} /> Telefon bilan</button>
              </div>
              {tab === "pin"
                ? <PinPane employees={employees} sel={sel} setSelId={setSelId} onDone={done} onForgot={() => setStep("forgot")} />
                : <QrPane onDone={done} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function PinPane({ employees, sel, setSelId, onDone, onForgot }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const idx = employees.findIndex((e) => e.id === sel?.id);
  const choose = (e) => { if (e) { setSelId(e.id); setPin(""); setErr(""); } };
  const pick = (i) => choose(employees[(i + employees.length) % employees.length]);
  async function submit(value = pin) {
    if (busy || !sel || value.length < 4) return;
    setBusy(true); setErr("");
    try { const user = await authLogin(sel.id, value); onDone(user); }
    catch (e) { setErr(e.status === 429 ? e.message : e.status === 401 && e.message?.includes("Vaqtinchalik") ? e.message : "PIN noto'g'ri. Qaytadan kiriting."); setPin(""); setShake(true); setTimeout(() => setShake(false), 400); }
    finally { setBusy(false); }
  }
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e) {
      if (open || e.metaKey || e.ctrlKey || e.altKey) return; // ochiq ro'yxat o'z tugmalarini o'zi boshqaradi
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
      if (/^\d$/.test(e.key)) {
        if (!sel) { setErr("Avval xodimni tanlang"); setOpen(true); return; }
        setErr(""); setPin((p) => (p.length >= 6 ? p : p + e.key));
      }
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") { if (sel) submit(); else setOpen(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); pick(idx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); pick(idx - 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const slots = Math.max(4, pin.length);
  return (
    <div className="dl-pin">
      <PersonSelect employees={employees} sel={sel} open={open} setOpen={setOpen} onPick={(e) => { choose(e); setOpen(false); }} />
      <div className={`dl-pinwrap${sel ? "" : " off"}`}>
        <div className="dl-pinlabel">PIN kod</div>
        <div className={`dl-boxes${shake ? " shake" : ""}${err && sel ? " err" : ""}`} data-testid="dl-pin-boxes" style={{ "--n": slots }} onClick={() => document.activeElement?.blur?.()}>
          {Array.from({ length: slots }).map((_, i) => <span key={i} className={i < pin.length ? "f" : sel && i === pin.length ? "cur" : ""}>{i < pin.length ? "•" : ""}</span>)}
        </div>
      </div>
      <div className={`dl-msg${err ? " err" : ""}`} aria-live="polite">{err || (busy ? "Tekshirilmoqda…" : sel ? "PIN'ni klaviaturada yozing" : "Xodimni tanlang — keyin PIN")}</div>
      <button type="button" className="dl-primary" onClick={() => submit()} disabled={busy || pin.length < 4 || !sel} data-testid="dl-login">{busy ? <Loader2 size={18} className="ul-spin" /> : "Kirish"}</button>
      <div className="dl-foot">
        <button type="button" className="dl-link" onClick={onForgot}>PIN'ni unutdingizmi?</button>
        {employees.length > 1 && <span className="dl-keys"><kbd>↑</kbd><kbd>↓</kbd> xodimni almashtirish</span>}
      </div>
    </div>
  );
}

// Yig'iladigan xodim tanlash: odatda bitta qator (tanlangan xodim), bosilganda ro'yxat ustiga ochiladi.
function PersonSelect({ employees, sel, open, setOpen, onPick }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const showSearch = employees.length > 5;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? employees.filter((e) => `${e.name} ${roleLabel(e.role)}`.toLowerCase().includes(t)) : employees;
  }, [employees, q]);
  useEffect(() => {
    if (!open) return undefined;
    setQ("");
    setHi(Math.max(0, employees.findIndex((e) => e.id === sel?.id)));
    const t = setTimeout(() => (inputRef.current || listRef.current)?.focus(), 0);
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDown); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(".hi")?.scrollIntoView({ block: "nearest" }); }, [hi, open]);
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (list[hi]) onPick(list[hi]); }
  }
  return (
    <div className="dl-select" ref={boxRef}>
      <button type="button" className={`dl-trigger${open ? " open" : ""}${sel ? "" : " empty"}`} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} data-testid="dl-person">
        {sel ? <Av e={sel} /> : <span className="dl-av dl-av-ph"><UserRound size={19} /></span>}
        <span className="dl-pname">
          {sel ? <><b>{sel.name}</b><small>{sel.role === "admin" && <ShieldCheck size={11} />} {roleLabel(sel.role)}</small></>
            : <><b className="ph">Xodimni tanlang</b><small>{employees.length} ta xodim</small></>}
        </span>
        <span className="dl-chev">{sel && !open && employees.length > 1 && <em>Almashtirish</em>}<i><ChevronDown size={16} /></i></span>
      </button>
      {open && (
        <div className="dl-pop" role="dialog" aria-label="Xodimni tanlash" onKeyDown={onKey}>
          {showSearch && (
            <label className="dl-search"><Search size={16} />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism bo'yicha qidirish…" aria-label="Xodimni qidirish" data-testid="dl-person-search" />
              <kbd>Esc</kbd>
            </label>
          )}
          <div className="dl-options" role="listbox" ref={listRef} tabIndex={showSearch ? -1 : 0} aria-label="Xodimlar">
            {list.length === 0 && <div className="dl-none">Topilmadi</div>}
            {list.map((e, i) => (
              <button key={e.id} type="button" role="option" aria-selected={e.id === sel?.id} className={`${i === hi ? "hi" : ""}${e.id === sel?.id ? " on" : ""}`}
                onMouseEnter={() => setHi(i)} onClick={() => onPick(e)} data-person={e.id}>
                <Av e={e} size={34} />
                <span className="dl-oname">{e.name}</span>
                <small>{roleLabel(e.role)}</small>
                {e.id === sel?.id && <Check size={15} className="dl-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QrPane({ onDone }) {
  const [s, setS] = useState(null); // { id, key, svg, expiresAt }
  const [status, setStatus] = useState("loading"); // loading | pending | scanned | expired | rejected | error
  const [by, setBy] = useState("");
  const [left, setLeft] = useState(60);
  const gen = useRef(0);
  const start = useCallback(async () => {
    const my = ++gen.current;
    setStatus("loading"); setBy("");
    try { const r = await qrStart(); if (my !== gen.current) return; setS(r); setStatus("pending"); }
    catch { if (my === gen.current) setStatus("error"); }
  }, []);
  useEffect(() => { start(); return () => { gen.current++; }; }, [start]);
  // Tasdiqni kutish + 60 soniyada yangilash
  useEffect(() => {
    if (!s || (status !== "pending" && status !== "scanned")) return undefined;
    const my = gen.current;
    const t = setInterval(async () => {
      const sec = Math.max(0, Math.round((new Date(s.expiresAt).getTime() - Date.now()) / 1000));
      setLeft(sec);
      if (sec <= 0) { start(); return; }
      try {
        const r = await qrPoll(s.id, s.key);
        if (my !== gen.current) return;
        if (r.status === "approved" && r.employee) { gen.current++; onDone(r.mustChangePin ? { ...r.employee, mustChangePin: true } : r.employee); }
        else if (r.status === "scanned") { setStatus("scanned"); setBy(r.by || ""); }
        else if (r.status === "rejected") setStatus("rejected");
        else if (r.status === "expired") start();
      } catch { /* tarmoq — keyingi urinish */ }
    }, 1500);
    return () => clearInterval(t);
  }, [s, status, start, onDone]);
  return (
    <div className="dl-qr" data-testid="dl-qr">
      <div className="dl-qrcard">
        <div className="dl-qrbox">
          {status === "loading" ? <Loader2 size={28} className="ul-spin" />
            : status === "error" ? <button type="button" className="dl-link" onClick={start}><RefreshCw size={16} /> Qayta urinish</button>
              : status === "rejected" ? <div className="dl-qrmsg">Telefonda bekor qilindi<button type="button" className="dl-link" onClick={start}><RefreshCw size={15} /> Yangi QR</button></div>
                : <>
                  <div className="dl-qrsvg" data-testid="dl-qr-svg" dangerouslySetInnerHTML={{ __html: s?.svg || "" }} />
                  <span className="dl-qrlogo">UV</span>
                  {status === "scanned" && <div className="dl-qrscanned"><Loader2 size={22} className="ul-spin" /><b>{by || "Telefon"}</b><span>Face ID bilan tasdiqlanmoqda…</span></div>}
                </>}
        </div>
        <ol className="dl-steps">
          <li>Telefonda UVIX → <b>Kompyuterga kirish</b></li>
          <li>Shu kodni skanerlang</li>
          <li>Face ID bilan tasdiqlang</li>
        </ol>
      </div>
      <div className="dl-wait"><span className="dot" />{status === "scanned" ? "Telefonda tasdiq kutilmoqda…" : "Telefondan skanerlash kutilmoqda…"} · kod {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} dan keyin yangilanadi</div>
      <p className="dl-note">Kim tasdiqlasa — o'sha telefonning egasi kiradi. PIN kerak emas. Telefoningizda Face ID yoqilmagan bo'lsa, PIN so'raladi.</p>
    </div>
  );
}
