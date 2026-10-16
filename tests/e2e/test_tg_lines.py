# Har yo'nalishning o'z Telegram akkaunti: chatlar, lidlar, mijozlar, chat izohlari yo'nalish bo'yicha ajraladi
import asyncio, json
from common import *  # noqa: F401,F403

def seed():
    dbset("uvix:telegramMessages", {
        "777001": [{"id": "m1", "tgId": 10, "text": "Banner kerak", "out": False, "date": "2026-10-15T09:00:00.000Z"}],
        "on:888001": [{"id": "m2", "tgId": 11, "text": "Oniks stol narxi?", "out": False, "date": "2026-10-15T10:00:00.000Z"}],
    })
    dbset("uvix:telegramContacts", {"777001": {"name": "Malika Interior"}, "on:888001": {"name": "Oniks Mijoz"}})
    leads = [
        {"id": "l1", "customer": "Malika Interior", "telegramChatId": "777001", "stage": "new", "createdAt": "2026-10-15T09:00:00Z", "createdBy": "Aziza Karimova"},
        {"id": "l2", "customer": "Oniks Mijoz", "telegramChatId": "on:888001", "stage": "new", "createdAt": "2026-10-15T10:00:00Z", "createdBy": "Administrator"},
        {"id": "l3", "customer": "Ofis peshlavha", "line": "UVONYX", "stage": "new", "createdAt": "2026-10-15T10:00:00Z", "createdBy": "Administrator"},
    ]
    dbset("uvix:leads", leads)
    dbset("uvix:chatMeta", {"777001": {"pinned": "2026-10-15T09:00:00Z"}, "on:888001": {"pinned": "2026-10-15T09:00:00Z"}})
    c = json.loads(api("/api/kv/uvix:customers", token=admin_token())["value"])
    c.append({"id": "c9", "key": "oniks mijoz", "name": "Oniks Mijoz", "line": "UVONYX", "aliases": [], "createdAt": "2026-10-15T10:00:00Z"})
    dbset("uvix:customers", c)

def chats(tok): return {c["chatId"]: c for c in api("/api/telegram-user/chats", token=tok).get("chats", [])}
def kv(key, tok): return json.loads(api("/api/kv/" + key, token=tok)["value"])

async def main():
    adm = admin_token()
    seed()
    errs = []
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    # ---------- Rahbar ----------
    ch = chats(adm)
    ok("rahbar: ikkala akkaunt chatlari, yo'nalish belgisi bilan", ch.get("777001", {}).get("line") == "UVIXPRINT" and ch.get("on:888001", {}).get("line") == "UVONYX", ch)
    st = api("/api/telegram-user/status?line=UVONYX", token=adm)
    ok("rahbar: UVONYX akkaunt holati alohida", st.get("status") in ("disconnected", "error"), st)
    # ---------- UVIXPRINT xodimi ----------
    ch = chats(az)
    ok("UVIXPRINT xodimi: faqat o'z akkaunti chati", list(ch) == ["777001"], list(ch))
    r = api("/api/telegram-user/messages/on%3A888001", token=az)
    ok("UVONYX chati xabarlari — «topilmadi»", r.get("_code") == 404, r)
    r = api("/api/telegram-user/send", {"chatId": "on:888001", "text": "salom"}, az)
    ok("UVONYX chatiga yozib bo'lmaydi", r.get("_code") == 404, r)
    ok("lidlar: faqat UVIXPRINT (l1)", sorted(l["id"] for l in kv("uvix:leads", az)) == ["l1"], [l["id"] for l in kv("uvix:leads", az)])
    ok("mijozlar: UVONYX mijozi ko'rinmaydi", all(c.get("line") != "UVONYX" for c in kv("uvix:customers", az)) and len(kv("uvix:customers", az)) >= 1)
    stt = api("/api/chat-tools/state", token=az)
    ok("chat sozlamalari: faqat o'z chatlari", list(stt.get("meta", {})) == ["777001"], stt.get("meta"))
    r = api("/api/chat-tools/notes/on%3A888001", {"text": "x"}, az)
    ok("UVONYX chatiga izoh yozib bo'lmaydi", r.get("_code") == 404, r)
    # PUT: ko'rinmagan lidlar o'chmaydi
    api("/api/kv/uvix:leads", {"value": json.dumps(kv("uvix:leads", az))}, az, method="PUT")
    ok("PUT: UVONYX lidlari saqlanib qoldi", sorted(l["id"] for l in kv("uvix:leads", adm)) == ["l1", "l2", "l3"])
    # Yangi lid xodim yo'nalishiga yoziladi
    r = api("/api/kv/uvix:leads/merge", {"upserts": [{"item": {"id": "l4", "customer": "Yangi", "stage": "new", "line": "UVONYX"}, "at": "start"}], "deletes": ["l2"]}, az)
    al = {l["id"]: l for l in kv("uvix:leads", adm)}
    ok("merge: yangi lid — UVIXPRINT, UVONYX lidini o'chirib bo'lmaydi", al.get("l4", {}).get("line") == "UVIXPRINT" and "l2" in al, list(al))
    # ---------- Aziza → UVONYX ----------
    el = kv("uvix:employees", adm)
    for e in el:
        if e["id"] == "aziza": e["line"] = "UVONYX"
    api("/api/kv/uvix:employees", {"value": json.dumps(el)}, adm, method="PUT")
    ch = chats(az)
    ok("UVONYX xodimi: faqat UVONYX akkaunti chati", list(ch) == ["on:888001"], list(ch))
    ok("UVONYX lidlari: l2 (chat) va l3 (qo'lda)", sorted(l["id"] for l in kv("uvix:leads", az)) == ["l2", "l3"], [l["id"] for l in kv("uvix:leads", az)])
    ok("UVONYX mijozi ko'rinadi", any(c.get("line") == "UVONYX" for c in kv("uvix:customers", az)))
    r = api("/api/telegram-user/folders", token=az)
    ok("papkalar (asosiy akkaunt) UVONYX xodimiga ko'rinmaydi", r.get("folders") == [], r)
    # ---------- Sozlamalar: ikki akkaunt kartasi ----------
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Sozlamalar")
        btn = d.locator("button", has_text="Integratsiyalar")
        if await btn.count(): await btn.first.click(); await d.wait_for_timeout(800)
        body = await d.locator("body").inner_text()
        ok("Sozlamalar: «UVIXPRINT Telegram» va «UVONYX Telegram»", "UVIXPRINT Telegram" in body and "UVONYX Telegram" in body, body[:400])
        await d.screenshot(path=OUT + "tg_lines_settings.png", full_page=False)
        await nav(d, "Chatlar"); await d.wait_for_timeout(1500)
        ok("Chatlar: rahbarda UVONYX chati «ON» belgisi bilan", await d.locator("[data-chat='on:888001'] [data-chat-line=UVONYX]").count() == 1)
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
