// LoginScreen.jsx — xodimni tanlash → PIN klaviatura yoki Face ID → (ixtiyoriy) Face ID'ni yoqish
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, Delete, ScanFace, Fingerprint, Loader2, ShieldCheck, Send, UserCog, KeyRound } from "lucide-react";
import { authLogin, authLoginByName, pinRecoveryOptions, pinRecoveryTelegram, pinRecoveryVerify, pinAskAdmin, setMyPin } from "../storage.js";
import {
  canUseBiometrics, biometricLabel, isEnrolledHere, wasSkipped, markSkipped, isCancel,
  prepareLogin, loginWithPrepared, prepareEnroll, enrollWithPrepared, lastBioUser, makePreparer,
} from "./passkey.js";
import "./login.css";
import DesktopLogin from "./DesktopLogin.jsx";

// Katta ekranli kompyuter (sichqoncha bilan) — ikki qismli ekran; telefon/planshet — PIN klaviatura
const isDesktop = () => typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1000px) and (pointer: fine)").matches;
import { roleLabel } from "../constants.js";

const AVATAR_COLORS = ["#1F5FD6", "#0E7490", "#B45309", "#15803D", "#6D28D9", "#BE185D", "#C2410C", "#475569"];

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

export default function LoginScreen(props) {
  const [desk] = useState(isDesktop);
  if (desk && props.employees.length > 0) return <DesktopLogin {...props} />;
  return <MobileLogin {...props} />;
}

