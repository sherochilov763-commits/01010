// telegram-userbot.js — shaxsiy Telegram akkauntga ulanib turadigan, xabarlarni
// qabul qiladigan va yuboradigan modul. MTProto (teleproto) orqali ishlaydi —
// bu Bot API emas, balki haqiqiy foydalanuvchi sessiyasi.

const path = require("path");
const crypto = require("crypto");
const { TelegramClient } = require("teleproto");
const { StringSession } = require("teleproto/sessions");

let client = null;
let connecting = false;
let lastError = null;
let onNewMessageCallback = null;
let mediaDir = null; // rasmlar saqlanadigan papka (server.js tomonidan beriladi)
// UVIX orqali yuborilgan xabarlarning Telegram ID'lari — shu orqali newMessage
// hodisasi ularni "ikkinchi marta" saqlab qo'ymasligini nazorat qilamiz.
const ownSentMessageIds = new Set();

function setMediaDir(dir) {
  mediaDir = dir;
}

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
        if (!msg) return;

        // Agar bu xabar UVIX'ning o'zi orqali (shu jarayonda) yuborilgan bo'lsa —
        // uni qayta saqlamaymiz (chunki /send endpointi allaqachon saqlagan).
        if (msg.out && ownSentMessageIds.has(msg.id)) {
          ownSentMessageIds.delete(msg.id);
          return;
        }

        // msg.out === true, lekin bizning ro'yxatimizda yo'q — demak bu xabar
        // hisobning BOSHQA qurilmasidan (masalan telefondagi Telegram ilovasi)
        // to'g'ridan-to'g'ri yuborilgan. Buni ham CRM'da "chiquvchi" sifatida saqlaymiz.
        const isOut = !!msg.out;

        let fromName = "";
        let username = "";
        let phone = "";
        const chatId = String(msg.chatId || "");

        if (!isOut) {
          const sender = await msg.getSender();
          const fullName = sender ? [sender.firstName, sender.lastName].filter(Boolean).join(" ") : "";
          const title = sender?.title || ""; // guruh/kanal nomi (foydalanuvchida bo'lmaydi)
          const usernameTag = sender?.username ? `@${sender.username}` : "";
          const phoneTag = sender?.phone ? `+${sender.phone}` : "";
          // Hech narsa aniqlanmasa ham, kamida chatId'ni korsatamiz — shunda bir nechta
          // "Noma'lum" birlashib ketmaydi, har biri o'zining ID'si bilan ajralib turadi.
          fromName = fullName || title || usernameTag || phoneTag || `Noma'lum (${chatId})`;
          username = sender?.username || "";
          phone = sender?.phone || "";
        }

        // Xabar matnini aniqlaymiz — agar rasm/video/fayl bo'lsa, mos belgi qo'shamiz
        let text = msg.message || "";
        let mediaUrl = null;
        let mediaType = null;
        if (msg.media) {
          if (msg.photo && mediaDir) {
            // Rasmning o'zini yuklab olamiz — shunda CRM'da haqiqiy rasm korinadi
            try {
              const buffer = await client.downloadMedia(msg, {});
              if (buffer) {
                const filename = `${crypto.randomBytes(12).toString("hex")}.jpg`;
                require("fs").writeFileSync(path.join(mediaDir, filename), buffer);
                mediaUrl = `/api/photos/${filename}`;
                mediaType = "photo";
              }
            } catch (e) {
              console.error("Rasmni yuklab olishda xato:", e.message);
            }
          }
          const mediaLabel = msg.photo ? "📷 Rasm" : msg.video ? "🎥 Video" : msg.voice ? "🎤 Ovozli xabar" : msg.document ? "📎 Fayl" : "📎 Media";
          text = text ? `${mediaLabel}: ${text}` : (mediaUrl ? text : mediaLabel);
        }
        if (!text && !mediaUrl) text = "[Bo'sh xabar]";

        if (onNewMessageCallback) {
          onNewMessageCallback({
            chatId,
            fromName,
            username,
            phone,
            text,
            mediaUrl,
            mediaType,
            out: isOut,
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
  const sent = await client.sendMessage(chatId, { message: text });
  if (sent && sent.id != null) ownSentMessageIds.add(sent.id);
  return sent;
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

module.exports = { connectFromSettings, disconnect, sendMessage, getRecentMessages, getStatus, isConnected, setMediaDir };
