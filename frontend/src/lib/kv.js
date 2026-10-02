// kv.js — server bilan ishonchli sinxronlash
//
// • Ro'yxatlar (buyurtma, rasxod, lid, jurnal) butunlay emas, faqat o'zgargan yozuvlar bilan
//   yuboriladi (POST /kv/:key/merge). Ikki xodim bir vaqtda ishlasa ham bir-birining
//   o'zgarishini o'chirib yubormaydi.
// • Saqlash muvaffaqiyatsiz bo'lsa (internet yo'q, server qayta ishga tushyapti) —
//   navbatda turadi, o'zi qayta urinadi, sahifa yopilib qolsa ham brauzerda saqlanib turadi.
// • Holat (saqlanmoqda / saqlandi / xato) useSaveStatus() orqali ekranga chiqariladi.
import { apiGet, apiMerge, apiSet } from "../storage.js";

const MERGE_KEYS = new Set(["uvix:orders", "uvix:transactions", "uvix:leads", "uvix:audit", "uvix:customers"]);
const PENDING_PREFIX = "uvix-pending:";

// key -> { rev, base: Map(id -> json) } — serverdagi oxirgi ma'lum holat
const snapshots = new Map();
// key -> { desired, running, attempt, timer }
const queues = new Map();
const remoteListeners = new Set();
const statusListeners = new Set();
let status = { state: "idle", pending: 0, error: "", lastSavedAt: 0 };

function setStatus(patch) {
  status = { ...status, ...patch };
  statusListeners.forEach((fn) => fn(status));
}
export function subscribeSaveStatus(fn) {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}
// Serverdagi yangi holat (boshqa xodimning o'zgarishi bilan birlashtirilgan) kelganda chaqiriladi
export function subscribeRemote(fn) {
  remoteListeners.add(fn);
  return () => remoteListeners.delete(fn);
}
const emitRemote = (key, value) => remoteListeners.forEach((fn) => fn(key, value));

const hasIds = (arr) => Array.isArray(arr) && arr.every((x) => x && (typeof x.id === "string" || typeof x.id === "number"));
function remember(key, value, rev) {
  if (!MERGE_KEYS.has(key) || !hasIds(value)) return;
  snapshots.set(key, { rev, base: new Map(value.map((x) => [String(x.id), JSON.stringify(x)])) });
}
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* xotira to'la yoki taqiqlangan */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* */ } }

function pendingCount() {
  let n = 0;
  queues.forEach((q) => { if (q.desired !== undefined || q.running) n++; });
  return n;
}

export async function storageGet(key, shared, fallback) {
  try {
    const r = await apiGet(key);
    if (!r) {
      if (Array.isArray(fallback)) remember(key, fallback, 0); // hali bo'sh ro'yxat — birinchi yozuv ham birlashtirib saqlanadi
      return fallback;
    }
    const value = JSON.parse(r.value);
    remember(key, value, r.rev);
    return value;
  } catch (e) {
    console.error("storage get failed", key, e);
    return fallback;
  }
}

// Faqat o'zgargan bo'lsa qaytaradi (boshqa xodim yozgan bo'lsa). Navbatda saqlanish kutayotgan kalit uchun null.
export async function storageRefresh(key) {
  const q = queues.get(key);
  if (q && (q.desired !== undefined || q.running)) return null;
  const snap = snapshots.get(key);
  try {
    const r = await apiGet(key, snap?.rev);
    if (!r || r.unchanged) return null;
    const q2 = queues.get(key);
    if (q2 && (q2.desired !== undefined || q2.running)) return null; // shu orada o'zgartirildi
    const value = JSON.parse(r.value);
    remember(key, value, r.rev);
    return value;
  } catch {
    return null;
  }
}

function diff(key, value) {
  const snap = snapshots.get(key);
  if (!snap || !hasIds(value)) return null;
  const upserts = [];
  const seen = new Set();
  value.forEach((item, i) => {
    const id = String(item.id);
    seen.add(id);
    const json = JSON.stringify(item);
    if (snap.base.get(id) !== json) upserts.push({ item, at: snap.base.has(id) ? undefined : i < value.length / 2 ? "start" : "end" });
  });
  const deletes = [];
  snap.base.forEach((_, id) => { if (!seen.has(id)) deletes.push(id); });
  return { upserts, deletes };
}