function MobileLogin({ employees, onAuthenticated }) {
  const [step, setStep] = useState("pick"); // pick | quick | pin | offer | forgot | newpin
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const bio = useMemo(() => biometricLabel(), []);

  useEffect(() => { canUseBiometrics().then(setBioAvailable); }, []);

  // Shu telefonda oldin biometrik bilan kirgan xodim bo'lsa — ro'yxat va PIN'siz, darhol Face ID
  const quickDone = useRef(false);
  useEffect(() => {
    if (quickDone.current || !bioAvailable) return;
    const last = lastBioUser();
    const emp = last && employees.find((e) => e.id === last.id);
    if (!emp || !emp.hasPasskey || !isEnrolledHere(emp.id)) return;
    if (step === "pick" || (step === "pin" && employees.length === 1)) {
      quickDone.current = true;
      setSelected(emp);
      setStep("quick");
    }
  }, [bioAvailable, employees, step]);

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
  const afterLogin = useCallback(async (user, via, opts = {}) => {
    // Vaqtinchalik PIN bilan kirildi — avval o'z PIN'ini qo'yadi
    if (user.mustChangePin) {
      setSelected((s) => ({ ...(s || {}), ...user, _via: via, _opts: opts }));
      setStep("newpin");
      return;
    }
    // PIN oynasidagi Face ID belgisi bosilgan bo'lsa — "Hozir emas" deyilgan bo'lsa ham yoqishni taklif qilamiz
    if (via === "pin" && bioAvailable && !isEnrolledHere(user.id) && (opts.wantBio || !wasSkipped(user.id))) {
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

            {employees.length > 0 && (
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
            bioAvailable={bioAvailable}
            bioReady={bioAvailable && !!selected.hasPasskey}
            onSuccess={afterLogin}
            onForgot={selected.manual ? null : () => setStep("forgot")}
          />
        )}

        {step === "quick" && selected && (
          <QuickStep
            employee={selected}
            bio={bio}
            onSuccess={afterLogin}
            onPin={() => setStep("pin")}
            onOther={employees.length > 1 ? back : null}
          />
        )}

        {step === "offer" && selected && (
          <OfferStep employee={selected} bio={bio} onDone={() => onAuthenticated(selected)} />
        )}

        {step === "forgot" && (
          <ForgotStep employee={selected && !selected.manual ? selected : null} employees={employees}
            onBack={() => setStep(selected ? "pin" : "pick")} onDone={(emp) => { setSelected(emp); setStep("pin"); }} />
        )}

        {step === "newpin" && selected && (
          <NewPinStep employee={selected} onDone={() => { const u = { ...selected }; const via = u._via, opts = u._opts; delete u._via; delete u._opts; delete u.mustChangePin; afterLogin(u, via, opts); }} />
        )}
      </main>
    </div>
  );
}

// So'rovni oldindan tayyorlab, eskirsa (4 daq.) va ilovaga qaytilganda yangilab turadi
function usePreparer(fetcher) {
  const ref = useRef(null);
  const key = fetcher ? "on" : "off";
  if (!ref.current || ref.current.key !== key) ref.current = { key, p: fetcher ? makePreparer(fetcher) : { get: async () => null, refresh() {}, invalidate() {} } };
  const p = ref.current.p;
  useEffect(() => {
    if (!fetcher) return;
    p.refresh();
    const t = setInterval(() => p.refresh(), 4 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") p.refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  return p;
}

/* ================= Tezkor kirish: shu telefonda Face ID yoqilgan xodim ================= */
function QuickStep({ employee, bio, onSuccess, onPin, onOther }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preparer = usePreparer(() => prepareLogin(employee.id));
  const tried = useRef(false);

  async function go(auto = false) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const p = await preparer.get();
      if (!p) { if (!auto) setError(`${bio.name} hozir ishlamayapti. PIN bilan kiring.`); return; }
      preparer.invalidate();
      const user = await loginWithPrepared(p);
      await onSuccess(user, "bio");
    } catch (e) {
      // Avtomatik urinishni brauzer to'sishi mumkin (tugma bosilmagan) — unda shunchaki tugma kutadi
      if (!auto) setError(isCancel(e) ? "Bekor qilindi. Qayta urining yoki PIN bilan kiring." : (e.message || `${bio.name} bilan kirib bo'lmadi`));
    } finally {
      setBusy(false);
      preparer.refresh();
    }
  }
  // Ilova ochilishi bilan bir marta o'zi so'raydi (Android/Chrome'da ishlaydi; iPhone'da tugma bosiladi)
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const t = setTimeout(() => go(true), 350);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="ul-step ul-offer" aria-label={`${bio.name} bilan kirish`}>
      <div className="ul-who">
        <Avatar employee={employee} />
        <div className="ul-who-name">{employee.name}</div>
        <div className="ul-who-role">{roleLabel(employee.role)}</div>
      </div>
      <button className="ul-quick-bio" onClick={() => go(false)} disabled={busy} aria-label={`${bio.name} bilan kirish`}>
        {busy ? <Loader2 size={40} className="ul-spin" /> : <BioIcon kind={bio.kind} size={48} />}
      </button>
      <div className={`ul-msg${error ? " err" : ""}`} aria-live="polite">
        {error || (busy ? "Tasdiqlanmoqda…" : `Kirish uchun ${bio.kind === "face" ? "yuzingizni ko'rsating" : "barmog'ingizni qo'ying"}`)}
      </div>
      <button className="ul-primary bio" onClick={() => go(false)} disabled={busy}>
        <BioIcon kind={bio.kind} size={20} /> {bio.name} bilan kirish
      </button>
      <button className="ul-secondary" onClick={onPin} disabled={busy}>PIN bilan kirish</button>
      {onOther && <button className="ul-link" onClick={onOther}>Boshqa xodim</button>}
    </section>
  );
}

/* ================= PIN + Face ID ================= */
function PinStep({ employee, canGoBack, onBack, bio, bioAvailable, bioReady, onSuccess, onForgot }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pressed, setPressed] = useState(null);
  const [wantBio, setWantBio] = useState(false); // Face ID belgisi bosildi, lekin hali yoqilmagan
  const preparer = usePreparer(bioReady ? () => prepareLogin(employee.id) : null);

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
      await onSuccess(user, "pin", { wantBio });
    } catch (e) {
      if (e.status === 429) { setLocked(true); fail(e.message || "Juda ko'p urinish. 10 daqiqadan so'ng qayta urinib ko'ring."); }
      else if (String(e.message || "").includes("Vaqtinchalik")) fail(e.message);
      else fail("PIN noto'g'ri. Qaytadan kiriting.");
    } finally {
      setBusy(false);
    }
  }

  // PIN klaviaturasidagi Face ID tugmasi: yoqilgan bo'lsa — kiradi, bo'lmasa — PIN'dan keyin yoqishni tayyorlaydi
  function bioKey() {
    if (bioReady) return biometric();
    setWantBio(true);
    setError("");
  }

  async function biometric() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const p = await preparer.get();
      if (!p) { setError(`${bio.name} hozir ishlamayapti. PIN bilan kiring.`); return; }
      preparer.invalidate(); // bir martalik
      const user = await loginWithPrepared(p);
      await onSuccess(user, "bio");
    } catch (e) {
      if (isCancel(e)) { setError(`Bekor qilindi yoki bu telefonda ${bio.name} topilmadi. PIN bilan kiring — kerak bo'lsa qayta yoqamiz.`); setWantBio(true); }
      else setError(e.message || `${bio.name} bilan kirib bo'lmadi`);
    } finally {
      setBusy(false);
      preparer.refresh();
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
        {error || (busy ? "Tekshirilmoqda…" : wantBio && !bioReady ? `${bio.name} hali yoqilmagan — PIN'ni kiriting, kirgach bir bosishda yoqamiz` : "PIN kodingizni kiriting")}
      </div>

      <div className="ul-pad">
        {keys.map((k) => (
          <button key={k} className={`ul-key${pressed === k ? " pressed" : ""}`} onClick={() => press(k)} disabled={locked} aria-label={k}>{k}</button>
        ))}
        {bioAvailable && !employee.manual ? (
          <button className={`ul-key ghost bio${wantBio ? " armed" : ""}`} onClick={bioKey} disabled={busy} aria-label={`${bio.name} bilan kirish`} title={`${bio.name} bilan kirish`}>
            <BioIcon kind={bio.kind} size={30} />
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
  const preparer = usePreparer(prepareEnroll);
  // Server biometrik kirishga tayyor bo'lmasa (masalan, domen sozlanmagan) — taklifni ko'rsatmay ilovaga o'tamiz
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    preparer.get().then((p) => { if (!alive) return; if (p) setReady(true); else onDone(); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function enable() {
    setBusy(true);
    setError("");
    try {
      const p = await preparer.get();
      if (!p) throw new Error("Server bilan bog'lanib bo'lmadi, qaytadan urinib ko'ring");
      preparer.invalidate();
      await enrollWithPrepared(p, employee);
      setDone(true);
      setTimeout(onDone, 900);
    } catch (e) {
      preparer.refresh();
      setError(isCancel(e) ? "Bekor qilindi. Keyinroq Sozlamalardan ham yoqishingiz mumkin." : (e.message || "Yoqib bo'lmadi"));
    } finally {
      setBusy(false);
    }
  }
  function later() {
    markSkipped(employee.id);
    onDone();
  }

  if (!ready) return <section className="ul-step ul-offer"><Loader2 size={28} className="ul-spin" /></section>;
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

/* ================= PIN tiklash: Telegram kodi yoki admindan so'rash ================= */
export function ForgotStep({ employee: initial, employees, onBack, onDone }) {
  const [emp, setEmp] = useState(initial);
  const [opts, setOpts] = useState(null);
  const [stage, setStage] = useState("choose"); // choose | code | asked | done
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!emp) return;
    let alive = true;
    setOpts(null); setError("");
    pinRecoveryOptions(emp.id).then((o) => { if (alive) setOpts(o); }).catch((e) => { if (alive) { setOpts({ telegram: null }); setError(e.message); } });
    return () => { alive = false; };
  }, [emp]);

  async function viaTelegram() {
    setBusy(true); setError("");
    try { const r = await pinRecoveryTelegram(emp.id); setSentTo(r.sentTo || "Telegram"); setStage("code"); }
    catch (e) { setError(e.message || "Kodni yuborib bo'lmadi"); }
    finally { setBusy(false); }
  }
  async function askAdmin() {
    setBusy(true); setError("");
    try { await pinAskAdmin(emp.id); setStage("asked"); }
    catch (e) { setError(e.message || "Yuborib bo'lmadi"); }
    finally { setBusy(false); }
  }
  async function confirm(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Telegram'dagi 6 xonali kodni kiriting");
    if (!/^\d{4,6}$/.test(newPin)) return setError("Yangi PIN 4–6 xonali raqam bo'lishi kerak");
    setBusy(true); setError("");
    try { await pinRecoveryVerify(emp.id, code, newPin); setStage("done"); }
    catch (err) { setError(err?.message || "Kod noto'g'ri yoki muddati o'tgan"); }
    finally { setBusy(false); }
  }

  const title = stage === "done" ? "PIN yangilandi" : stage === "asked" ? "So'rov yuborildi" : "PIN'ni tiklash";
  return (
    <section className="ul-step" aria-labelledby="ul-forgot-title" data-testid="forgot-step">
      <button className="ul-back" onClick={stage === "code" ? () => setStage("choose") : onBack}><ArrowLeft size={16} /> Orqaga</button>
      <h1 id="ul-forgot-title" className="ul-title">{title}</h1>

      {!emp && (
        <>
          <p className="ul-sub">Avval ismingizni tanlang</p>
          <div className="ul-people" role="list">
            {employees.map((e) => (
              <button key={e.id} className="ul-person" role="listitem" onClick={() => setEmp(e)}>
                <Avatar employee={e} /><span className="ul-name" title={e.name}>{e.name}</span><span className="ul-role">{roleLabel(e.role)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {emp && stage === "choose" && (
        <>
          <div className="ul-who" style={{ marginBottom: 14 }}><Avatar employee={emp} /><div className="ul-who-name">{emp.name}</div></div>
          {!opts ? <Loader2 size={22} className="ul-spin" /> : (
            <div className="ul-recover">
              {opts.telegram ? (
                <button className="ul-option" onClick={viaTelegram} disabled={busy} data-testid="recover-telegram">
                  <span className="ul-option-ic tg"><Send size={18} /></span>
                  <span><b>Telegram'ga kod yuborish</b><small>Kod {opts.telegram} ga keladi</small></span>
                </button>
              ) : (
                <div className="ul-note">Telegram ulanmagan — kod yuborib bo'lmaydi. Kirgach, Sozlamalarda «Telegram'ni ulash»ni bosing: keyingi safar shu yo'l ishlaydi.</div>
              )}
              <button className="ul-option" onClick={askAdmin} disabled={busy} data-testid="recover-admin">
                <span className="ul-option-ic"><UserCog size={18} /></span>
                <span><b>Admindan so'rash</b><small>{opts.askedAdmin ? "So'rov allaqachon yuborilgan — qayta eslatish" : "Administrator vaqtinchalik PIN beradi"}</small></span>
              </button>
              {emp.role === "admin" && !opts.telegram && <div className="ul-note">Siz administratorsiz: boshqa admin yordam bera oladi yoki serverda <code>node reset-admin-pin.js</code> ishga tushiriladi.</div>}
            </div>
          )}
          <div className="ul-msg err" aria-live="polite">{error}</div>
        </>
      )}

      {emp && stage === "code" && (
        <form onSubmit={confirm}>
          <p className="ul-sub">Kod <b>{sentTo}</b> ga yuborildi. U 10 daqiqa amal qiladi.</p>
          <div className="ul-field">
            <label htmlFor="ul-code">Telegram'dagi kod</label>
            <input id="ul-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus data-testid="recover-code"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: "0.3em" }} />
          </div>
          <div className="ul-field">
            <label htmlFor="ul-newpin">Yangi PIN (4–6 raqam)</label>
            <input id="ul-newpin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} data-testid="recover-newpin"
              value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: "0.3em" }} />
          </div>
          <div className="ul-msg err" aria-live="polite">{error}</div>
          <button className="ul-primary" type="submit" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? <Loader2 size={18} className="ul-spin" /> : "PIN'ni yangilash"}
          </button>
          <button type="button" className="ul-link" onClick={viaTelegram} disabled={busy}>Kodni qayta yuborish</button>
        </form>
      )}

      {stage === "asked" && (
        <>
          <p className="ul-sub">Administratorga xabar yuborildi. U sizga <b>vaqtinchalik PIN</b> beradi — u bilan kirgach, o'zingizning yangi PIN'ingizni qo'yasiz.</p>
          <button className="ul-primary" onClick={() => onDone(emp)}>PIN kiritishga o'tish</button>
        </>
      )}

      {stage === "done" && (
        <>
          <p className="ul-sub">Endi yangi PIN bilan kirishingiz mumkin.</p>
          <button className="ul-primary" onClick={() => onDone(emp)}>Kirish</button>
        </>
      )}
    </section>
  );
}

/* ================= Vaqtinchalik PIN'dan keyin — o'z PIN'ini qo'yish (majburiy) ================= */
export function NewPinStep({ employee, onDone }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(a)) return setError("PIN 4–6 xonali raqam bo'lishi kerak");
    if (a !== b) return setError("Ikkala PIN bir xil emas");
    setBusy(true); setError("");
    try { await setMyPin(a); onDone(); }
    catch (err) { setError(err?.message || "Saqlab bo'lmadi"); }
    finally { setBusy(false); }
  }
  return (
    <section className="ul-step" aria-labelledby="ul-newpin-title" data-testid="newpin-step">
      <div className="ul-offer-icon"><KeyRound size={36} /></div>
      <h1 id="ul-newpin-title" className="ul-title">O'z PIN'ingizni qo'ying</h1>
      <p className="ul-sub">{employee.name}, siz vaqtinchalik PIN bilan kirdingiz. Davom etish uchun yangi PIN o'ylab toping — uni faqat siz bilasiz.</p>
      <form onSubmit={save}>
        <div className="ul-field">
          <label htmlFor="ul-np1">Yangi PIN (4–6 raqam)</label>
          <input id="ul-np1" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} autoFocus data-testid="newpin-a"
            value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: "0.3em" }} />
        </div>
        <div className="ul-field">
          <label htmlFor="ul-np2">PIN'ni takrorlang</label>
          <input id="ul-np2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} data-testid="newpin-b"
            value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ""))} style={{ letterSpacing: "0.3em" }} />
        </div>
        <div className="ul-msg err" aria-live="polite">{error}</div>
        <button className="ul-primary" type="submit" disabled={busy} style={{ marginTop: 6 }} data-testid="newpin-save">
          {busy ? <Loader2 size={18} className="ul-spin" /> : "Saqlash va kirish"}
        </button>
      </form>
    </section>
  );
}
