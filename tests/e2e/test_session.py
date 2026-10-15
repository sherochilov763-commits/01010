# A2: sessiya tiklanadi, ekran qulflanadi, ochiq qurilmalar — haqiqiy backend
import asyncio, json, time, datetime
from common import *  # noqa: F401,F403

async def is_login(pg): return await pg.locator("[data-testid=desktop-login], .ul-person, .ul-pad").count() > 0
async def type_pin(pg, pin):
    for d in pin: await pg.locator(f"[data-testid=lock-screen] [data-key='{d}']").click()

async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")
        a = await ctx.new_page(); a.on("pageerror", lambda e: errs.append("A:" + str(e)))
        await dlogin(a, "Administrator", "0000")
        await nav(a, "Buyurtmalar")
        tok1 = await a.evaluate("localStorage.getItem('uvix_auth_token')")
        ok("token qurilmada saqlanadi", bool(tok1))
        # 1) F5 — qayta kirish so'ralmaydi, bo'lim saqlanadi
        await a.reload(); await a.wait_for_timeout(2500)
        ok("F5: kirish ekrani yo'q", not await is_login(a))
        ok("F5: «Buyurtmalar» bo'limida qoldi", await a.locator("h1", has_text="Buyurtmalar").count() >= 1 or await a.locator("[data-testid=new-order]").count() == 1)
        # 2) yangi oyna (ilova qayta ochildi) — kirish tiklanadi
        a2 = await ctx.new_page(); a2.on("pageerror", lambda e: errs.append("A2:" + str(e)))
        await a2.goto(B); await a2.wait_for_timeout(2500)
        ok("yangi oyna: kirish tiklandi", not await is_login(a2))
        # 3) qulf: ikkala oynada sinxron
        await nav(a, "Sozlamalar"); await a.wait_for_timeout(500)
        await a.locator("[data-testid=lock-now]").click(); await a.wait_for_timeout(600)
        ok("«Hozir qulflash» → qulf ekrani", await a.locator("[data-testid=lock-screen]").count() == 1)
        await a2.wait_for_timeout(600)
        ok("boshqa oynada ham qulflandi", await a2.locator("[data-testid=lock-screen]").count() == 1)
        await a.screenshot(path=S + "a2_lock.png")
        ok("qulf ostidagi ilova inert", await a.evaluate("[...document.querySelectorAll('div')].some(d => d.inert)"))
        await type_pin(a, "1111"); await a.locator("[data-testid=lock-open]").click(); await a.wait_for_timeout(800)
        ok("noto'g'ri PIN — xato, qulf turadi", await a.locator("[data-testid=lock-screen]").count() == 1 and "noto'g'ri" in (await a.locator("[data-testid=lock-screen] [role=alert]").inner_text()))
        await a.keyboard.type("0000"); await a.keyboard.press("Enter"); await a.wait_for_timeout(900)
        ok("klaviaturadan to'g'ri PIN → ochildi", await a.locator("[data-testid=lock-screen]").count() == 0)
        ok("ochilgach shu sahifada (Sozlamalar)", await a.locator("[data-testid=security-section]").count() == 1)
        await a2.wait_for_timeout(600)
        ok("boshqa oyna ham ochildi", await a2.locator("[data-testid=lock-screen]").count() == 0)
        await a2.close()
        # 4) harakatsizlik: muddat o'tgan holda ochish → qulf
        await a.evaluate("localStorage.setItem('uvix_lock_min','5'); localStorage.setItem('uvix_last_active', String(Date.now() - 6*60000))")
        await a.reload(); await a.wait_for_timeout(2500)
        ok("6 daqiqa harakatsizlikdan keyin ochilganda — qulf", await a.locator("[data-testid=lock-screen]").count() == 1)
        await a.keyboard.type("0000"); await a.keyboard.press("Enter"); await a.wait_for_timeout(900)
        ok("PIN bilan ochildi", await a.locator("[data-testid=lock-screen]").count() == 0)
        # sessiya davomida: oxirgi faollik eski bo'lsa — 15 s ichida qulflanadi
        await a.evaluate("localStorage.setItem('uvix_last_active', String(Date.now() - 6*60000))")
        await a.wait_for_timeout(16500)
        ok("ish paytida harakatsizlik → qulf", await a.locator("[data-testid=lock-screen]").count() == 1)
        await a.keyboard.type("0000"); await a.keyboard.press("Enter"); await a.wait_for_timeout(900)
        await a.evaluate("localStorage.setItem('uvix_lock_min','15')")
        # 5) ochiq qurilmalar: ikkinchi qurilma (alohida brauzer)
        ctx2 = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
        m = await ctx2.new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await m.goto(B); await m.wait_for_selector(".ul-person, .ul-pad", timeout=15000)
        if await m.locator(".ul-person").count(): await m.locator(".ul-person", has_text="Administrator").click()
        for d in "0000": await m.locator(f".ul-key[aria-label='{d}']").click()
        await m.locator(".ul-primary", has_text="Kirish").click(); await m.wait_for_timeout(2500)
        for _ in range(3):
            if await m.locator("text=Keyinroq").count(): await m.locator("text=Keyinroq").first.click(); await m.wait_for_timeout(500)
        ok("telefonda kirildi", not await is_login(m))
        await nav(a, "Dashboard"); await nav(a, "Sozlamalar"); await a.wait_for_timeout(800)
        rows = a.locator("[data-testid=sessions] [data-session]")
        txt = await a.locator("[data-testid=sessions]").inner_text()
        ok("ro'yxatda 2 qurilma: shu kompyuter va iPhone", await rows.count() >= 2 and "shu qurilma" in txt and "iPhone" in txt, txt)
        await a.screenshot(path=S + "a2_sessions.png")
        await a.locator("[data-testid=sessions] [data-session]", has_text="iPhone").locator("[data-testid=session-revoke]").click(); await a.wait_for_timeout(800)
        ok("iPhone chiqarildi — ro'yxatdan ketdi", "iPhone" not in await a.locator("[data-testid=sessions]").inner_text())
        await m.reload(); await m.wait_for_timeout(2500)
        ok("chiqarilgan telefonda — kirish ekrani", await is_login(m))
        # admin: barcha xodimlar seanslari
        az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
        api("/api/me/sessions", token=az)
        await a.locator("[data-testid=sessions-all]").click(); await a.wait_for_timeout(700)
        ok("admin: barcha xodimlar (Aziza ham)", "Aziza" in await a.locator("[data-testid=sessions]").inner_text())
        # operator boshqaning seansini chiqara olmaydi
        mine = api("/api/me/sessions", token=az)["sessions"]
        adm_s = api("/api/me/sessions?all=1", token=api("/api/auth/login", {"employeeId": [e for e in api("/api/auth/employees")["employees"] if e["role"] == "admin"][0]["id"], "pin": "0000"})["token"])["sessions"]
        other = [s for s in adm_s if s["empId"] != "aziza"][0]
        r = api("/api/me/sessions/" + other["id"], token=az, method="DELETE")
        ok("operator boshqaning seansini chiqara olmaydi", r.get("_code") == 403, r)
        ok("operator faqat o'zinikini ko'radi", all(s["empId"] == "aziza" for s in mine))
        # 6) Chiqish — token serverda bekor
        tok = await a.evaluate("localStorage.getItem('uvix_auth_token')")
        await a.locator("button", has_text="Chiqish").first.click(); await a.wait_for_timeout(1500)
        ok("Chiqish → kirish ekrani", await is_login(a))
        r = api("/api/auth/me", token=tok)
        ok("chiqqan token serverda yaroqsiz", r.get("_code") == 401, r)
        await a.reload(); await a.wait_for_timeout(1500)
        ok("chiqqandan keyin F5 — kirish ekrani", await is_login(a))
        # 7) Qulfdan «Boshqa xodim»
        await dlogin(a, "Aziza", "1234"); await a.evaluate("window.dispatchEvent(new Event('uvix:lock-now'))"); await a.wait_for_timeout(500)
        await a.locator("[data-testid=lock-logout]").click(); await a.wait_for_timeout(1500)
        ok("qulfdan «Boshqa xodim» → kirish ekrani", await is_login(a))
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
if __name__ == "__main__":
    asyncio.run(main())
    finish()
