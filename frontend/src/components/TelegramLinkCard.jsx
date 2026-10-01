// TelegramLinkCard.jsx — xodim UVIX botini o'z Telegram'iga ulaydi (bir marta): eslatmalar va haftalik xulosa shu yerga keladi.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { fetchMyTelegram, linkMyTelegram, unlinkMyTelegram } from "../storage.js";
import { TG_BLUE } from "./LeadSource.jsx";
import { THEME } from "../theme.js";

export function TelegramLinkCard({ compact = false }) {
  const [st, setSt] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState("");
  const poll = useRef(null);
  const load = () => fetchMyTelegram().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); return () => clearInterval(poll.current); }, []);

  async function connect() {
    setErr("");
    // Oynani darhol ochamiz (Safari bosishdan keyin kechikkan window.open'ni to'sadi), manzilni keyin beramiz
    const w = window.open("about:blank", "_blank");
    try {
      const { url } = await linkMyTelegram();
      if (w) w.location.href = url; else window.location.href = url;
      setWaiting(true);
      let n = 0;
      clearInterval(poll.current);
      poll.current = setInterval(async () => {
        n++;
        const s = await fetchMyTelegram().catch(() => null);
        if (s?.linked || n > 60) { clearInterval(poll.current); setWaiting(false); if (s) setSt(s); }
      }, 3000);
    } catch (e) {
      w?.close();
      setErr(e.message);
    }
  }
  async function unlink() { await unlinkMyTelegram().catch(() => {}); load(); }

  if (!st || !st.botConfigured) return null;
  if (compact && st.linked) return null;

  return (
    <div data-testid="tg-link-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: compact ? "10px 12px" : "14px 16px", borderRadius: 14, background: `${TG_BLUE}14`, border: `1px solid ${TG_BLUE}40`, textAlign: "left", flexWrap: "wrap" }}>
      <span style={{ width: 36, height: 36, borderRadius: "50%", background: TG_BLUE, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Send size={17} /></span>
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: THEME.text }}>{st.linked ? "Telegram ulangan" : "Eslatmalarni Telegram'da oling"}</div>
        <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>
          {st.linked ? <>Ish vaqti eslatmalari va haftalik xulosangiz Telegram'ingizga keladi{st.username ? <> (<b style={{ color: TG_BLUE }}>@{st.username}</b>)</> : ""}.</>
            : waiting ? "Telegram'da «Start» tugmasini bosing — shu yerda o'zi tasdiqlanadi…" : "Ish boshlanishi, kechikish va «Ketdim» eslatmalari. Bir marta ulanadi."}
        </div>
        {err && <div style={{ fontSize: 12, color: THEME.rose, marginTop: 4 }}>{err}</div>}
      </div>
      {st.linked ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: THEME.green }}><Check size={15} /> Ulangan</span>
          <button type="button" onClick={unlink} style={{ border: 0, background: "none", color: THEME.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>o'chirish</button>
        </span>
      ) : (
        <button type="button" data-testid="tg-link-btn" onClick={connect} disabled={waiting}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 11, border: 0, background: TG_BLUE, color: "#fff", fontWeight: 700, fontSize: 13, cursor: waiting ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          {waiting ? <Loader2 size={15} className="uvix-spin" /> : <Send size={15} />} {waiting ? "Kutilmoqda…" : "Telegram'ni ulash"}
        </button>
      )}
    </div>
  );
}
