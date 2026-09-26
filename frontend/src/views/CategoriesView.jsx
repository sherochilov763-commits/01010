import { useMemo, useState } from "react";
import { ChevronDown, FolderTree, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, getIconBtn, getInputStyle } from "../components/ui.jsx";
import { money, monthKey, todayStr } from "../lib/format.js";
import { THEME } from "../theme.js";

/* ---------------- KATEGORIYALAR ---------------- */
export function CategoriesView({ transactions, categories, isAdmin, onAddCategory, onAddSubcategory, onRenameCategory, onDeleteCategory, onDeleteSubcategory }) {
  const [open, setOpen] = useState(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [subInput, setSubInput] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDelCat, setConfirmDelCat] = useState(null);
  const [confirmDelSub, setConfirmDelSub] = useState(null);
  const catNames = Object.keys(categories || {});
  const curMonth = todayStr().slice(0, 7);

  const totalsByCat = useMemo(() => {
    const map = {};
    catNames.forEach((c) => (map[c] = { month: 0, all: 0 }));
    transactions.filter((t) => t.type === "chiqim").forEach((t) => {
      if (!map[t.category]) map[t.category] = { month: 0, all: 0 };
      map[t.category].all += t.amount;
      if (monthKey(t.date) === curMonth) map[t.category].month += t.amount;
    });
    return map;
  }, [transactions, curMonth, catNames]);

  function submitNewCategory() {
    const clean = newCatName.trim();
    if (!clean) return;
    onAddCategory(clean);
    setNewCatName("");
    setNewCatOpen(false);
    setOpen(clean);
  }
  function submitSub(cat) {
    const clean = (subInput[cat] || "").trim();
    if (!clean) return;
    onAddSubcategory(cat, clean);
    setSubInput((s) => ({ ...s, [cat]: "" }));
  }
  function submitRename() {
    const clean = renameVal.trim();
    if (!clean || !renaming) return setRenaming(null);
    onRenameCategory(renaming, clean);
    setRenaming(null);
    setRenameVal("");
  }

  return (
    <div>
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Button onClick={() => setNewCatOpen((v) => !v)}><Plus size={14} /> Yangi kategoriya</Button>
        </div>
      )}
      {newCatOpen && (
        <Card style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            autoFocus
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNewCategory()}
            placeholder="Kategoriya nomi, masalan: Sug'urta"
            style={{ ...getInputStyle(), flex: 1 }}
          />
          <Button onClick={submitNewCategory}>Qo'shish</Button>
          <Button variant="ghost" onClick={() => { setNewCatOpen(false); setNewCatName(""); }}>Bekor qilish</Button>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {catNames.length === 0 && <EmptyState text="Hozircha kategoriya yo'q" />}
        {catNames.map((cat) => {
          const isOpen = open === cat;
          const t = totalsByCat[cat] || { month: 0, all: 0 };
          const subs = categories[cat] || [];
          return (
            <Card key={cat} style={{ padding: 0 }}>
              <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
                <button onClick={() => setOpen(isOpen ? null : cat)} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0 }}>
                  <FolderTree size={16} color={THEME.violet} style={{ flexShrink: 0 }} />
                  {renaming === cat ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitRename()}
                      style={{ ...getInputStyle(), padding: "5px 8px", width: 180 }}
                    />
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{cat}</span>
                  )}
                  <span style={{ fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>({subs.length} subkategoriya)</span>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.rose }}>{money(t.month)}</div>
                    <div style={{ fontSize: 10.5, color: THEME.muted }}>shu oy</div>
                  </div>
                  {isAdmin && renaming !== cat && (
                    <>
                      <button onClick={() => { setRenaming(cat); setRenameVal(cat); }} title="Nomini o'zgartirish" className="uvix-iconbtn" style={getIconBtn()}><Pencil size={13} /></button>
                      <button onClick={() => setConfirmDelCat(cat)} title="O'chirish" className="uvix-iconbtn" style={getIconBtn()}><Trash2 size={13} color={THEME.rose} /></button>
                    </>
                  )}
                  {isAdmin && renaming === cat && (
                    <button onClick={submitRename} title="Saqlash" className="uvix-iconbtn" style={getIconBtn()}><ChevronDown size={13} style={{ transform: "rotate(-90deg)" }} /></button>
                  )}
                  <ChevronDown onClick={() => setOpen(isOpen ? null : cat)} size={16} style={{ cursor: "pointer", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", color: THEME.muted }} />
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: "0 14px 14px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: isAdmin ? 10 : 0 }}>
                    {subs.map((s) => (
                      <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, padding: "5px 10px", borderRadius: 8, background: THEME.chip, color: THEME.text }}>
                        {s}
                        {isAdmin && (
                          <button onClick={() => setConfirmDelSub({ cat, sub: s })} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: THEME.muted }}>
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                    {subs.length === 0 && <span style={{ fontSize: 11.5, color: THEME.muted }}>Subkategoriya yo'q</span>}
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6, maxWidth: 320 }}>
                      <input
                        value={subInput[cat] || ""}
                        onChange={(e) => setSubInput((s) => ({ ...s, [cat]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitSub(cat)}
                        placeholder="Yangi subkategoriya"
                        style={{ ...getInputStyle(), fontSize: 12.5, padding: "7px 10px" }}
                      />
                      <Button onClick={() => submitSub(cat)} style={{ padding: "7px 12px", fontSize: 12 }}>+ Qo'shish</Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {confirmDelCat && (
        <ConfirmDialog
          message={`"${confirmDelCat}" kategoriyasini o'chirmoqchimisiz? Bu kategoriyadagi mavjud rasxod yozuvlari saqlanib qoladi, lekin yangi rasxod qo'shishda bu kategoriya endi ko'rinmaydi.`}
          onCancel={() => setConfirmDelCat(null)}
          onConfirm={() => { onDeleteCategory(confirmDelCat); setConfirmDelCat(null); if (open === confirmDelCat) setOpen(null); }}
        />
      )}
      {confirmDelSub && (
        <ConfirmDialog
          message={`"${confirmDelSub.sub}" subkategoriyasini o'chirmoqchimisiz?`}
          onCancel={() => setConfirmDelSub(null)}
          onConfirm={() => { onDeleteSubcategory(confirmDelSub.cat, confirmDelSub.sub); setConfirmDelSub(null); }}
        />
      )}
    </div>
  );
}
