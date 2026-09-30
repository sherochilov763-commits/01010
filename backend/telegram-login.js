// telegram-login.js — Telegram shaxsiy akkauntni ilovaning o'zidan ulash.
// Terminal ham, session string ham kerak emas:
//   • QR kod: telefondagi Telegram → Sozlamalar → Qurilmalar → «Qurilma ulash» → skanerlash
//   • yoki telefon raqam + Telegram yuborgan kod
//   • ikki bosqichli parol (2FA) yoqilgan bo'lsa — parol so'raladi
// Bir vaqtda faqat bitta kirish jarayoni bo'ladi; 10 daqiqada tugamasa o'zi bekor bo'ladi.

const { TelegramClient, Api } = require("teleproto");
const { StringSession } = require("teleproto/sessions");
const QRCode = require("qrcode");
const { CLIENT_OPTS, friendlyError } = require("./telegram-userbot");

const LOGIN_TIMEOUT = 10 * 60 * 1000;
let flow = null; // joriy kirish jarayoni

function publicState() {
  if (!flow) return { stage: "idle" };
  const { stage, method, qrDataUrl, qrExpires, phone, hint, error, user, codeVia } = flow;
  return { stage, method, qrDataUrl, qrExpires, phone, hint, error, user, codeVia };
}

async function cleanup() {
  const f = flow;
  if (!f) return;
  clearTimeout(f.timer);
  f.aborter?.abort();
  if (f.stage !== "done" && f.client) f.client.disconnect().catch(() => {});
}

async function begin(method, apiId, apiHash, onSuccess) {
  await cleanup();
  const id = Number(apiId);
  if (!id || !apiHash) throw new Error("Avval API ID va API Hash kiriting (my.telegram.org)");
  const client = new TelegramClient(new StringSession(""), id, String(apiHash), CLIENT_OPTS);
  const f = {
    method, stage: "starting", client, apiId: id, apiHash: String(apiHash), error: "", onSuccess,
    aborter: new AbortController(), passwordWaiter: null,
  };
  f.timer = setTimeout(() => { if (flow === f && f.stage !== "done") { f.stage = "error"; f.error = "Vaqt tugadi — qaytadan boshlang"; cleanup(); } }, LOGIN_TIMEOUT);
  flow = f;
  await client.connect();
  return f;
}

// 2FA paroli: kutubxona parolni so'raganda foydalanuvchi kiritguncha kutamiz
function waitForPassword(f) {
  return (hint) => new Promise((resolve) => {
    if (flow !== f) return resolve("");
    f.stage = "password";
    f.hint = hint || "";
    f.passwordWaiter = resolve;
  });
}
function passwordOnError(f) {
  return async (err) => {
    if (flow !== f) return true;
    const m = String(err?.errorMessage || err?.message || "");
    if (m.includes("PASSWORD_HASH_INVALID")) { f.error = "Parol noto'g'ri — qaytadan kiriting"; return false; } // qayta so'raydi
    f.error = friendlyError(err).message;
    return true; // to'xtatamiz
  };
}

async function finish(f, user) {
  if (flow !== f) return;
  const session = f.client.session.save();
  f.user = { name: [user?.firstName, user?.lastName].filter(Boolean).join(" "), username: user?.username || "", phone: user?.phone || "" };
  // Kirish uchun ochilgan ulanishni yopamiz: asosiy ulanish shu sessiya bilan qaytadan ochiladi (bir vaqtda ikkita bo'lmasin)
  await f.client.disconnect().catch(() => {});
  f.stage = "saving";
  try {
    await f.onSuccess({ session, apiId: f.apiId, apiHash: f.apiHash, user: f.user });
    f.stage = "done";
  } catch (e) {
    f.stage = "error";
    f.error = e.message || "Saqlab bo'lmadi";
  }
  clearTimeout(f.timer);
}
function fail(f, e) {
  if (flow !== f || f.stage === "done") return;
  if (String(e?.message || "").includes("AUTH_USER_CANCEL") || f.aborter.signal.aborted) return;
  f.stage = "error";
  f.error = f.error || friendlyError(e).message;
  cleanup();
}

