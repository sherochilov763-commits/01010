// TelegramAccountSection.jsx — shaxsiy Telegram akkauntni (CRM chat) ulash va holatini ko'rish.
// Terminal yoki session string kerak emas: QR kod yoki telefon kodi orqali shu yerning o'zida ulanadi.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { Badge, Button, Card, Field, Modal, getInputStyle } from "../../components/ui.jsx";
import { connectTelegramUser, disconnectTelegramUser, fetchTelegramUserStatus, telegramLogin } from "../../storage.js";
import { THEME } from "../../theme.js";

function StatusBadge({ status }) {
  const s = status?.status;
  if (s === "connected") return <Badge color={THEME.green} bg={THEME.greenBg}>Ulangan</Badge>;
  if (s === "connecting") return <Badge color={THEME.amber} bg={THEME.amberBg}>Ulanmoqda...</Badge>;
  if (s === "expired") return <Badge color={THEME.rose} bg={THEME.roseBg}>Sessiya tugagan</Badge>;
  if (s === "error") return <Badge color={THEME.rose} bg={THEME.roseBg}>Xato</Badge>;
  return <Badge color={THEME.muted} bg={THEME.surface}>Ulanmagan</Badge>;
}

export function TelegramAccountSection({ settings, onSaveSettings }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  const refresh = () => fetchTelegramUserStatus().then(setStatus).catch(() => setStatus({ status: "error", message: "Holatni bilib bo'lmadi" }));
  useEffect(() => { refresh(); }, []);

  async function reconnect() {
    setBusy(true); setMsg("");
    try { await connectTelegramUser(); } catch (e) { setMsg(e.message); }
    await refresh();
    setBusy(false);
  }
  async function disconnect() {
    setBusy(true);
    await disconnectTelegramUser().catch(() => {});
    await refresh();
    setBusy(false);
  }

  const s = status?.status;
  const me = status?.me;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: THEME.blueBg || THEME.surface, color: THEME.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><MessageCircle size={17} /></div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>Telegram akkaunt (CRM chat)</div>
            <div style={{ fontSize: 11.5, color: THEME.muted }}>Mijozlar bilan yozishmalar shu akkaunt orqali</div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {s === "expired" && (
        <div data-testid="tg-expired" style={{ display: "flex", gap: 10, padding: 12, borderRadius: 12, background: THEME.roseBg, color: THEME.rose, fontSize: 12.5, marginBottom: 12 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b>Telegram ulanishi uzildi.</b> {status.message}
            <div style={{ color: THEME.text, opacity: 0.85, marginTop: 4 }}>Chatlar ishlashi uchun qayta ulang — 30 soniyalik ish.</div>
          </div>
        </div>
      )}
      {s === "connected" && me && (
        <div style={{ fontSize: 13, color: THEME.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={16} color={THEME.green} />
          <span><b>{me.name || "Akkaunt"}</b>{me.username ? ` · @${me.username}` : ""}{me.phone ? ` · +${String(me.phone).replace(/^\+/, "")}` : ""}</span>
        </div>
      )}
      {s === "error" && status.message && <div style={{ fontSize: 12, color: THEME.rose, marginBottom: 10 }}>{status.message}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {s !== "connected" && (
          <Button onClick={() => setLoginOpen(true)}><QrCode size={14} /> {s === "expired" ? "Qayta ulash" : "Akkauntni ulash"}</Button>
        )}
        {(s === "disconnected" || s === "error") && settings?.telegramUserApiId && (
          <Button variant="ghost" onClick={reconnect} disabled={busy}><RefreshCw size={14} /> Saqlangan sessiya bilan ulanish</Button>
        )}
        {s === "connected" && (
          <>
            <Button variant="ghost" onClick={() => setLoginOpen(true)}>Boshqa akkaunt ulash</Button>
            <Button variant="ghost" onClick={disconnect} disabled={busy}>Uzish</Button>
          </>
        )}
      </div>
      {msg && <div style={{ fontSize: 12, color: THEME.rose, marginTop: 8 }}>{msg}</div>}
      <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 12, lineHeight: 1.5 }}>
        Telegram'dagi «Qurilmalar» ro'yxatida <b>UVIX CRM (server)</b> nomi bilan ko'rinadi — uni o'chirmang.
        Bitta akkauntni bir vaqtda faqat shu serverda ishlating. <span style={{ color: THEME.rose }}>Norasmiy usul: akkaunt cheklanishi ehtimoli bor.</span>
      </div>

      {loginOpen && (
        <TelegramLoginModal
          settings={settings}
          onClose={() => { setLoginOpen(false); refresh(); }}
          onDone={(creds) => {
            // Brauzerdagi sozlamalar ham yangilansin — aks holda keyingi saqlashda server yozgani ustidan yozilardi
            const next = { ...settings, ...creds };
            delete next.telegramUserSession;
            onSaveSettings(next);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

function TelegramLoginModal({ settings, onClose, onDone }) {
  const [apiId, setApiId] = useState(settings?.telegramUserApiId || "");
  const [apiHash, setApiHash] = useState(settings?.telegramUserApiHash || "");
  const needCreds = !settings?.telegramUserApiId || !settings?.telegramUserApiHash;
  const [credsOk, setCredsOk] = useState(!needCreds);
  // Telefonda QR kodni shu telefonning o'zi bilan skanerlab bo'lmaydi — u yerda kod orqali ulash qulayroq
  const onPhone = typeof window !== "undefined" && window.matchMedia?.("(max-width: 860px)").matches;
  const [method, setMethod] = useState(onPhone ? "phone" : "qr");
  const [state, setState] = useState({ stage: "idle" });
  const [err, setErr] = useState("");
  const [phone, setPhone] = useState(settings?.telegramUserPhone ? `+${String(settings.telegramUserPhone).replace(/^\+/, "")}` : "+998");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const doneRef = useRef(false);

  const creds = { apiId: String(apiId).trim(), apiHash: String(apiHash).trim() };

  async function call(step, body) {
    setErr(""); setSending(true);
    try { setState(await telegramLogin(step, { ...creds, ...body })); }
    catch (e) { setErr(e.message); }
    finally { setSending(false); }
  }

  // QR bosqichida avtomatik boshlaymiz
  useEffect(() => {
    if (credsOk && method === "qr") call("qr");
  }, [credsOk, method]); // eslint-disable-line react-hooks/exhaustive-deps

  // Holatni kuzatib boramiz (QR yangilanadi, skanerlangach "done" bo'ladi)
  useEffect(() => {
    if (!credsOk) return;
    const live = ["qr", "starting", "checking", "saving", "password", "code"];
    if (!live.includes(state.stage)) return;
    const t = setInterval(() => telegramLogin().then(setState).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [credsOk, state.stage]);

  useEffect(() => {
    if (state.stage === "done" && !doneRef.current) {
      doneRef.current = true;
      onDone({ telegramUserApiId: creds.apiId, telegramUserApiHash: creds.apiHash, telegramUserPhone: state.user?.phone || settings?.telegramUserPhone || "" });
    }
  }, [state.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    if (state.stage !== "done" && state.stage !== "idle") telegramLogin("cancel").catch(() => {});
    onClose();
  }
  function switchMethod(m) {
    if (m === method) return;
    telegramLogin("cancel").catch(() => {});
    setState({ stage: "idle" }); setErr(""); setCode(""); setPassword("");
    setMethod(m);
  }

  const stage = state.stage;
  const errorText = err || state.error;
  const tab = (m, Icon, label) => (
    <button type="button" onClick={() => switchMethod(m)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: method === m ? THEME.card : "transparent", color: method === m ? THEME.text : THEME.muted, boxShadow: method === m ? THEME.shadowSm : "none" }}>
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <Modal title="Telegram akkauntni ulash" onClose={close} width={440}>
      {!credsOk ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.55 }}>
            Bir martalik sozlash: <b>my.telegram.org</b> saytiga Telegram raqamingiz bilan kiring → «API development tools» →
            ilova yarating va berilgan <b>api_id</b> hamda <b>api_hash</b>ni shu yerga yozing.
          </div>
          <Field label="API ID"><input value={apiId} onChange={(e) => setApiId(e.target.value)} style={getInputStyle()} inputMode="numeric" placeholder="1234567" /></Field>
          <Field label="API Hash"><input value={apiHash} onChange={(e) => setApiHash(e.target.value)} style={getInputStyle()} placeholder="32 belgili kod" /></Field>
          <Button onClick={() => setCredsOk(true)} disabled={!/^\d{3,}$/.test(creds.apiId) || creds.apiHash.length < 16}>Davom etish</Button>
        </div>
      ) : stage === "done" ? (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <CheckCircle2 size={44} color={THEME.green} />
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10, color: THEME.text }}>Ulandi!</div>
          <div style={{ fontSize: 13, color: THEME.muted, marginTop: 4 }}>{state.user?.name}{state.user?.username ? ` · @${state.user.username}` : ""}</div>
          <Button onClick={onClose} style={{ marginTop: 16, justifyContent: "center", width: "100%" }}>Tayyor</Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stage !== "password" && stage !== "checking" && (
            <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: THEME.surface }}>
              {tab("qr", QrCode, "QR kod")}
              {tab("phone", Smartphone, "Telefon raqam")}
            </div>
          )}

          {(stage === "password" || stage === "checking") ? (
            <form onSubmit={(e) => { e.preventDefault(); call("password", { password }); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, color: THEME.text }}>Akkauntda ikki bosqichli himoya yoqilgan. Telegram <b>bulutli parolingizni</b> kiriting.</div>
              <Field label={state.hint ? `Parol (eslatma: ${state.hint})` : "Parol"}>
                <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} style={getInputStyle()} autoComplete="current-password" />
              </Field>
              <Button type="submit" disabled={!password || stage === "checking"} style={{ justifyContent: "center" }}>
                {stage === "checking" ? <><Loader2 size={14} className="uvix-spin" /> Tekshirilmoqda...</> : "Tasdiqlash"}
              </Button>
            </form>
          ) : method === "qr" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 232, height: 232, borderRadius: 16, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${THEME.border}` }}>
                {state.qrDataUrl && stage === "qr" ? <img src={state.qrDataUrl} alt="Telegram QR kod" width={220} height={220} data-testid="tg-qr" />
                  : stage === "error" ? <Button variant="ghost" onClick={() => call("qr")}><RefreshCw size={14} /> Yangi QR kod</Button>
                  : <Loader2 size={28} color="#888" className="uvix-spin" />}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: THEME.text, lineHeight: 1.7, alignSelf: "stretch" }}>
                <li>Telefoningizda Telegram'ni oching</li>
                <li><b>Sozlamalar → Qurilmalar → «Qurilma ulash»</b></li>
                <li>Kamerani shu QR kodga qarating</li>
              </ol>
              <div style={{ fontSize: 11.5, color: THEME.muted, textAlign: "center" }}>
                QR kod har 30 soniyada o'zi yangilanadi.{onPhone ? " Ilova shu telefonda ochiq bo'lsa — «Telefon raqam» usulidan foydalaning." : ""}
              </div>
            </div>
          ) : stage === "code" ? (
            <form onSubmit={(e) => { e.preventDefault(); call("code", { code }); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, color: THEME.text }}>
                Kod {state.codeVia === "app" ? <>telefoningizdagi <b>Telegram ilovasiga</b></> : <><b>SMS</b> orqali</>} yuborildi ({state.phone}).
              </div>
              <Field label="Tasdiqlash kodi">
                <input autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} style={{ ...getInputStyle(), letterSpacing: 6, fontSize: 18, textAlign: "center" }} inputMode="numeric" autoComplete="one-time-code" placeholder="•••••" />
              </Field>
              <Button type="submit" disabled={code.length < 5 || sending} style={{ justifyContent: "center" }}>{sending ? "Tekshirilmoqda..." : "Kirish"}</Button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); call("phone", { phone }); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Telefon raqam">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} style={getInputStyle()} inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" />
              </Field>
              <Button type="submit" disabled={sending} style={{ justifyContent: "center" }}>{sending ? "Yuborilmoqda..." : "Kod yuborish"}</Button>
            </form>
          )}

          {errorText && <div data-testid="tg-login-error" style={{ fontSize: 12.5, color: THEME.rose, textAlign: "center" }}>{errorText}</div>}
          {needCreds === false && (
            <button type="button" onClick={() => { telegramLogin("cancel").catch(() => {}); setState({ stage: "idle" }); setCredsOk(false); }} style={{ background: "none", border: "none", color: THEME.muted, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>
              API ID / Hash ni o'zgartirish
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