async function flush(key) {
  const q = queues.get(key);
  if (!q || q.running || q.desired === undefined) return;
  const value = q.desired;
  q.desired = undefined;
  q.running = true;
  setStatus({ state: "saving", pending: pendingCount() });
  try {
    let res;
    const patch = MERGE_KEYS.has(key) ? diff(key, value) : null;
    if (patch) {
      if (patch.upserts.length || patch.deletes.length) res = await apiMerge(key, patch);
    } else {
      res = await apiSet(key, JSON.stringify(value));
    }
    q.attempt = 0;
    if (res) {
      const merged = JSON.parse(res.value);
      remember(key, merged, res.rev);
      // Shu orada yangi o'zgarish bo'lmagan va server natijasi farq qilsa — ekranni yangilaymiz
      if (q.desired === undefined && JSON.stringify(merged) !== JSON.stringify(value)) emitRemote(key, merged);
    }
    q.running = false;
    if (q.desired === undefined) lsDel(PENDING_PREFIX + key);
    const left = pendingCount();
    setStatus(left ? { state: "saving", pending: left } : { state: "saved", pending: 0, error: "", lastSavedAt: Date.now() });
    if (q.desired !== undefined) flush(key);
  } catch (e) {
    q.running = false;
    if (q.desired === undefined) q.desired = value; // yo'qotmaymiz — keyingi urinishda yuboriladi
    const fatal = e.status === 401 || e.status === 403 || e.status === 400;
    if (fatal) {
      q.desired = undefined;
      lsDel(PENDING_PREFIX + key);
      setStatus({ state: "error", pending: pendingCount(), error: e.status === 401 ? "Sessiya tugadi — qaytadan kiring. Oxirgi o'zgarish saqlanmadi." : e.message || "Saqlashga ruxsat yo'q" });
      return;
    }
    q.attempt = (q.attempt || 0) + 1;
    const wait = Math.min(30000, 1500 * 2 ** (q.attempt - 1));
    setStatus({ state: "offline", pending: pendingCount(), error: navigator.onLine === false ? "Internet yo'q" : "Server javob bermadi" });
    clearTimeout(q.timer);
    q.timer = setTimeout(() => flush(key), wait);
  }
}

export async function storageSet(key, shared, value) {
  let q = queues.get(key);
  if (!q) { q = { desired: undefined, running: false, attempt: 0, timer: null }; queues.set(key, q); }
  q.desired = value;
  // Sahifa yopilib qolsa ham yo'qolmasin: kutayotgan qiymatni va uning asosini saqlab qo'yamiz
  if (MERGE_KEYS.has(key)) {
    const snap = snapshots.get(key);
    if (snap) lsSet(PENDING_PREFIX + key, JSON.stringify({ desired: value, base: [...snap.base.values()].map((j) => JSON.parse(j)), rev: snap.rev }));
  }
  setStatus({ state: "saving", pending: pendingCount() });
  await flush(key);
}

export function retryNow() {
  queues.forEach((q, key) => { clearTimeout(q.timer); q.attempt = 0; flush(key); });
}

// Oldingi seansdan qolib ketgan (saqlanmay qolgan) o'zgarishlarni qayta yuborish.
// Asos sifatida o'sha paytdagi holat olinadi — orada boshqalar qilgan o'zgarishlar saqlanib qoladi.
export async function resumePending() {
  const restored = [];
  for (const key of MERGE_KEYS) {
    const raw = lsGet(PENDING_PREFIX + key);
    if (!raw) continue;
    try {
      const { desired, base, rev } = JSON.parse(raw);
      if (!hasIds(desired) || !hasIds(base)) { lsDel(PENDING_PREFIX + key); continue; }
      const current = snapshots.get(key);
      remember(key, base, rev);
      const patch = diff(key, desired);
      if (current) snapshots.set(key, current);
      if (!patch || (!patch.upserts.length && !patch.deletes.length)) { lsDel(PENDING_PREFIX + key); continue; }
      const res = await apiMerge(key, patch);
      const merged = JSON.parse(res.value);
      remember(key, merged, res.rev);
      lsDel(PENDING_PREFIX + key);
      emitRemote(key, merged);
      restored.push(key);
    } catch (e) {
      console.error("Saqlanmay qolgan o'zgarishni tiklab bo'lmadi", key, e);
    }
  }
  return restored;
}

export const hasUnsaved = () => pendingCount() > 0;
if (typeof window !== "undefined") {
  window.addEventListener("online", retryNow);
  window.addEventListener("beforeunload", (e) => {
    if (hasUnsaved()) { e.preventDefault(); e.returnValue = ""; }
  });
}
