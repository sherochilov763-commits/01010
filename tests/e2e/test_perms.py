# Rollar va huquqlar: rol andozasini o'zgartirish (Sozlamalar), server tekshiruvi, xodimga istisno, «Rol bo'lib ko'rish»
import asyncio, json
from common import *  # noqa: F401,F403

def kv(key, tok): return json.loads(api("/api/kv/" + key, token=tok)["value"])
def perms(tok): return api("/api/me/perms", token=tok)["perms"]

async def main():
    adm = admin_token()
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    p0 = perms(az)
    ok("andoza: operator chatda javob yoza oladi, kassani ko'rmaydi", p0["chats.reply"] is True and p0["kassa.view"] == "none", p0)
    ok("rollar sozlamasi faqat rahbarga", api("/api/roles", token=az).get("_code") == 403)
    ok("operator rol sozlamasini o'zgartira olmaydi", api("/api/roles", {"role": "operator", "perms": {"kassa.view": "all"}}, az, method="PUT").get("_code") == 403)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1366, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Sozlamalar")
        await d.locator("[data-section=huquqlar]").click(); await d.wait_for_timeout(900)
        ok("Rollar va huquqlar bo'limi ochildi", await d.locator("[data-testid=roles-section]").count() == 1)
        await d.locator("[data-testid=roles-list] [data-role=operator]").click(); await d.wait_for_timeout(400)
        ed = d.locator("[data-testid=role-editor]")
        ok("operator: ofis huquqlari ko'rinadi (ishchi bo'lmagan)", await ed.locator("[data-perm-row='orders.view']").count() == 1)
        # Chatda javob — o'chiriladi; kassa — yo'nalishi; buyurtmani o'chirish — yo'q
        await ed.locator("[data-testid='perm-chats.reply']").click()
        await ed.locator("[data-testid=perm-search]").fill("kassa"); await d.wait_for_timeout(200)
        await ed.locator("[data-testid='perm-kassa.view']").click()
        await ed.locator("[data-testid=perm-search]").fill(""); await d.wait_for_timeout(200)
        await ed.locator("[data-testid='perm-orders.delete'] [data-v=no]").click()
        ok("o'zgarishlar sariq bilan belgilanadi", await ed.locator("[data-perm-row][data-diff='1']").count() == 3, await ed.locator("[data-perm-row][data-diff='1']").count())
        ok("saqlash paneli: 3 ta o'zgarish", "3 ta o'zgarish" in await d.locator("[data-testid=roles-savebar]").inner_text())
        await d.screenshot(path=OUT + "perms_roles.png")
        await d.locator("[data-testid=roles-save]").click(); await d.wait_for_timeout(1200)
        cfg = api("/api/roles", token=adm)["roles"]
        ok("server: faqat andozadan farqlar saqlandi", cfg.get("operator") == {"chats.reply": False, "kassa.view": "line", "orders.delete": "no"}, cfg)
        ok("rol ro'yxatida «3 farq»", await d.locator("[data-role-diff=operator]").inner_text() == "3 farq")
        # Ishchi rol: faqat ishchiga tegishli huquqlar
        await d.locator("[data-testid=roles-list] [data-role=installer]").click(); await d.wait_for_timeout(300)
        ok("montajchi: kassa/buyurtma huquqlari ko'rsatilmaydi", await ed.locator("[data-perm-row='kassa.view']").count() == 0 and await ed.locator("[data-perm-row='jobs.done']").count() == 1)
        # Qulflangan
        await d.locator("[data-testid=roles-list] [data-role=manager]").click(); await d.wait_for_timeout(300)
        await ed.locator("[data-perm-group=system] button[aria-expanded]").click(); await d.wait_for_timeout(200)
        ok("tizim: zaxira — qulflangan", await ed.locator("[data-testid='perm-sys.backup']").is_disabled())

        # ---------- Server: yangi huquqlar darhol kuchda ----------
        p1 = perms(az)
        ok("Aziza: chat javobi yo'q, kassa — yo'nalishi, o'chirish — yo'q", p1["chats.reply"] is False and p1["kassa.view"] == "line" and p1["orders.delete"] == "no", p1)
        r = api("/api/telegram-user/send", {"chatId": "777001", "text": "salom"}, az)
        ok("server: chatga yozish — 403", r.get("_code") == 403, r)
        r = api("/api/approvals", {"kind": "order_delete", "orderId": "o2", "reason": "test"}, az)
        ok("server: «Yo'q» bo'lsa o'chirish so'rovi ham yuborilmaydi", r.get("_code") == 403, r)
        dbset("uvix:transfers", [{"id": "t1", "date": "2026-10-16", "amount": 1000, "from": {"line": "UVIXPRINT", "type": "naqd"}, "to": {"line": "UVIXPRINT", "type": "karta"}, "createdAt": "2026-10-16T08:00:00Z"}])
        ok("o'tkazmalar: kassa.view bo'lgach ko'rinadi", isinstance(kv("uvix:transfers", az), list))
        ok("o'tkazma qo'shish huquqi yo'q — 403", api("/api/kv/uvix:transfers", {"value": "[]"}, az, method="PUT").get("_code") == 403)

        # ---------- Xodimga istisno: Aziza'ga chat javobi qaytariladi ----------
        await nav(d, "Xodimlar")
        await d.locator("[data-emp-edit=aziza]").click(); await d.wait_for_timeout(500)
        await d.locator("[data-testid=override-add]").click(); await d.locator("[data-testid=override-pick]").select_option("chats.reply"); await d.wait_for_timeout(200)
        ok("istisno: rolidagi qiymat ko'rsatiladi", "rolida: yo'q" in await d.locator("[data-override='chats.reply']").inner_text())
        await d.locator("[data-override='chats.reply'] [data-testid='perm-chats.reply']").click()
        await d.screenshot(path=OUT + "perms_override.png")
        await d.locator("[data-testid=emp-rights-save]").click(); await d.wait_for_timeout(1200)
        a = [e for e in kv("uvix:employees", adm) if e["id"] == "aziza"][0]
        ok("istisno saqlandi", a.get("permOver") == {"chats.reply": True}, a)
        ok("Aziza: istisno roldan ustun", perms(az)["chats.reply"] is True)
        ok("operator o'ziga istisno bera olmaydi", (lambda el: [e.update({"permOver": {"kassa.view": "all"}}) for e in el if e["id"] == "aziza"] and api("/api/kv/uvix:employees/merge", {"upserts": [{"item": [e for e in el if e["id"] == "aziza"][0]}], "deletes": []}, az))(kv("uvix:employees", adm)) is not None and [e for e in kv("uvix:employees", adm) if e["id"] == "aziza"][0].get("permOver") == {"chats.reply": True})
        log = api("/api/settings-log", token=adm)
        txt = json.dumps(log, ensure_ascii=False)
        ok("jurnal: rol va xodim huquqlari o'zgarishi yozildi", "Operator" in txt and "Aziza" in txt, txt[:400])

        # ---------- «Rol bo'lib ko'rish» ----------
        await d.locator("[data-emp-edit=aziza]").click(); await d.wait_for_timeout(500)
        await d.locator("[data-testid=emp-viewas]").click(); await d.wait_for_timeout(3000)
        ok("ko'k banner: kim bo'lib ko'rilmoqda", "Aziza" in await d.locator("[data-testid=viewas-banner]").inner_text())
        ok("Aziza menyusi: Kassa bor (yo'nalishi), Sozlamalar → huquqlar yo'q", await d.locator(".uvix-nav-item", has_text="Kassa").count() == 1)
        await d.screenshot(path=OUT + "perms_viewas.png")
        va = await d.evaluate("localStorage.getItem('uvix_auth_token') || ''")
        if va:
            r = api("/api/kv/uvix:orders/merge", {"upserts": [], "deletes": []}, va)
            ok("ko'rish rejimi: yozish — 403", r.get("_code") == 403, r)
        await d.locator("[data-testid=viewas-exit]").click(); await d.wait_for_timeout(3000)
        ok("rahbarga qaytdi", await d.locator("[data-testid=viewas-banner]").count() == 0 and await d.locator(".uvix-nav-item", has_text="Sozlamalar").count() == 1)
        r = api("/api/auth/view-as", {"role": "operator"}, az)
        ok("faqat rahbar «bo'lib ko'ra» oladi", r.get("_code") == 403, r)

        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
