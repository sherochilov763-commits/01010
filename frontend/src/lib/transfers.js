// transfers.js — ichki o'tkazmalar (uvix:transfers) uchun umumiy hook: Kassalar va Dashboard bir xil ro'yxatni ko'radi.
import { useEffect, useState } from "react";
import { storageGet, storageSet } from "./kv.js";

const KEY = "uvix:transfers";
const EVT = "uvix:transfers-changed";
let cache = null;

export async function loadTransfers() {
  const v = await storageGet(KEY, true, []);
  cache = Array.isArray(v) ? v : [];
  return cache;
}
export async function saveTransfers(next) {
  cache = next;
  window.dispatchEvent(new Event(EVT));
  await storageSet(KEY, true, next);
}
export function useTransfers() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    let alive = true;
    loadTransfers().then((v) => alive && setList(v)).catch(() => alive && setList([]));
    const on = () => setList(cache);
    window.addEventListener(EVT, on);
    return () => { alive = false; window.removeEventListener(EVT, on); };
  }, []);
  return list;
}
