import { Avatar as UiAvatar } from "../../components/ui.jsx";
import { useEffect, useState } from "react";
import { AlertTriangle, Lock, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import PasskeySection from "../../auth/PasskeySection.jsx";
import { authLogin } from "../../storage.js";
import { Badge, Button, Card, Field, Modal, getInputStyle } from "../../components/ui.jsx";
import { money } from "../../lib/format.js";
import { roleLabel } from "../../constants.js";
import { THEME } from "../../theme.js";
import { AppearancePreviewCard, AppearanceSection } from "./AppearanceSection.jsx";
import { TrashSection } from "./TrashSection.jsx";
import { BackupRestoreSection } from "./BackupRestoreSection.jsx";
import { TelegramAccountSection } from "./TelegramAccountSection.jsx";
import { TelegramRoutesSection } from "./TelegramRoutesSection.jsx";
import { NotificationsSection } from "./NotificationsSection.jsx";
import { BackgroundSection } from "./BackgroundSection.jsx";

export function SettingsView({ notif, bgState, currentUser, employees, onSave, onLogout, isAdmin, settings, onSaveSettings, appearance, onApplyAppearance, orders, transactions, onRestoreOrder, onPermanentDeleteOrder, onRestoreTransaction, onPermanentDeleteTransaction, onRestorePayment, onPermanentDeletePayment, onResetAll, onSendBackupNow, onConnectTelegramUser, onDisconnectTelegramUser, onFetchTelegramUserStatus }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetPinError, setResetPinError] = useState("");
  const [rateStr, setRateStr] = useState(settings ? String(settings.usdRate) : "");
  const [rateMsg, setRateMsg] = useState("");
  const [tgToken, setTgToken] = useState(settings?.telegramBotToken || "");
  const [tgChatId, setTgChatId] = useState(settings?.telegramChatId || "");
  const [tgMsg, setTgMsg] = useState("");
  const [backupTime, setBackupTime] = useState(settings?.backupTime || "21:00");
  const [backupMsg, setBackupMsg] = useState("");
  const [sendingNow, setSendingNow] = useState(false);
  const [tgUnlocked, setTgUnlocked] = useState(false);
  const [tgUnlockPin, setTgUnlockPin] = useState("");
  const [tgUnlockError, setTgUnlockError] = useState("");
  const [tgUnlocking, setTgUnlocking] = useState(false);
  const [gmailUser, setGmailUser] = useState(settings?.gmailUser || "");
  const [gmailAppPassword, setGmailAppPassword] = useState(settings?.gmailAppPassword || "");
  const [gmailMsg, setGmailMsg] = useState("");

  function saveGmail() {
    onSaveSettings({ ...settings, gmailUser: gmailUser.trim(), gmailAppPassword: gmailAppPassword.trim() });
    setGmailMsg("Saqlandi");
  }

  async function unlockTelegram() {
    setTgUnlocking(true);
    setTgUnlockError("");
    try {
      const ok = await verifyPin(tgUnlockPin);
      if (!ok) {
        setTgUnlockError("PIN noto'g'ri");
        return;
      }
      setTgUnlocked(true);
      setTgUnlockPin("");
    } finally {
      setTgUnlocking(false);
    }
  }

  function saveTelegram() {
    onSaveSettings({ ...settings, telegramBotToken: tgToken.trim(), telegramChatId: tgChatId.trim(), backupTime });
    setTgMsg("Saqlandi");
  }
  function disableTelegram() {
    setTgToken("");
    setTgChatId("");
    onSaveSettings({ ...settings, telegramBotToken: "", telegramChatId: "" });
    setTgMsg("Xabarnomalar o'chirildi");
  }
  async function sendBackupNow() {
    setSendingNow(true);
    setBackupMsg("");
    try {
      await onSendBackupNow();
      setBackupMsg("Yuborildi — Telegram'ni tekshiring");
    } catch (e) {
      setBackupMsg(e?.message || "Yuborishda xato yuz berdi");
    } finally {
      setSendingNow(false);
    }
  }

  function changePin() {
    if (!/^\d{4,6}$/.test(pin)) return setMsg("PIN 4-6 xonali raqam bo'lishi kerak");
    const next = employees.map((e) => (e.id === currentUser.id ? { ...e, pin } : e));
    onSave(next);
    setMsg("PIN yangilandi");
    setPin("");
  }
  function saveRate() {
    const rate = parseFloat(rateStr.replace(/\s/g, "").replace(",", "."));
    if (!rate || rate <= 0) return setRateMsg("Kursni to'g'ri kiriting");
    onSaveSettings({ ...settings, usdRate: rate });
    setRateMsg("Kurs yangilandi");
  }
  async function verifyPin(pinToCheck) {
    try {
      await authLogin(currentUser.id, pinToCheck);
      return true;
    } catch (e) {
      return false;
    }
  }
  async function confirmResetWithPin() {
    const ok = await verifyPin(resetPin);
    if (!ok) {
      setResetPinError("PIN noto'g'ri");
      return;
    }
    onResetAll();
    setConfirmReset(false);
    setResetPin("");
    setResetPinError("");
  }

  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ flex: "2 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <AppearanceSection appearance={appearance} onApply={onApplyAppearance} />

        {bgState && <BackgroundSection bgState={bgState} />}
        {notif?.prefs && <NotificationsSection n={notif} />}

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <UiAvatar name={currentUser.name} size={44} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{currentUser.name}</div>
              <div style={{ fontSize: 12, color: THEME.muted, display: "flex", alignItems: "center", gap: 4 }}>
                <ShieldCheck size={13} /> {roleLabel(currentUser.role)}
              </div>
            </div>
          </div>
          <Field label="Yangi PIN kod">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={getInputStyle()} placeholder="0000" inputMode="numeric" maxLength={6} />
              <Button onClick={changePin} style={{ flexShrink: 0 }}>Saqlash</Button>
            </div>
          </Field>
          {msg && <div style={{ fontSize: 12, color: THEME.green, marginTop: 8 }}>{msg}</div>}
          <Button variant="ghost" onClick={onLogout} style={{ marginTop: 14 }}><LogOut size={14} /> Chiqish</Button>
        </Card>

        <PasskeySection currentUser={currentUser} theme={THEME} Card={Card} />

        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Valyuta formati</div>
          <div style={{ fontSize: 12.5, color: THEME.muted }}>Barcha summalar o'zbek so'mi formatida ko'rsatiladi, masalan: <b style={{ color: THEME.text }}>{money(1500000)}</b></div>
        </Card>

        {isAdmin && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Valyuta kursi (USD → so'm)</div>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10 }}>
              Tushum bo'limida 1 kv/m narxi dollarda kiritiladi va shu kurs orqali so'mga o'giriladi. Kurs faqat
              yangi kiritilayotgan yozuvlarga ta'sir qiladi — eski yozuvlar o'sha paytdagi kursda saqlanib qoladi.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={rateStr} onChange={(e) => setRateStr(e.target.value.replace(/[^0-9.,]/g, ""))} style={getInputStyle()} placeholder="12700" inputMode="decimal" />
              <Button onClick={saveRate} style={{ flexShrink: 0 }}>Saqlash</Button>
            </div>
            {rateMsg && <div style={{ fontSize: 12, color: THEME.green, marginTop: 8 }}>{rateMsg}</div>}
            <div style={{ fontSize: 12, color: THEME.muted, marginTop: 10 }}>
              Joriy kurs: <b style={{ color: THEME.text }}>1 $ = {money(settings?.usdRate || 0)}</b>
            </div>
          </Card>
        )}

        {isAdmin && onConnectTelegramUser && <TelegramAccountSection settings={settings} onSaveSettings={onSaveSettings} />}

        {isAdmin && (
          <Card>
            <BackupRestoreSection />
          </Card>
        )}

        {isAdmin && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={14} color={THEME.muted} /> Telegram xabarnomalari
            </div>
            {!tgUnlocked ? (
              <div>
                <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 12 }}>
                  Xavfsizlik uchun bu bo'lim qulflangan — ko'rish/o'zgartirish uchun PIN kodingizni kiriting.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={tgUnlockPin}
                    onChange={(e) => setTgUnlockPin(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && unlockTelegram()}
                    style={getInputStyle()}
                    placeholder="PIN kod"
                  />
                  <Button onClick={unlockTelegram} disabled={tgUnlocking} style={{ flexShrink: 0 }}>
                    {tgUnlocking ? "Tekshirilmoqda..." : "Ochish"}
                  </Button>
                </div>
                {tgUnlockError && <div style={{ fontSize: 12, color: THEME.rose, marginTop: 8 }}>{tgUnlockError}</div>}
              </div>
            ) : (
              <>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 12 }}>
              UVIX boti yangi buyurtma, to'lov, rasxod, hisobotlar va ogohlantirishlarni Telegram'ga yuboradi — har birini xodimlar guruhiga yoki faqat o'zingizga yo'naltirasiz (pastda).
              Sozlash: 1) <b style={{ color: THEME.text }}>@BotFather</b>'da bot yarating (token oling), 2) botni xodimlar guruhiga qo'shing va guruhga bitta xabar yozing,
              3) guruh Chat ID'sini kiriting (odatda <b style={{ color: THEME.text }}>-100…</b> bilan boshlanadi; uni guruhga <b style={{ color: THEME.text }}>@RawDataBot</b>'ni vaqtincha qo'shib bilsa bo'ladi).
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Field label="Bot token">
                <input value={tgToken} onChange={(e) => setTgToken(e.target.value)} style={getInputStyle()} placeholder="123456789:AAExampleTokenHere" />
              </Field>
              <Field label="Xodimlar guruhi Chat ID">
                <input value={tgChatId} onChange={(e) => setTgChatId(e.target.value)} style={getInputStyle()} placeholder="123456789" />
              </Field>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={saveTelegram}>Saqlash</Button>
                {(settings?.telegramBotToken || tgToken) && <Button variant="ghost" onClick={disableTelegram}>O'chirish</Button>}
              </div>
              {tgMsg && <div style={{ fontSize: 12, color: THEME.green }}>{tgMsg}</div>}
              <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 6 }}>
                Holat:
                {settings?.telegramBotToken && settings?.telegramChatId ? (
                  <Badge color={THEME.green} bg={THEME.greenBg}>Yoqilgan</Badge>
                ) : settings?.telegramBotToken ? (
                  <Badge color={THEME.amber} bg={THEME.amberBg}>Bot bor, guruh yo'q</Badge>
                ) : (
                  <Badge color={THEME.muted} bg={THEME.surface}>O'chirilgan</Badge>
                )}
              </div>
            </div>
            {settings?.telegramBotToken && <TelegramRoutesSection settings={settings} onSaveSettings={onSaveSettings} />}
            <div style={{ borderTop: `1px dashed ${THEME.border}`, marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Kunlik hisobot va zaxira nusxa</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 10 }}>
                Har kuni belgilangan vaqtda Excel hisobot (Buyurtmalar + Rasxodlar) va butun bazaning zaxira nusxasi
                Telegram'ga avtomatik yuboriladi (qayerga — yuqoridagi «Fayllar» qatorida).
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <Field label="Yuborish vaqti">
                  <input type="time" value={backupTime} onChange={(e) => setBackupTime(e.target.value)} style={{ ...getInputStyle(), width: "auto" }} />
                </Field>
                <Button onClick={saveTelegram}>Vaqtni saqlash</Button>
                <Button variant="ghost" onClick={sendBackupNow} disabled={sendingNow || !settings?.telegramBotToken}>
                  {sendingNow ? "Yuborilmoqda..." : "Hoziroq yubor"}
                </Button>
              </div>
              {backupMsg && <div style={{ fontSize: 12, color: backupMsg.includes("xato") ? THEME.rose : THEME.green, marginTop: 8 }}>{backupMsg}</div>}
            </div>
            <div style={{ borderTop: `1px dashed ${THEME.border}`, marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Email orqali PIN tiklash (Gmail)</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 10 }}>
                Xodim PIN'ini unutsa, "PIN'ni unutdingizmi?" havolasi orqali email'iga tasdiqlash kodi yuboriladi.
                Buning uchun Gmail hisobingizdan <b style={{ color: THEME.text }}>App Password</b> (ilova paroli) kerak —
                oddiy Gmail parolingiz emas. Google hisobingizda 2 bosqichli tasdiqlashni yoqib,
                myaccount.google.com/apppasswords sahifasidan yarating.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Field label="Gmail manzili">
                  <input value={gmailUser} onChange={(e) => setGmailUser(e.target.value)} style={getInputStyle()} placeholder="sizniki@gmail.com" type="email" />
                </Field>
                <Field label="App Password (16 belgili)">
                  <input value={gmailAppPassword} onChange={(e) => setGmailAppPassword(e.target.value)} style={getInputStyle()} placeholder="xxxx xxxx xxxx xxxx" type="password" />
                </Field>
                <div><Button onClick={saveGmail}>Saqlash</Button></div>
                {gmailMsg && <div style={{ fontSize: 12, color: THEME.green }}>{gmailMsg}</div>}
                <div style={{ fontSize: 11.5, color: THEME.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  Holat:
                  {settings?.gmailUser && settings?.gmailAppPassword ? (
                    <Badge color={THEME.green} bg={THEME.greenBg}>Yoqilgan</Badge>
                  ) : (
                    <Badge color={THEME.muted} bg={THEME.surface}>O'chirilgan</Badge>
                  )}
                </div>
              </div>
            </div>
              </>
            )}
          </Card>
        )}

        {isAdmin && (
          <Card style={{ borderColor: THEME.roseBorder }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: THEME.rose }}>Xavfli hudud</div>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 10 }}>Barcha tushum va rasxod ma'lumotlarini butunlay o'chirish. Bu amalni bekor qilib bo'lmaydi.</div>
            <Button variant="danger" onClick={() => setConfirmReset(true)}><Trash2 size={14} /> Barcha ma'lumotlarni tozalash</Button>
          </Card>
        )}
      </div>

      <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <AppearancePreviewCard appearance={appearance} />
        {isAdmin && (
          <TrashSection
            orders={orders}
            transactions={transactions}
            onRestoreOrder={onRestoreOrder}
            onPermanentDeleteOrder={onPermanentDeleteOrder}
            onRestoreTransaction={onRestoreTransaction}
            onPermanentDeleteTransaction={onPermanentDeleteTransaction}
            onRestorePayment={onRestorePayment}
            onPermanentDeletePayment={onPermanentDeletePayment}
          />
        )}
      </div>

      {confirmReset && (
        <Modal title="Xavfsizlik tasdiqlash" onClose={() => { setConfirmReset(false); setResetPin(""); setResetPinError(""); }} width={380}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13.5, color: THEME.text, display: "flex", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: THEME.roseBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={16} color={THEME.rose} />
              </div>
              <span style={{ paddingTop: 6 }}>Barcha tushum va rasxod ma'lumotlari <b>butunlay</b> o'chiriladi. Bu amalni bekor qilib bo'lmaydi. Davom etish uchun PIN kodingizni kiriting.</span>
            </div>
            <Field label="PIN kod">
              <input
                type="password"
                autoFocus
                value={resetPin}
                onChange={(e) => { setResetPin(e.target.value.replace(/\D/g, "")); setResetPinError(""); }}
                onKeyDown={(e) => e.key === "Enter" && confirmResetWithPin()}
                placeholder="****"
                inputMode="numeric"
                maxLength={6}
                style={getInputStyle()}
              />
            </Field>
            {resetPinError && <div style={{ color: THEME.rose, fontSize: 12.5 }}>{resetPinError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => { setConfirmReset(false); setResetPin(""); setResetPinError(""); }}>Bekor qilish</Button>
              <Button variant="danger" onClick={confirmResetWithPin} disabled={resetPin.length < 4}>Tasdiqlash va o'chirish</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
