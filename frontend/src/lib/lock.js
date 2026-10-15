// lock.js — harakatsizlikda ekranni qulflash (A2).
// Oxirgi faollik va qulf holati localStorage'da: bir nechta oynada bir xil ishlaydi, sahifa yangilansa ham saqlanadi.
// Muddat — shu qurilma sozlamasi (Sozlamalar → Profil → Xavfsizlik), standart 15 daqiqa; 0 — o'chiq.
import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVE = "uvix_last_active";
const LOCKED = "uvix_locked";
const MINUTES = "uvix_lock_min";
export const LOCK_OPTIONS = [5, 15, 30, 60, 0];

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private rejim */ } };

export function lockMinutes() {
  const v = get(MINUTES);
  return v != null && LOCK_OPTIONS.includes(Number(v)) ? Number(v) : 15;
}
export function setLockMinutes(m) { set(MINUTES, String(m)); window.dispatchEvent(new Event("uvix:lock-min")); }
export const lastActive = () => Number(get(ACTIVE)) || 0;
export const markActive = () => set(ACTIVE, String(Date.now()));
/** Ilova ochilganda: oldingi faollikdan beri muddat o'tganmi yoki qulf qo'yilganmi */
export function shouldLockOnStart() {
  const m = lockMinutes();
  if (get(LOCKED) === "1") return true;
  if (!m) return false;
  const la = lastActive();
  return !!la && Date.now() - la > m * 60000;
}
export function clearLockState() { set(LOCKED, null); }

export function useIdleLock(enabled) {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const [minutes, setMinutes] = useState(lockMinutes);

  const lock = useCallback(() => { set(LOCKED, "1"); setLocked(true); }, []);
  const unlock = useCallback(() => { set(LOCKED, null); markActive(); setLocked(false); }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!lockedRef.current) markActive();
    let last = 0;
    const onAct = () => {
      if (lockedRef.current) return;
      const t = Date.now();
      if (t - last > 10000) { last = t; markActive(); }
    };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, onAct, { passive: true, capture: true }));
    const tick = () => {
      const m = lockMinutes();
      if (!lockedRef.current && m && Date.now() - lastActive() > m * 60000) lock();
    };
    const iv = setInterval(tick, 15000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    // Boshqa oynada qulflandi / ochildi
    const onStorage = (e) => {
      if (e.key === LOCKED) setLocked(e.newValue === "1");
      if (e.key === MINUTES) setMinutes(lockMinutes());
    };
    window.addEventListener("storage", onStorage);
    const onMin = () => setMinutes(lockMinutes());
    window.addEventListener("uvix:lock-min", onMin);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, onAct, { capture: true }));
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("uvix:lock-min", onMin);
    };
  }, [enabled, lock]);

  return { locked: enabled && locked, lock, unlock, minutes };
}
