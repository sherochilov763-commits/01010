// TgFolders.jsx — Telegram papkalari paneli: kompyuterda chap tomonda tik ustun, telefonda tepada yorliqlar.
// Papkalar Telegram'ning o'zidan olinadi (nomi, belgisi, tartibi, ichidagi chatlar); daqiqasiga bir marta yangilanadi.
import { useEffect, useState } from "react";
import { Folder, MessagesSquare } from "lucide-react";
import { fetchTelegramFolders } from "../../storage.js";
import { C } from "./chatPalette.js";

const KEY = "uvix:chatFolder";
export function useTgFolders(enabled) {
  const [folders, setFolders] = useState([]);
  const [active, setActiveState] = useState(() => { try { return Number(localStorage.getItem(KEY) || 0); } catch { return 0; } });
  const setActive = (id) => { setActiveState(id); try { localStorage.setItem(KEY, String(id)); } catch { /* shart emas */ } };
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () => fetchTelegramFolders().then((f) => { if (alive) setFolders(f); }).catch(() => {});
    load();
    const t = setInterval(load, 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [enabled]);
  const current = folders.find((f) => f.id === active) || null;
  // Tanlangan papka Telegram'da o'chirilgan bo'lsa — «Barcha chatlar»
  useEffect(() => { if (folders.length && active && !current) setActive(0); }, [folders.length, active, current]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = current && current.kind !== "all" ? new Set(current.chatIds) : null;
  return { folders, active: current ? current.id : 0, setActive, inFolder: (chatId) => !set || set.has(String(chatId)) };
}

// Papka ichidagi o'qilmagan chatlar soni (Telegram'dagidek)
export function folderUnread(folder, chats) {
  if (!folder) return 0;
  if (folder.kind === "all") return chats.filter((c) => c.unread).length;
  const s = new Set(folder.chatIds);
  return chats.filter((c) => c.unread && s.has(String(c.chatId))).length;
}

function Icon({ f, size }) {
  if (f.kind === "all") return <MessagesSquare size={size} />;
  if (f.emoticon) return <span style={{ fontSize: size - 1, lineHeight: 1 }}>{f.emoticon}</span>;
  return <Folder size={size} fill="currentColor" strokeWidth={1.4} />;
}
const Badge = ({ n }) => (n > 0 ? <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.tgSolid, color: "#fff", fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{n > 99 ? "99+" : n}</span> : null);

// Kompyuter: chap tomonda tik ustun (Telegram Desktop kabi)
export function FolderRail({ folders, active, onPick, chats }) {
  return (
    <nav aria-label="Papkalar" data-testid="tg-folders" className="uvix-noscrollbar"
      style={{ width: 76, flexShrink: 0, background: C.bg, borderRight: `1px solid ${C.border}`, overflowY: "auto", padding: "8px 0" }}>
      {folders.map((f) => {
        const on = f.id === active, n = folderUnread(f, chats);
        return (
          <button key={f.id} type="button" onClick={() => onPick(f.id)} aria-pressed={on} data-folder={f.id} title={f.title}
            style={{ position: "relative", width: "100%", border: 0, background: on ? C.hover : "transparent", color: on ? C.tg : C.muted, cursor: "pointer", fontFamily: "inherit", padding: "10px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {on && <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: "0 3px 3px 0", background: C.tg }} />}
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon f={f} size={24} />
              {n > 0 && <span style={{ position: "absolute", top: -7, right: -12 }}><Badge n={n} /></span>}
            </span>
            <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, color: on ? C.text : C.muted, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Telefon: tepada gorizontal yorliqlar (Telegram mobil kabi)
export function FolderTabs({ folders, active, onPick, chats }) {
  return (
    <div role="tablist" aria-label="Papkalar" data-testid="tg-folders" className="uvix-noscrollbar"
      style={{ display: "flex", gap: 2, overflowX: "auto", borderBottom: `1px solid ${C.border}`, padding: "0 8px" }}>
      {folders.map((f) => {
        const on = f.id === active, n = folderUnread(f, chats);
        return (
          <button key={f.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(f.id)} data-folder={f.id}
            style={{ flexShrink: 0, border: 0, background: "none", cursor: "pointer", fontFamily: "inherit", padding: "10px 10px 8px", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600,
              color: on ? C.tg : C.muted, borderBottom: `2.5px solid ${on ? C.tg : "transparent"}` }}>
            {f.title}<Badge n={n} />
          </button>
        );
      })}
    </div>
  );
}
