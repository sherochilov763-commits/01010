// passkey.js — Face ID / barmoq izi bilan kirish uchun brauzer tomoni
import { startAuthentication, startRegistration, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { getToken, setToken } from "../storage.js";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const MARK = (id) => `uvix_passkey:${id}`;
const SKIP = (id) => `uvix_passkey_skip:${id}`;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private rejim */ } }

async function post(path, body, auth = false) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Xato: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Faqat shaxsiy telefon/planshet. Umumiy kompyuterda Windows Hello / Touch ID xodimni emas,
// kompyuter egasini taniydi — u yerda PIN qoladi.
export function isPersonalMobile() {
  const ua = navigator.userAgent || "";
  if (/iPhone|Android/i.test(ua)) return true;
  if (/iPad/.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1; // iPadOS "Mac" deb o'zini ko'rsatadi
}

/** Qurilma Face ID / barmoq izini qo'llay oladimi (faqat telefonda) */
export async function canUseBiometrics() {
  if (!isPersonalMobile()) return false;
  if (!browserSupportsWebAuthn()) return false;
  try { return await platformAuthenticatorIsAvailable(); } catch { return false; }
}

/** Qurilma turiga qarab nom: iPhone'da "Face ID", boshqalarda "Barmoq izi" */
export function biometricLabel() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)) return { name: "Face ID", kind: "face" };
  return { name: "Barmoq izi", kind: "finger" };
}

export const isEnrolledHere = (employeeId) => lsGet(MARK(employeeId)) === "1";
export const wasSkipped = (employeeId) => lsGet(SKIP(employeeId)) === "1";
export const markSkipped = (employeeId) => lsSet(SKIP(employeeId), "1");

// Shu telefonda oxirgi marta biometrik bilan kirgan xodim — ilova ochilganda darhol uni taklif qilamiz
const LAST = "uvix_passkey_last";
export function lastBioUser() {
  try { const v = JSON.parse(lsGet(LAST) || "null"); return v && v.id ? v : null; } catch { return null; }
}
export function forgetLastBioUser() { lsSet(LAST, null); }
function rememberLast(emp) { if (emp?.id) lsSet(LAST, JSON.stringify({ id: emp.id, name: emp.name || "" })); }

// Safari WebAuthn oynasini faqat tugma bosilgan zahoti ochadi — shuning uchun so'rov oldindan olinadi.
// Endi u 10 daqiqa amal qiladi va 4 daqiqadan eski bo'lsa o'zi yangilanadi.
const FRESH_MS = 4 * 60 * 1000;
export function makePreparer(fetcher) {
  let cur = null;
  let at = 0;
  let inflight = null;
  const refresh = () => {
    inflight = fetcher().then((p) => { cur = p; at = Date.now(); return p; }).catch(() => { cur = null; return null; }).finally(() => { inflight = null; });
    return inflight;
  };
  return {
    refresh,
    // tayyor va yangi bo'lsa — darhol (Safari uchun muhim), aks holda kutib olamiz
    async get() {
      if (cur && Date.now() - at < FRESH_MS) return cur;
      return inflight || refresh();
    },
    peek: () => (cur && Date.now() - at < FRESH_MS ? cur : null),
    invalidate() { cur = null; },
  };
}

/** Foydalanuvchi bekor qilganini aniqlash (xato emas, oddiy holat) */
export function isCancel(e) {
  return e?.name === "NotAllowedError" || e?.name === "AbortError";
}

// ---------- Kirish ----------
// Safari "foydalanuvchi bosgan paytda" talabini buzmaslik uchun options oldindan olinadi,
// tugma bosilganda esa darhol Face ID oynasi ochiladi.
export async function prepareLogin(employeeId) {
  return post("/auth/passkey/login/options", { employeeId });
}
export async function loginWithPrepared(prepared) {
  const response = await startAuthentication({ optionsJSON: prepared.options });
  const data = await post("/auth/passkey/login/verify", { response });
  setToken(data.token);
  lsSet(MARK(data.employee.id), "1");
  rememberLast(data.employee);
  return data.employee;
}

// ---------- Yoqish (PIN bilan kirgandan keyin) ----------
export async function prepareEnroll() {
  return post("/auth/passkey/register/options", {}, true);
}
export async function enrollWithPrepared(prepared, employee) {
  const employeeId = typeof employee === "object" ? employee.id : employee;
  let response;
  try {
    response = await startRegistration({ optionsJSON: prepared.options });
  } catch (e) {
    if (e?.name === "InvalidStateError") throw new Error("Bu telefon allaqachon qo'shilgan");
    throw e;
  }
  const data = await post("/auth/passkey/register/verify", { response }, true);
  lsSet(MARK(employeeId), "1");
  lsSet(SKIP(employeeId), null);
  if (typeof employee === "object") rememberLast(employee);
  return data.passkey;
}

// ---------- Boshqarish ----------
export async function listPasskeys() {
  const res = await fetch(`${API_BASE}/auth/passkey/list`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Ro'yxatni olib bo'lmadi");
  return data.passkeys || [];
}
export async function removePasskey(id, employeeId, isLast) {
  const res = await fetch(`${API_BASE}/auth/passkey/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("O'chirib bo'lmadi");
  if (isLast) { lsSet(MARK(employeeId), null); if (lastBioUser()?.id === employeeId) forgetLastBioUser(); }
}
