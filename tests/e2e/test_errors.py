# A3: xatolar ushlanadi va adminga yetadi — haqiqiy backend
import asyncio, json, time, datetime
from common import *  # noqa: F401,F403

async def main():
    errs = []
    aid = [e for e in api("/api/auth/employees")["employees"] if e["role"] == "admin"][0]["id"]
    adm = api("/api/auth/login", {"employeeId": aid, "pin": "0000"})["token"]
    api("/api/system/errors", token=adm, method="DELETE")
    async with async_playwright() as p:
        b = await p.chromium.launch()
        a = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page()
        a.on("pageerror", lambda e: errs.append(str(e)))
        await dlogin(a, "Administrator", "0000")
        await a.evaluate("localStorage.setItem('uvix_crash_test','crm')")
        await nav(a, "CRM"); await a.wait_for_timeout(800)
        ok("bo'limdagi xato → tushunarli oyna (oq ekran emas)", await a.locator("[data-testid=error-screen]").count() == 1)
        ok("menyu ishlayveradi", await a.locator(".uvix-nav-item").count() > 5)
        code = (await a.locator("[data-testid=error-code]").inner_text()).split(":")[-1].strip()
        ok("xato kodi ko'rsatildi", len(code) == 6, code)
        await a.screenshot(path=S + "a3_error.png")
        await a.wait_for_timeout(800)
        er = api("/api/system/errors", token=adm)["errors"]
        ok("serverga yozildi: kod, bo'lim, xodim, qurilma", len(er) == 1 and code in er[0]["codes"] and er[0]["view"] == "crm" and er[0]["user"] == "Administrator" and "kompyuter" in er[0]["dev"], er[:1])
        nt = api("/api/notifications", token=adm)["items"]
        ok("adminga xabar (ilovada ham)", sum(1 for n in nt if n["cat"] == "system" and "xato" in (n["title"] + n["body"]).lower()) == 1, [n["title"] for n in nt[:5]])
        await a.locator("[data-testid=error-home]").click(); await a.wait_for_timeout(800)
        ok("«Bosh sahifaga» → Dashboard ishlaydi", await a.locator("[data-testid=error-screen]").count() == 0 and await a.locator("[data-testid=dash-kpis]").count() >= 1)
        # takror — bitta yozuv, bitta xabar
        await a.reload(); await a.wait_for_timeout(2000); await nav(a, "CRM"); await a.wait_for_timeout(1200)
        er = api("/api/system/errors", token=adm)["errors"]
        nt = api("/api/notifications", token=adm)["items"]
        ok("takroriy xato: bitta yozuv, 2 marta, yangi xabar yo'q", len(er) == 1 and er[0]["count"] == 2 and sum(1 for n in nt if n["cat"] == "system" and "xato" in (n["title"] + n["body"]).lower()) == 1, (er[0]["count"], len(nt)))
        await a.evaluate("localStorage.removeItem('uvix_crash_test')")
        await nav(a, "Dashboard")
        # global (ushlanmagan) xato va tarmoq shovqini
        await a.evaluate("() => { setTimeout(() => { throw new Error('Global sinov xatosi') }, 0); Promise.reject(new TypeError('Failed to fetch')); return 1; }")
        await a.wait_for_timeout(1200)
        er = api("/api/system/errors", token=adm)["errors"]
        ok("ushlanmagan xato ham yoziladi", any("Global sinov" in e["message"] for e in er))
        ok("tarmoq uzilishi (Failed to fetch) — xato hisoblanmaydi", not any("Failed to fetch" in e["message"] for e in er))
        # Sozlamalar → Ma'lumotlar
        await nav(a, "Sozlamalar"); await a.locator("[data-section=malumotlar]").click(); await a.wait_for_timeout(900)
        sec = a.locator("[data-testid=errors-section]")
        ok("«So'nggi xatolar»: xabar va kod", await sec.count() == 1 and code in await sec.inner_text())
        st = a.locator("[data-testid=system-status]")
        # holat serverdan keyinroq kelishi mumkin — aniq vaqt o'rniga element chiqquncha kutamiz
        try: await st.locator("[data-status=warn]", has_text="Xatolar").first.wait_for(timeout=10000)
        except Exception: pass
        ok("Tizim holati: «Xatolar (24 soat)» ogohlantirish", await st.locator("[data-status=warn]", has_text="Xatolar").count() == 1)
        await a.screenshot(path=S + "a3_settings.png", full_page=True)
        await sec.locator("[data-testid=errors-clear]").click(); await a.wait_for_timeout(700)
        ok("tozalash", "qayd etilmagan" in (await sec.inner_text()).lower())
        # server: noto'g'ri JSON — tushunarli javob, server yiqilmaydi
        import urllib.request
        req = urllib.request.Request(B + "/api/kv/uvix:orders/merge", data=b"{bad json", method="POST", headers={"content-type": "application/json", "authorization": "Bearer " + adm})
        try: urllib.request.urlopen(req); code400 = 200
        except urllib.error.HTTPError as e: code400 = e.code; body = json.loads(e.read())
        ok("buzuq so'rov → 400 JSON, server ishlayapti", code400 == 400 and body.get("error") == "invalid_json" and api("/api/health")["ok"])
        await b.close()
    ok("kutilgan xatolardan boshqasi yo'q", all(("Sinov xatosi" in e) or ("Global sinov" in e) or ("Failed to fetch" in e) for e in errs), errs)
if __name__ == "__main__":
    asyncio.run(main())
    finish()
