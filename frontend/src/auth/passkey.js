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

/** Qurilma Face ID / Touch ID / barmoq izini qo'llay oladimi */
export async function canUseBiometrics() {
  if (!browserSupportsWebAuthn()) return false;
  try { return await platformAuthenticatorIsAvailable(); } catch { return false; }
}

/** Qurilma turiga qarab nom: iPhone'da "Face ID", boshqalarda "Barmoq izi" */
export function biometricLabel() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad/.test(ua)) return { name: "Face ID", kind: "face" };
  if (/Macintosh/.test(ua)) return { name: "Touch ID", kind: "finger" };
  if (/Windows/.test(ua)) return { name: "Windows Hello", kind: "face" };
  return { name: "Barmoq izi", kind: "finger" };
}

export const isEnrolledHere = (employeeId) => lsGet(MARK(employeeId)) === "1";
export const wasSkipped = (employeeId) => lsGet(SKIP(employeeId)) === "1";
export const markSkipped = (employeeId) => lsSet(SKIP(employeeId), "1");

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
  const data = await post("/auth/passkey/login/verify", { challengeId: prepared.challengeId, response });
  setToken(data.token);
  lsSet(MARK(data.employee.id), "1");
  return data.employee;
}

// ---------- Yoqish (PIN bilan kirgandan keyin) ----------
export async function prepareEnroll() {
  return post("/auth/passkey/register/options", {}, true);
}
export async function enrollWithPrepared(prepared, employeeId) {
  const response = await startRegistration({ optionsJSON: prepared.options });
  const data = await post("/auth/passkey/register/verify", { challengeId: prepared.challengeId, response }, true);
  lsSet(MARK(employeeId), "1");
  lsSet(SKIP(employeeId), null);
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
  if (isLast) lsSet(MARK(employeeId), null);
}
