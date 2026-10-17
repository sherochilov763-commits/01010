# 14-etap: vazifa joyi, «eng yaqin keyingi ish», menejerga tavsiya, xarita, ish vaqtidagi kuzatuv (Keldim → Ketdim, rozilik)
import asyncio, datetime, json
from zoneinfo import ZoneInfo
from common import *  # noqa: F401,F403

IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
NOW = datetime.datetime.now(ZoneInfo("Asia/Tashkent"))
TODAY = NOW.date().isoformat()
ME = {"latitude": 41.3111, "longitude": 69.2797}          # ishchi turgan joy
LATER = NOW + datetime.timedelta(hours=3)
T_TIME = LATER.strftime("%H:%M") if LATER.date() == NOW.date() else None

def jobs(tok): return api("/api/jobs", token=tok).get("jobs", [])
def iso(dt): return dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

async def main():
    adm = admin_token()
    el = json.loads(api("/api/kv/uvix:employees", token=adm)["value"])
    el += [{"id": "bekzod", "name": "Bekzod Tursunov", "role": "installer", "pin": "5555", "line": "UVONYX"},
           {"id": "sardor", "name": "Sardor Qodirov", "role": "installer", "pin": "6666", "line": "UVONYX"}]
    api("/api/kv/uvix:employees", {"value": json.dumps(el)}, adm, method="PUT")
    mk = lambda **b: api("/api/jobs", b, adm)["job"]
    near = mk(kind="measure", title="Dilshod uyi", line="UVONYX", date=TODAY, address="Yunusobod 4-kv", assigneeIds=["bekzod"], geo={"lat": 41.3200, "lng": 69.2850})
    timed = mk(kind="install", title="Oniks stol", line="UVONYX", date=TODAY, time=T_TIME or "", address="Chilonzor 9", assigneeIds=["bekzod"], geo={"lat": 41.2850, "lng": 69.2040})
    far = mk(kind="deliver", title="Stiker", line="UVONYX", date=TODAY, address="Sergeli 7", assigneeIds=["bekzod"], geo={"lat": 41.2300, "lng": 69.2100})
    nogeo = mk(kind="install", title="Shisha fartuk", line="UVONYX", date=TODAY, address="Yunusobod 11")
    ok("server: vazifa joyi saqlandi (koordinata)", near.get("geo") == {"lat": 41.32, "lng": 69.285} and timed.get("geo", {}).get("lat") == 41.285)
    r = api(f"/api/jobs/{far['id']}", {"geo": {"lat": 999, "lng": 1}}, adm, method="PATCH")
    ok("server: noto'g'ri koordinata qabul qilinmaydi", (r.get("job") or {}).get("geo") is None, r)
    api(f"/api/jobs/{far['id']}", {"geo": {"lat": 41.2300, "lng": 69.2100}}, adm, method="PATCH")

    # ---- Kuzatuv: o'chiq → yoqish; rozilik; ish vaqti ----
    bt = api("/api/auth/login", {"employeeId": "bekzod", "pin": "5555"})["token"]
    st = api("/api/auth/login", {"employeeId": "sardor", "pin": "6666"})["token"]
    az = api("/api/auth/login", {"employeeId": "aziza", "pin": "1234"})["token"]
    ok("kuzatuv o'chiq: joy qabul qilinmaydi", api("/api/geo/ping", {"lat": 41.3, "lng": 69.2}, bt).get("reason") == "disabled")
    ok("kuzatuvni faqat rahbar yoqadi", api("/api/geo/config", {"enabled": True}, az, method="PUT").get("_code") == 403)
    ok("operator xodimlar joyini ko'rmaydi", api("/api/geo/live", token=az).get("_code") == 403)
    ok("KV orqali kuzatuv ma'lumotlari yopiq", api("/api/kv/uvix:geoLast", token=adm).get("_code") in (403, 404))
    api("/api/geo/config", {"enabled": True}, adm, method="PUT")
    ok("rozilik yo'q → joy olinmaydi", api("/api/geo/ping", {"lat": 41.3, "lng": 69.2}, bt).get("reason") == "consent")
    api("/api/geo/consent", {"agree": True}, st)
    ok("Sardor: rozilik bor, lekin «Keldim» yo'q → ish vaqti emas", api("/api/geo/ping", {"lat": 41.3, "lng": 69.2}, st).get("reason") == "off_shift")
    # Bekzod ishga keldi (1 soat oldin)
    mkey = f"uvix:att:{TODAY[:7]}"
    dbset(mkey, {"bekzod": {TODAY: {"in": iso(NOW - datetime.timedelta(hours=1))}}})

    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- Ishchi telefoni ----------
        wc = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPH, device_scale_factor=2, timezone_id="Asia/Tashkent", geolocation=ME, permissions=["geolocation"])
        w = await wc.new_page(); w.on("pageerror", lambda e: errs.append("W:" + str(e)))
        await mob_login(w, "Bekzod", "5555"); await w.wait_for_selector(".uvix-worker-nav", timeout=15000); await w.wait_for_timeout(2500)
        cs = w.locator("[data-testid=geo-consent]")
        ok("ishchi: rozilik so'raladi (Keldim → Ketdim, 30 kun)", await cs.count() == 1 and "Ketdim" in await cs.inner_text())
        await w.screenshot(path=OUT + "geo_consent.png")
        await cs.locator("[data-testid=geo-agree]").click(); await w.wait_for_timeout(2500)
        ok("rozilik saqlandi", bool(api("/api/geo/me", token=bt).get("consent")))
        live = {x["id"]: x for x in api("/api/geo/live", token=adm)["staff"]}
        ok("ilova ochiq + ish vaqti → joy rahbarga keldi", live["bekzod"]["onShift"] and live["bekzod"]["pos"] and abs(live["bekzod"]["pos"]["lat"] - 41.3111) < 0.001, live.get("bekzod"))
        ok("Sardor (ishda emas): joyi ko'rinmaydi", not live["sardor"]["onShift"] and live["sardor"]["pos"] is None)

        mj = w.locator("[data-testid=my-jobs]")
        nx = mj.locator("[data-myjob-next]")
        ok("«Mening kunim»: eng yaqini birinchi (1,5 km ichida)", await nx.get_attribute("data-myjob") == near["id"] and await nx.locator("[data-dist=near]").count() == 1, await nx.get_attribute("data-myjob"))
        order = await mj.locator("[data-myjob]").evaluate_all("(els) => els.map(e => e.dataset.myjob)")
        ok("ro'yxat: yaqinidan uzoqqa, joyi yo'q — oxirida", order[:3] == [near["id"], timed["id"], far["id"]], order)
        if T_TIME:
            h = mj.locator("[data-testid=day-hint]")
            ok("maslahat: «HH:MM gacha vaqt bor — avval o'lchovga boring»", await h.count() == 1 and T_TIME in await h.inner_text() and "o'lchov" in (await h.inner_text()).lower(), await h.inner_text() if await h.count() else "")
        href = await nx.locator("a", has_text="Yo'l").get_attribute("href")
        ok("«Yo'l» — Yandex navigator (joriy joydan)", href.startswith("https://yandex.uz/maps/?rtext=41.3111,69.2797~41.32,69.285"), href)
        await w.screenshot(path=OUT + "geo_myday.png")
        # Ish tugadi → bitta karta: eng yaqin keyingi ish
        await nx.locator(f"[data-myjob-done='{near['id']}']").click(); await w.wait_for_timeout(300)
        await w.locator("button", has_text="Ha, bajarildi").click(); await w.wait_for_timeout(2000)
        nh = w.locator("[data-testid=next-hint]")
        ok("ish tugagach: «Eng yaqin keyingi ish» kartasi", await nh.count() == 1 and await nh.locator(f"[data-hint-job='{timed['id']}']").count() == 1, await nh.inner_text() if await nh.count() else "")
        dist = await nh.locator("[data-testid=hint-dist]").inner_text()
        ok("masofa va vaqt ko'rsatiladi", "km" in dist and "daq" in dist, dist)
        ok("«Yo'lga chiqish» → navigator", (await nh.locator("[data-testid=hint-go]").get_attribute("href")).startswith("https://yandex.uz/maps/?rtext="))
        await w.screenshot(path=OUT + "geo_nexthint.png")
        await nh.locator("[data-testid=hint-other]").click(); await w.wait_for_timeout(500)
        ok("«Boshqasini tanlash» → ro'yxatga qaytadi", await w.locator("[data-testid=next-hint]").count() == 0 and await mj.locator("[data-myjob-next]").count() == 1)

        # ---------- Rahbar: xarita, tavsiya, «Xodimlar · hozir» ----------
        d = await (await b.new_context(viewport={"width": 1440, "height": 950}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        d.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errs.append("DC:" + m.text[:300]))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Vazifalar"); await d.wait_for_timeout(1200)
        await d.locator("[aria-label=\"Ko'rinish\"] button", has_text="Xarita").click(); await d.wait_for_timeout(1500)
        jm = d.locator("[data-testid=jobs-map]")
        ok("Xarita: joyi bor ochiq vazifalar pin bo'lib chiqadi", await jm.locator(".leaflet-marker-icon").count() == 2, await jm.locator(".leaflet-marker-icon").count())
        ok("joyi belgilanmaganlar ro'yxati", await jm.locator(f"[data-nogeo='{nogeo['id']}']").count() == 1)
        await d.screenshot(path=OUT + "geo_map.png")
        # Joyi yo'q vazifa → belgilash → havola → tavsiya
        await jm.locator(f"[data-nogeo='{nogeo['id']}']").click(); await d.wait_for_timeout(800)
        await d.locator("[data-testid=geo-link-btn]").click()
        await d.locator("[data-testid=geo-link]").fill("https://yandex.uz/maps/?ll=69.2860%2C41.3215&z=16"); await d.locator("[data-testid=geo-link-ok]").click(); await d.wait_for_timeout(1500)
        ok("Yandex havolasidan joy olindi", await d.locator("[data-testid=geo-set]").count() == 1 and "41.32150" in await d.locator("[data-testid=geo-set]").inner_text())
        rec = d.locator("[data-testid=job-recommend]")
        ok("tavsiya: eng yaqin va bo'sh — Bekzod (hozirgi joyidan)", await rec.count() == 1 and await rec.locator("[data-rec-best=bekzod]").count() == 1, await rec.inner_text() if await rec.count() else "")
        await rec.screenshot(path=OUT + "geo_recommend.png")
        await rec.locator("[data-testid=rec-give]").click()
        await d.locator(".uvix-modal-panel button", has_text="Saqlash").last.click(); await d.wait_for_timeout(1500)
        j2 = [x for x in jobs(adm) if x["id"] == nogeo["id"]][0]
        ok("«Berish» → Bekzodga biriktirildi, joyi saqlandi", j2["assigneeIds"] == ["bekzod"] and abs(j2["geo"]["lat"] - 41.3215) < 1e-6, j2)
        # Xodimlar · hozir
        await d.locator("[data-map-tab=live]").click(); await d.wait_for_timeout(1500)
        ok("«Xodimlar · hozir»: Bekzod — ishda, joyi bor", await d.locator("[data-live-row=bekzod]").count() == 1 and (await d.locator("[data-live-row=bekzod]").get_attribute("data-live-status")) not in ("off", "none", None))
        ok("Sardor — «ishda emas · kuzatuv yo'q»", await d.locator("[data-live-row=sardor][data-live-status=off]").count() == 1)
        await d.locator("[data-live-row=bekzod]").click(); await d.wait_for_timeout(1200)
        ok("xodim bosilsa — bugungi yo'li", await d.locator("[data-testid=trail-note]").count() == 1)
        await d.screenshot(path=OUT + "geo_live.png")
        await b.close()

    # «Ketdim» → kuzatuv to'xtaydi
    dbset(mkey, {"bekzod": {TODAY: {"in": iso(NOW - datetime.timedelta(hours=1)), "out": iso(NOW - datetime.timedelta(minutes=1))}}})
    ok("«Ketdim»dan keyin joy olinmaydi", api("/api/geo/ping", {"lat": 41.3, "lng": 69.2}, bt).get("reason") == "off_shift")
    live = {x["id"]: x for x in api("/api/geo/live", token=adm)["staff"]}
    ok("rahbarga ham ko'rinmaydi (ishda emas)", not live["bekzod"]["onShift"] and live["bekzod"]["pos"] is None)
    api("/api/geo/consent", {"agree": False}, bt)
    ok("rozilikni qaytarib olish", api("/api/geo/me", token=bt).get("consent") is None)
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
