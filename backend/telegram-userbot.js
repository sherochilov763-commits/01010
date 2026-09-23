// telegram-userbot.js — shaxsiy Telegram akkauntga ulanib turadigan, xabarlarni
// qabul qiladigan va yuboradigan modul. MTProto (teleproto) orqali ishlaydi —
// bu Bot API emas, balki haqiqiy foydalanuvchi sessiyasi.

const { TelegramClient } = require("teleproto");
const { StringSession } = require("teleproto/sessions");

let client = null;
let connecting = false;
let lastError = null;
let onNewMessageCallback = null;

function isConnected() {
  return !!client && client.connected;
}

function getStatus() {
  if (connecting) return { status: "connecting" };
  if (isConnected()) return { status: "connected" };
  if (lastError) return { status: "error", message: lastError };
  return { status: "disconnected" };
}

// Sozlamalardan (apiId, apiHash, sessionString) o'qib, ulanishni boshlaydi.
// onNewMessage(fromUserId, fromName, text, chatId) — yangi xabar kelganda chaqiriladi.
async function connectFromSettings(settings, onNewMessage) {
  onNewMessageCallback = onNewMessage;
  const apiId = parseInt(settings?.telegramUserApiId, 10);
  const apiHash = settings?.telegramUserApiHash;
  const sessionString = settings?.telegramUserSession;

  if (!apiId || !apiHash || !sessionString) {
    lastError = "Sozlamalar to'liq emas (API ID / API Hash / Session)";
    return { ok: false, error: lastError };
  }

  try {
    connecting = true;
    lastError = null;
    const session = new StringSession(sessionString);
    client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
    await client.connect();

    client.updates.on("newMessage", async (update) => {
      try {
        const msg = update.message;
        if (!msg || msg.out) return; // ozimiz yuborgan xabarni ozimiz qayta ishlamaymiz
        const sender = await msg.getSender();
        const fullName = sender ? [sender.firstName, sender.lastName].filter(Boolean).join(" ") : "";
        const username = sender?.username ? `@${sender.username}` : "";
        const phone = sender?.phone ? `+${sender.phone}` : "";
        const fromName = fullName || username || phone || "Noma'lum";
        const chatId = String(msg.chatId || sender?.id || "");

        // Xabar matnini aniqlaymiz — agar rasm/video/fayl bo'lsa, mos belgi qo'shamiz
        let text = msg.message || "";
        if (msg.media) {
          const mediaLabel = msg.photo ? "📷 Rasm" : msg.video ? "🎥 Video" : msg.voice ? "🎤 Ovozli xabar" : msg.document ? "📎 Fayl" : "📎 Media";
          text = text ? `${mediaLabel}: ${text}` : mediaLabel;
        }
        if (!text) text = "[Bo'sh xabar]";

        if (onNewMessageCallback) {
          onNewMessageCallback({
            chatId,
            fromName,
            username: sender?.username || "",
            phone: sender?.phone || "",
            text,
            date: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
          });
        }
      } catch (e) {
        console.error("Telegram xabarni qayta ishlashda xato:", e.message);
      }
    });

    connecting = false;
    return { ok: true };
  } catch (e) {
    connecting = false;
    lastError = e.message;
    client = null;
    return { ok: false, error: e.message };
  }
}

async function disconnect() {
  if (client) {
    try {
      await client.disconnect();
    } catch (e) {
      // e'tiborsiz qoldiramiz
    }
    client = null;
  }
}

async function sendMessage(chatId, text) {
  if (!isConnected()) throw new Error("Telegram akkauntga ulanmagan");
  await client.sendMessage(chatId, { message: text });
}

async function getRecentMessages(chatId, limit = 30) {
  if (!isConnected()) throw new Error("Telegram akkauntga ulanmagan");
  const messages = await client.getMessages(chatId, { limit });
  return messages
    .map((m) => ({
      id: String(m.id),
      text: m.message || "",
      out: !!m.out,
      date: new Date((m.date || 0) * 1000).toISOString(),
    }))
    .reverse();
}

module.exports = { connectFromSettings, disconnect, sendMessage, getRecentMessages, getStatus, isConnected };
