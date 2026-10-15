// errors.js — kutilmagan xatolarni serverga yuborish (A3): admin Telegram'da xabar oladi,
// «Sozlamalar → Ma'lumotlar → So'nggi xatolar»da ko'radi. Bir sahifada bir xil xato bir marta yuboriladi.
const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const NOISE = /ResizeObserver loop|Failed to fetch|NetworkError|Load failed|The operation was aborted|AbortError|Importing a module script failed|dynamically imported module/i;
const sent = new Set();
let count = 0;
let currentView = "";
export const setErrorView = (v) => { currentView = v || ""; };

export function newErrorCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export function reportError(err, extra = {}) {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err?.message || err || "Noma'lum xato");
  if (NOISE.test(message)) return null;
  const key = message.slice(0, 160);
  const code = extra.code || newErrorCode();
  if (sent.has(key) || count >= 10) return code;
  sent.add(key); count += 1;
  let token = "";
  try { token = localStorage.getItem("uvix_auth_token") || sessionStorage.getItem("uvix_auth_token") || ""; } catch { /* */ }
  const stack = [err?.stack || "", extra.componentStack || ""].filter(Boolean).join("\n").slice(0, 3000);
  try {
    fetch(`${API_BASE}/client-errors`, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, stack, code, view: currentView, url: location.pathname, kind: extra.kind || "react" }),
    }).catch(() => {});
  } catch { /* */ }
  return code;
}

let installed = false;
export function installErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => { if (e.error || e.message) reportError(e.error || e.message, { kind: "window" }); });
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, { kind: "promise" }));
}