// ---- QR kod orqali ----
async function startQr({ apiId, apiHash, onSuccess }) {
  const f = await begin("qr", apiId, apiHash, onSuccess);
  f.stage = "qr";
  f.client
    .signInUserWithQrCode(
      { apiId: f.apiId, apiHash: f.apiHash },
      {
        abortSignal: f.aborter.signal,
        qrCode: async ({ token, expires }) => {
          if (flow !== f) return;
          const url = `tg://login?token=${Buffer.from(token).toString("base64url")}`;
          f.qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 280, errorCorrectionLevel: "M" });
          f.qrExpires = expires * 1000;
          if (f.stage !== "password") f.stage = "qr";
        },
        password: waitForPassword(f),
        onError: passwordOnError(f),
      },
    )
    .then((user) => finish(f, user))
    .catch((e) => fail(f, e));
  return publicState();
}

// ---- Telefon raqam + kod orqali ----
async function startPhone({ apiId, apiHash, phone, onSuccess }) {
  const clean = String(phone || "").replace(/[^\d+]/g, "");
  if (clean.replace(/\D/g, "").length < 9) throw new Error("Telefon raqamni to'liq kiriting (+998...)");
  const f = await begin("phone", apiId, apiHash, onSuccess);
  f.phone = clean;
  try {
    const r = await f.client.sendCode({ apiId: f.apiId, apiHash: f.apiHash }, clean);
    f.phoneCodeHash = r.phoneCodeHash;
    f.codeVia = r.isCodeViaApp ? "app" : "sms";
    f.stage = "code";
  } catch (e) {
    fail(f, e);
    const m = String(e?.errorMessage || e?.message || "");
    if (m.includes("PHONE_NUMBER_INVALID")) flow.error = "Telefon raqam noto'g'ri";
  }
  return publicState();
}

async function submitCode(code) {
  const f = flow;
  if (!f || f.stage !== "code") throw new Error("Kod kutilmayapti — qaytadan boshlang");
  f.error = "";
  try {
    const r = await f.client.invoke(new Api.auth.SignIn({ phoneNumber: f.phone, phoneCodeHash: f.phoneCodeHash, phoneCode: String(code).replace(/\D/g, "") }));
    if (r instanceof Api.auth.AuthorizationSignUpRequired) {
      f.stage = "error";
      f.error = "Bu raqamda Telegram akkaunt yo'q";
      cleanup();
    } else {
      await finish(f, r.user);
    }
  } catch (e) {
    const m = String(e?.errorMessage || e?.message || "");
    if (m.includes("SESSION_PASSWORD_NEEDED")) {
      f.client
        .signInWithPassword({ apiId: f.apiId, apiHash: f.apiHash }, { password: waitForPassword(f), onError: passwordOnError(f) })
        .then((user) => finish(f, user))
        .catch((err) => fail(f, err));
      // parol so'ralishini kutamiz, shunda javobda stage = "password" bo'ladi
      for (let i = 0; i < 40 && f.stage === "code"; i++) await new Promise((r) => setTimeout(r, 100));
    } else if (m.includes("PHONE_CODE_INVALID")) {
      f.error = "Kod noto'g'ri — qaytadan kiriting";
    } else if (m.includes("PHONE_CODE_EXPIRED")) {
      f.stage = "error";
      f.error = "Kod muddati tugadi — qaytadan boshlang";
      cleanup();
    } else {
      fail(f, e);
    }
  }
  return publicState();
}

async function submitPassword(password) {
  const f = flow;
  if (!f || f.stage !== "password" || !f.passwordWaiter) throw new Error("Parol kutilmayapti");
  f.error = "";
  const resolve = f.passwordWaiter;
  f.passwordWaiter = null;
  f.stage = "checking";
  resolve(String(password || ""));
  // natijani qisqa kutamiz: to'g'ri bo'lsa — done, noto'g'ri bo'lsa — yana password
  for (let i = 0; i < 80 && f.stage === "checking"; i++) await new Promise((r) => setTimeout(r, 100));
  return publicState();
}

async function cancel() {
  await cleanup();
  flow = null;
  return publicState();
}

module.exports = { startQr, startPhone, submitCode, submitPassword, cancel, getState: publicState };
