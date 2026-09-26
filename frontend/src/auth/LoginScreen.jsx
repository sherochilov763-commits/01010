// LoginScreen.jsx — xodimni tanlash → PIN klaviatura yoki Face ID → (ixtiyoriy) Face ID'ni yoqish
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, Delete, ScanFace, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { authLogin, authLoginByName } from "../storage.js";
import {
  canUseBiometrics, biometricLabel, isEnrolledHere, wasSkipped, markSkipped, isCancel,
  prepareLogin, loginWithPrepared, prepareEnroll, enrollWithPrepared,
} from "./passkey.js";
import "./login.css";
import { roleLabel } from "../constants.js";

const AVATAR_COLORS = ["#7C5CFC", "#2DD4EE", "#F472B6", "#34D399", "#FBBF24", "#60A5FA", "#A78BFA", "#FB923C"];

export function avatarColor(seed = "") {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function Avatar({ employee }) {
  return (
    <span className="ul-avatar" style={{ "--c": avatarColor(employee.id || employee.name) }} aria-hidden="true">
      {initials(employee.name)}
    </span>
  );
}

function BioIcon({ kind, size = 24 }) {
  return kind === "face" ? <ScanFace size={size} strokeWidth={1.6} /> : <Fingerprint size={size} strokeWidth={1.6} />;
}

export default function LoginScreen({ employees, onAuthenticated, onRequestPinReset, onConfirmPinReset }) {
  const [step, setStep] = useState("pick"); // pick | pin | offer | forgot
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const bio = useMemo(() => biometricLabel(), []);

  useEffect(() => { canUseBiometrics().then(setBioAvailable); }, []);

  // Kichik jamoada qidiruv shart emas
  const showSearch = employees.length > 6;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? employees.filter((e) => e.name.toLowerCase().includes(q)) : employees;
  }, [employees, query]);

  // Faqat bitta xodim bo'lsa — darhol PIN'ga o'tamiz
  useEffect(() => {
    if (employees.length === 1 && step === "pick" && !selected) choose(employees[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  function choose(emp) {
    setSelected(emp);
    setStep("pin");
  }
  function back() {
    setSelected(null);
    setStep("pick");
  }

  // PIN yoki Face ID bilan muvaffaqiyatli kirilgandan keyin
  const afterLogin = useCallback(async (user, via) => {
    if (via === "pin" && bioAvailable && !isEnrolledHere(user.id) && !wasSkipped(user.id)) {
      setSelected((s) => ({ ...(s || {}), ...user }));
      setStep("offer");
      return;
    }
    onAuthenticated(user);
  }, [bioAvailable, onAuthenticated]);

  return (
    <div className="ul-root">
      <main className="ul-panel">
        <div className="ul-brand">
          <span className="ul-mark">UV</span>
          <span className="ul-wordmark">UVIX <span>Moliya</span></span>
        </div>

        {step === "pick" && (
          <section className="ul-step" aria-labelledby="ul-pick-title">
            <h1 id="ul-pick-title" className="ul-title">Kim kiryapti?</h1>
            <p className="ul-sub">Ismingizni tanlang</p>

            {employees.length === 0 ? (
              // Ro'yxat yuklanmadi — qo'lda ism kiritish
              <form onSubmit={(e) => { e.preventDefault(); if (manualName.trim()) choose({ name: manualName.trim(), manual: true }); }}>
                <div className="ul-field">
                  <label htmlFor="ul-manual">Ismingiz</label>
                  <input id="ul-manual" autoFocus value={manualName} onChange={(e) => setManualName(e.target.value)} autoComplete="username" />
                </div>
                <button className="ul-primary" type="submit" disabled={!manualName.trim()}>Davom etish</button>
              </form>
            ) : (
              <>
                {showSearch && (
                  <input className="ul-search" type="search" placeholder="Ism bo'yicha qidirish" value={query}
                    onChange={(e) => setQuery(e.target.value)} aria-label="Xodimni qidirish" />
                )}
                <div className="ul-people" role="list">
                  {visible.map((e) => (
                    <button key={e.id} className="ul-person" role="listitem" onClick={() => choose(e)}>
                      <Avatar employee={e} />
                      <span className="ul-name" title={e.name}>{e.name}</span>
                      <span className="ul-role">
                        {e.role === "admin" && <ShieldCheck size={11} />}
                        {roleLabel(e.role)}
                      </span>
                    </button>
                  ))}
                </div>
                {visible.length === 0 && <div className="ul-empty">"{query}" ismli xodim topilmadi</div>}
              </>
            )}

            {onRequestPinReset && (
              <button className="ul-link" style={{ marginTop: 28 }} onClick={() => setStep("forgot")}>
                PIN'ni unutdingizmi?
              </button>
            )}
          </section>
        )}

        {step === "pin" && selected && (
          <PinStep
            key={selected.id || selected.name}
            employee={selected}
            canGoBack={employees.length > 1 || employees.length === 0}
            onBack={back}
            bio={bio}
            bioReady={bioAvailable && !!selected.hasPasskey}
            onSuccess={afterLogin}
            onForgot={onRequestPinReset ? () => setStep("forgot") : null}
          />
        )}

        {step === "offer" && selected && (
          <OfferStep employee={selected} bio={bio} onDone={() => onAuthenticated(selected)} />
        )}

        {step === "forgot" && (
          <ForgotStep onBack={() => setStep(selected ? "pin" : "pick")} onRequest={onRequestPinReset} onConfirm={onConfirmPinReset} />
        )}
      </main>
    </div>
  );
}

/* ================= PIN + Face ID ================= */
function PinStep({ employee, canGoBack, onBack, bio, bioReady, onSuccess, onForgot }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pressed, setPressed] = useState(null);
  const prepared = useRef(null);
  const enrolledHere = isEnrolledHere(employee.id);

  // Face ID uchun challenge'ni oldindan tayyorlab qo'yamiz (Safari talabi)
  const prepare = useCallback(async () => {
    prepared.current = null;
    if (!bioReady) return;
    try { prepared.current = await prepareLogin(employee.id); } catch { prepared.current = null; }
  }, [bioReady, employee.id]);
  useEffect(() => { prepare(); }, [prepare]);

  function fail(msg) {
    setError(msg);
    setPin("");
    setShake(true);
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    setTimeout(() => setShake(false), 400);
  }

  async function submit(value = pin) {
    if (busy || locked || value.length < 4) return;
    setBusy(true);
    setError("");
    try {
      const user = employee.manual ? await authLoginByName(employee.name, value) : await authLogin(employee.id, value);
      await onSuccess(user, "pin");
    } catch (e) {
      if (e.status === 429) { setLocked(true); fail(e.message || "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring."); }
      else fail("PIN noto'g'ri. Qaytadan kiriting.");
    } finally {
      setBusy(false);
    }
  }

  async function biometric() {
    if (busy) return;
    setError("");
    if (!prepared.current) await prepare();
    if (!prepared.current) return setError(`${bio.name} hozir ishlamayapti. PIN bilan kiring.`);
    setBusy(true);
    try {
      const user = await loginWithPrepared(prepared.current);
      await onSuccess(user, "bio");
    } catch (e) {
      if (isCancel(e)) setError("Bekor qilindi. PIN bilan ham kirishingiz mumkin.");
      else setError(e.message || `${bio.name} bilan kirib bo'lmadi`);
      prepare();
    } finally {
      setBusy(false);
    }
  }

  const press = useCallback((d) => {
    setError("");
    setPin((p) => (p.length >= 6 ? p : p + d));
  }, []);
  const erase = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  // Jismoniy klaviatura
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { press(e.key); flash(e.key); }
      else if (e.key === "Backspace") { erase(); flash("del"); }
      else if (e.key === "Enter") submit();
      else if (e.key === "Escape" && canGoBack) onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function flash(k) { setPressed(k); setTimeout(() => setPressed(null), 110); }

  const slots = Math.max(4, pin.length);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <section className="ul-step" aria-label="PIN kiritish">
      {canGoBack && (
        <button className="ul-back" onClick={onBack}><ArrowLeft size={16} /> Boshqa xodim</button>
      )}
      <div className="ul-who">
        <Avatar employee={employee} />
        <div className="ul-who-name">{employee.name}</div>
        {!employee.manual && <div className="ul-who-role">{roleLabel(employee.role)}</div>}
      </div>

      <div className={`ul-dots${error ? " err" : ""}${shake ? " shake" : ""}`} role="status" aria-label={`${pin.length} ta raqam kiritildi`}>
        {Array.from({ length: slots }).map((_, i) => <span key={i} className={`ul-dot${i < pin.length ? " on" : ""}`} />)}
      </div>
      <div className={`ul-msg${error ? " err" : ""}`} aria-live="polite">
        {error || (busy ? "Tekshirilmoqda…" : "PIN kodingizni kiriting")}
      </div>

      {bioReady && enrolledHere && (
        <button className="ul-primary bio" onClick={biometric} disabled={busy}>
          <BioIcon kind={bio.kind} size={20} /> {bio.name} bilan kirish
        </button>
      )}

      <div className={`ul-pad${bioReady && enrolledHere ? " compact" : ""}`}>
        {keys.map((k) => (
          <button key={k} className={`ul-key${pressed === k ? " pressed" : ""}`} onClick={() => press(k)} disabled={locked} aria-label={k}>{k}</button>
        ))}
        {bioReady && !enrolledHere ? (
          <button className="ul-key ghost bio" onClick={biometric} disabled={busy} aria-label={`${bio.name} bilan kirish`}>
            <BioIcon kind={bio.kind} size={26} />
          </button>
        ) : <span className="ul-key ul-key-spacer" aria-hidden="true" />}
        <button className={`ul-key${pressed === "0" ? " pressed" : ""}`} onClick={() => press("0")} disabled={locked} aria-label="0">0</button>
        <button className={`ul-key ghost${pressed === "del" ? " pressed" : ""}`} onClick={erase} disabled={!pin} aria-label="Oxirgi raqamni o'chirish">
          <Delete size={24} strokeWidth={1.6} />
        </button>
      </div>

      <button className="ul-primary" onClick={() => submit()} disabled={pin.length < 4 || busy || locked}>
        {busy ? <Loader2 size={18} className="ul-spin" /> : "Kirish"}
      </button>
      {onForgot && <button className="ul-link" onClick={onForgot}>PIN'ni unutdingizmi?</button>}
    </section>
  );
}

/* ================= Face ID'ni yoqish taklifi ================= */
function OfferStep({ employee, bio, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const prepared = useRef(null);

  useEffect(() => {
    prepareEnroll().then((p) => { prepared.current = p; }).catch(() => { prepared.current = null; });
  }, []);

  async function enable() {
    setBusy(true);
    setError("");
    try {
      if (!prepared.current) prepared.current = await prepareEnroll();
      await enrollWithPrepared(prepared.current, employee.id);
      setDone(true);
      setTimeout(onDone, 900);
    } catch (e) {
      prepared.current = null;
      prepareEnroll().then((p) => { prepared.current = p; }).catch(() => {});
      setError(isCancel(e) ? "Bekor qilindi. Keyinroq Sozlamalardan ham yoqishingiz mumkin." : (e.message || "Yoqib bo'lmadi"));
    } finally {
      setBusy(false);
    }
  }
  function later() {
    markSkipped(employee.id);
    onDone();
  }

  return (
    <section className="ul-step ul-offer" aria-labelledby="ul-offer-title">
      <div className="ul-offer-icon"><BioIcon kind={bio.kind} size={44} /></div>
      <h1 id="ul-offer-title" className="ul-title">
        {done ? `${bio.name} yoqildi` : `Keyingi safar ${bio.name} bilan kiring`}
      </h1>
      <p className="ul-sub">
        {done
          ? "Endi PIN terish shart emas."
          : "PIN terish o'rniga bir qarash yoki teginish kifoya. Biometrik ma'lumotingiz shu qurilmadan chiqmaydi."}
      </p>
      {!done && (
        <>
          <button className="ul-primary" onClick={enable} disabled={busy}>
            {busy ? <Loader2 size={18} className="ul-spin" /> : `${bio.name}'ni yoqish`}
          </button>
          <button className="ul-secondary" onClick={later} disabled={busy}>Hozir emas</button>
          <div className="ul-msg err" style={{ marginTop: 14 }} aria-live="polite">{error}</div>
        </>
      )}
    </section>
  );
}

/* ================= PIN tiklash ================= */
function ForgotStep({ onBack, onRequest, onConfirm }) {
  const [stage, setStage] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!email.trim()) return setError("Email manzilini kiriting");
    setBusy(true); setError("");
    try {
      await onRequest(email.trim());
      setStage("code");
      setMsg(`Agar ${email.trim()} ro'yxatda bo'lsa, unga 6 xonali kod yuborildi. Kod 10 daqiqa amal qiladi.`);
    } catch (err) { setError(err?.message || "Kodni yuborib bo'lmadi"); }
    finally { setBusy(false); }
  }
  async function confirm(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Emaildagi 6 xonali kodni kiriting");
    if (!/^\d{4,6}$/.test(newPin)) return setError("Yangi PIN 4–6 xonali raqam bo'lishi kerak");
    setBusy(true); setError("");
    try {
      await onConfirm(email.trim(), code, newPin);
      setStage("done");
    } catch (err) { setError(err?.message || "Kod noto'g'ri yoki muddati o'tgan"); }
    finally { setBusy(false); }
  }

  return (
    <section className="ul-step" aria-labelledby="ul-forgot-title">
      <button className="ul-back" onClick={onBack}><ArrowLeft size={16} /> Orqaga</button>
      <h1 id="ul-forgot-title" className="ul-title">{stage === "done" ? "PIN yangilandi" : "PIN'ni tiklash"}</h1>

      {stage === "email" && (
        <form onSubmit={send}>
          <p className="ul-sub">Profilingizdagi email manzilini kiriting — unga tasdiqlash kodi keladi.</p>
          <div className="ul-field">
            <label htmlFor="ul-email">Email</label>
            <input id="ul-email" type="email" autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="ul-msg err" aria-live="polite">{error}</div>
          <button className="ul-primary" type="submit" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? <Loader2 size={18} className="ul-spin" /> : "Kod yuborish"}
          </button>
        </form>
      )}

      {stage === "code" && (
        <form onSubmit={confirm}>
          <p className="ul-sub">{msg}</p>
          <div className="ul-field">
            <label htmlFor="ul-code">Tasdiqlash kodi</label>
            <input id="ul-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: "0.3em" }} />
          </div>
          <div className="ul-field">
            <label htmlFor="ul-newpin">Yangi PIN (4–6 raqam)</label>
            <input id="ul-newpin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6}
              value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: "0.3em" }} />
          </div>
          <div className="ul-msg err" aria-live="polite">{error}</div>
          <button className="ul-primary" type="submit" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? <Loader2 size={18} className="ul-spin" /> : "PIN'ni yangilash"}
          </button>
        </form>
      )}

      {stage === "done" && (
        <>
          <p className="ul-sub">Endi yangi PIN bilan kirishingiz mumkin.</p>
          <button className="ul-primary" onClick={onBack}>Kirishga qaytish</button>
        </>
      )}
    </section>
  );
}
