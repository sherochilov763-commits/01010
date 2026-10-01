// attendanceStore.js — "bugungi davomatim" umumiy holati: tugma, yopuvchi ekran va boshqalar bitta ma'lumotdan foydalanadi
import { useEffect, useState } from "react";
import { fetchMyAttendance } from "../storage.js";

let state = { loaded: false, data: null };
const subs = new Set();
let timer = null;
let inflight = null;

function emit() { subs.forEach((fn) => fn(state)); }
export function refreshAttendance() {
  if (inflight) return inflight;
  inflight = fetchMyAttendance()
    .then((data) => { state = { loaded: true, data }; })
    .catch(() => { state = { loaded: true, data: null }; })
    .finally(() => { inflight = null; emit(); });
  return inflight;
}
function onVis() { if (document.visibilityState === "visible") refreshAttendance(); }
export function useMyAttendance() {
  const [s, setS] = useState(state);
  useEffect(() => {
    subs.add(setS);
    if (subs.size === 1) {
      refreshAttendance();
      timer = setInterval(refreshAttendance, 60000);
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      subs.delete(setS);
      if (!subs.size) { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); }
    };
  }, []);
  return s;
}
export function resetAttendance() { state = { loaded: false, data: null }; }

// Hozir ilova "Keldim"siz yopiq bo'lishi kerakmi (ish kuni, ish boshlanishidan 2 soat oldin — tugaguncha)
export function gateActive(data, now = new Date()) {
  if (!data || !data.config?.enabled || !data.config?.officeSet || !data.schedule?.track) return false;
  const t = data.today || {};
  if (t.in || !t.workday) return false;
  const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + m; };
  const n = now.getHours() * 60 + now.getMinutes();
  return n >= toMin(data.schedule.start) - 120 && n < toMin(data.schedule.end);
}
