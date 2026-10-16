# «Vazifalar»: qo'lda vazifa, avtomatik yetkazish (buyurtma «Tayyor»), bajarildi → «Topshirildi», ishchi telefoni, yo'nalish ajratish
import asyncio, datetime, json, time
from common import *  # noqa: F401,F403

IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
TODAY = datetime.date.today().isoformat()

def jobs(tok): return api("/api/jobs", token=tok).get("jobs", [])

async def main():
    adm = admin_token()
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        ok("menyuda «Vazifalar»", await d.locator(".uvix-nav-item", has_text="Vazifalar").count() == 1)
        await nav(d, "Vazifalar")
        ok("Vazifalar sahifasi ochildi", await d.locator("[data-testid=jobs-view]").count() == 1)
        # Qo'lda: O'lchov, bugun 23:30, Jasur (pechatchi) + Aziza
        await d.locator("[data-testid=job-new]").click(); await d.wait_for_timeout(400)
        f = d.locator("[data-testid=job-form]")
        await f.locator("[data-kind=measure]").click()
        await f.locator("[data-testid=job-title]").fill("Yunusobod — yangi mijoz o'lchovi")
        await f.locator("[data-testid=job-time]").fill("23:30")
        await f.locator("[data-testid=job-address]").fill("Yunusobod 4-kv")
        await f.locator("[data-person=jasur]").click(); await f.locator("[data-person=aziza]").click()
        await d.screenshot(path=OUT + "jobs_form.png")
        await f.locator("[data-testid=job-save]").click(); await d.wait_for_timeout(1200)
        j = [x for x in jobs(adm) if x["kind"] == "measure"]
        ok("saqlandi: o'lchov, bugun, 2 mas'ul", len(j) == 1 and j[0]["date"] == TODAY and j[0]["time"] == "23:30" and sorted(j[0]["assigneeIds"]) == ["aziza", "jasur"], j)
        ok("ro'yxatda «Bugun» guruhida", await d.locator("[data-job-group=today] [data-job]").count() >= 1)
        # Dizayn/pechat vazifalari ham ko'rinadi (faqat ko'rish)
        ok("pechat vazifasi ham ko'rinadi", await d.locator("[data-job-kind=print]").count() >= 1)
        # Avtomatik: o2 «Tayyor» → Yetkazish
        r = api("/api/orders/o2/stage", {"stage": "ready"}, adm)
        auto = []
        for _ in range(20):
            time.sleep(0.5)
            auto = [x for x in jobs(adm) if x.get("orderId") == "o2"]
            if auto: break
        ok("buyurtma «Tayyor» → avtomatik «Yetkazish» vazifasi", len(auto) == 1 and auto[0]["kind"] == "deliver" and auto[0]["auto"] and auto[0]["line"] == "UVIXPRINT", auto)
        await d.reload(); await d.wait_for_timeout(2000)
        card = d.locator(f"[data-job='{auto[0]['id']}']") if auto else None
        ok("ro'yxatda avtomatik vazifa (mas'ulsiz)", card is not None and await card.count() == 1 and "mas'ul tayinlanmagan" in await card.inner_text())
        await card.click(); await d.wait_for_timeout(400)
        await d.locator("[data-testid=job-form] [data-person=jasur]").click()
        await d.locator("[data-testid=job-form] [data-testid=job-save]").click(); await d.wait_for_timeout(1000)
        ok("Jasurga tayinlandi", jobs(adm) and [x for x in jobs(adm) if x["id"] == auto[0]["id"]][0]["assigneeIds"] == ["jasur"])
        # Kalendar
        await d.locator("[data-jobs-mode=calendar]").click(); await d.wait_for_timeout(500)
        ok("kalendar: bugungi kunda o'lchov", await d.locator(f"[data-cal-day='{TODAY}'] [data-cal-job]").count() >= 1)
        await d.screenshot(path=OUT + "jobs_calendar.png")
        await d.locator("[data-jobs-mode=list]").click(); await d.wait_for_timeout(300)
        await d.screenshot(path=OUT + "jobs_list.png")

        # ---------- Ishchi (pechatchi) telefoni ----------
        w = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPH, device_scale_factor=2, timezone_id="Asia/Tashkent")).new_page(); w.on("pageerror", lambda e: errs.append("W:" + str(e)))
        await mob_login(w, "Jasur", "2222"); await w.wait_for_selector(".uvix-worker-nav", timeout=15000); await w.wait_for_timeout(2000)
        mj = w.locator("[data-testid=my-jobs]")
        ok("ishchi: «Joydagi ishlar» bo'limi", await mj.count() == 1)
        ok("ishchi: bugungi o'lchov va sanasiz yetkazish («Bugun»da)", await mj.locator("[data-myjob]").count() == 2, await mj.inner_text() if await mj.count() else "")
        await w.screenshot(path=OUT + "jobs_worker.png")
        await mj.locator(f"[data-myjob-done='{auto[0]['id']}']").click(); await w.wait_for_timeout(300)
        await w.locator("button", has_text="Ha, bajarildi").click(); await w.wait_for_timeout(1200)
        o2 = [o for o in orders(adm) if o["id"] == "o2"][0]
        ok("yetkazish bajarildi → buyurtma «Topshirildi»", o2.get("prodStage") == "delivered", o2.get("prodStage"))
        ok("ishchi: bajarilgani ro'yxatdan ketdi", await mj.locator("[data-myjob]").count() == 1)
        await b.close()

    # ---------- Server: huquqlar va yo'nalish ----------
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    jt = api("/api/auth/login", {"employeeId": "jasur", "pin": "2222"})["token"]
    r = api("/api/jobs", {"kind": "install", "title": "Oniks stol montaji", "line": "UVONYX", "date": TODAY}, adm)
    on_id = r.get("job", {}).get("id")
    ok("rahbar: UVONYX vazifa", on_id and r["job"]["line"] == "UVONYX", r)
    ok("UVIXPRINT xodimi UVONYX vazifani ko'rmaydi", on_id not in [x["id"] for x in jobs(az)] and any(x["kind"] == "measure" for x in jobs(az)))
    r = api("/api/jobs", {"kind": "other", "title": "x"}, jt)
    ok("ishchi vazifa qo'sha olmaydi", r.get("_code") == 403, r)
    ok("ishchi faqat o'ziga berilganini ko'radi", all("jasur" in x["assigneeIds"] for x in jobs(jt)) and on_id not in [x["id"] for x in jobs(jt)])
    r = api(f"/api/jobs/{on_id}", {"status": "done"}, az, method="PATCH")
    ok("boshqa yo'nalish vazifasini o'zgartirib bo'lmaydi", r.get("_code") == 404, r)
    r = api("/api/kv/uvix:jobs", token=adm)
    ok("uvix:jobs KV orqali yopiq", r.get("_code") == 403, r)
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
