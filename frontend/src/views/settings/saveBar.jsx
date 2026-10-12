// saveBar.jsx — Sozlamalarda bir xil saqlash: o'zgarish bo'lsa pastda «Saqlanmagan o'zgarish: … · Bekor · Saqlash» paneli.
// Har bir bo'lim useDirty(id, { dirty, label, save, reset }) bilan ro'yxatdan o'tadi.
// Almashtirgichlar (checkbox, radio) bu yerdan o'tmaydi — ular darhol saqlanadi.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { THEME } from "../../theme.js";

const Ctx = createContext(null);

export function SaveBarProvider({ children }) {
  const [items, setItems] = useState({}); // id -> { label, save, reset }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const hideRef = useRef(null);
  const register = useCallback((id, entry) => {
    setItems((cur) => {
      if (!entry) { if (!cur[id]) return cur; const n = { ...cur }; delete n[id]; return n; }
      return { ...cur, [id]: entry };
    });
  }, []);
  const list = Object.entries(items);
  const dirty = list.length > 0;
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);
  const flash = (m) => { setMsg(m); clearTimeout(hideRef.current); hideRef.current = setTimeout(() => setMsg(null), m.ok ? 2200 : 6000); };
  async function saveAll() {
    setBusy(true);
    try {
      for (const [, it] of list) await it.save();
      flash({ ok: true, text: "Saqlandi" });
    } catch (e) {
      flash({ ok: false, text: e?.message || "Saqlab bo'lmadi" });
    } finally { setBusy(false); }
  }
  function resetAll() { list.forEach(([, it]) => it.reset?.()); }
  // Bo'limni almashtirishdan oldin so'raladi
  const confirmLeave = useCallback(() => !dirty || window.confirm("Saqlanmagan o'zgarishlar bor. Chiqib ketsangiz, ular yo'qoladi. Davom etasizmi?"), [dirty]);
  const value = useMemo(() => ({ register, confirmLeave, dirty, resetAll }), [register, confirmLeave, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = list.map(([, it]) => it.label).filter(Boolean);
  return (
    <Ctx.Provider value={value}>
      {children}
      {(dirty || msg) && (
        <div role="status" data-testid="save-bar" className="no-print"
          style={{ position: "fixed", left: "50%", bottom: "calc(18px + env(safe-area-inset-bottom))", transform: "translateX(-50%)", zIndex: 250, maxWidth: "calc(100vw - 24px)",
            background: "#18181B", color: "#fff", borderRadius: 14, padding: "9px 10px 9px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 12px 32px rgba(0,0,0,.28)", fontSize: 13.5 }}>
          {dirty ? (
            <>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Saqlanmagan o'zgarish{labels.length ? <>: <b>{labels.join(", ")}</b></> : ""}</span>
              <button type="button" onClick={resetAll} disabled={busy} style={{ height: 34, padding: "0 12px", borderRadius: 9, border: "1px solid #52525B", background: "none", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Bekor</button>
              <button type="button" onClick={saveAll} disabled={busy} data-testid="save-bar-save" style={{ height: 34, padding: "0 14px", borderRadius: 9, border: 0, background: THEME.violet, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>{busy && <Loader2 size={14} className="uvix-spin" />}Saqlash</button>
            </>
          ) : <span style={{ color: msg.ok ? "#6EE7B7" : "#FCA5A5", fontWeight: 600, padding: "6px 4px" }}>{msg.text}</span>}
        </div>
      )}
    </Ctx.Provider>
  );
}

// Bo'lim o'z holatini bildiradi. save/reset — eng so'nggi qiymatlar bilan chaqiriladi.
export function useDirty(id, { dirty, label, save, reset }) {
  const ctx = useContext(Ctx);
  const ref = useRef({ save, reset });
  ref.current = { save, reset };
  useEffect(() => {
    if (!ctx) return undefined;
    ctx.register(id, dirty ? { label, save: () => ref.current.save(), reset: () => ref.current.reset?.() } : null);
    return () => ctx.register(id, null);
  }, [ctx, id, dirty, label]);
  return !!ctx; // panel bormi (yo'q bo'lsa — bo'lim o'z tugmasini ko'rsatadi)
}
export const useSaveBar = () => useContext(Ctx);
