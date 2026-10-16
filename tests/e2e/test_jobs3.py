# 12-etap: Vazifalar — Doska (holat ustunlari, sudrash) va Brigada jadvali (sudrab rejalashtirish, bo'sh vaqt, ustma-ust), telefon ko'rinishlari
import asyncio, datetime, json
from common import *  # noqa: F401,F403

IPH = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
D = datetime.date.today()
TODAY, TOM = D.isoformat(), (D + datetime.timedelta(days=1)).isoformat()

def jobs(tok): return api("/api/jobs", token=tok).get("jobs", [])
def job(tok, i): return [x for x in jobs(tok) if x["id"] == i][0]

async def main():
    adm = admin_token()
    el = json.loads(api("/api/kv/uvix:employees", token=adm)["value"])
    el += [{"id": "bekzod", "name": "Bekzod Tursunov", "role": "installer", "pin": "5555", "line": "UVONYX"},
           {"id": "sardor", "name": "Sardor Qodirov", "role": "installer", "pin": "6666", "line": "UVONYX"}]
    api("/api/kv/uvix:employees", {"value": json.dumps(el)}, adm, method="PUT")
    mk = lambda **b: api("/api/jobs", b, adm)["job"]
    a = mk(kind="install", title="Shisha fartuk", line="UVONYX", address="Sergeli 3")                         # mas'ulsiz, sanasiz
    pl = mk(kind="measure", title="Dilshod uyi", line="UVONYX", date=TOM, time="11:00", assigneeIds=["bekzod"])  # rejada
    bz = mk(kind="install", title="Oniks stol", line="UVONYX", date=TOM, time="14:00", duration=120, assigneeIds=["bekzod"])
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        d = await (await b.new_context(viewport={"width": 1440, "height": 950}, timezone_id="Asia/Tashkent")).new_page(); d.on("pageerror", lambda e: errs.append("D:" + str(e)))
        await dlogin(d, "Administrator", "0000")
        await nav(d, "Vazifalar"); await d.wait_for_timeout(800)
        # ---------- Doska ----------
        await d.locator("[data-jobs-mode=board]").click(); await d.wait_for_timeout(600)
        col = lambda k: d.locator(f"[data-board-col={k}]")
        ok("doska: 4 ustun", await d.locator("[data-board-col]").count() == 4)
        ok("mas'ulsiz → «Yangi», rejadagi → «Rejalashtirilgan»", await col("new").locator(f"[data-board-card='{a['id']}']").count() == 1 and await col("planned").locator(f"[data-board-card='{pl['id']}']").count() == 1)
        await d.screenshot(path=OUT + "jobs3_board.png")
        await d.locator(f"[data-board-card='{pl['id']}']").drag_to(col("doing")); await d.wait_for_timeout(1200)
        ok("sudrab «Jarayonda»ga → holat doing", job(adm, pl["id"])["status"] == "doing")
        await d.locator(f"[data-board-card='{pl['id']}']").drag_to(col("done")); await d.wait_for_timeout(500)
        ok("«Bajarildi»ga sudrash → tasdiqlash", await d.locator("button", has_text="Ha, bajarildi").count() == 1)
        await d.locator("button", has_text="Ha, bajarildi").click(); await d.wait_for_timeout(1200)
        ok("bajarildi → «Bajarildi · bu hafta» ustunida", job(adm, pl["id"])["status"] == "done" and await col("done").locator(f"[data-board-card='{pl['id']}']").count() == 1)
        await d.locator(f"[data-board-card='{a['id']}']").drag_to(col("planned")); await d.wait_for_timeout(500)
        ok("mas'ulsizni «Rejalashtirilgan»ga → forma ochiladi (kim, qachon)", await d.locator("[data-testid=job-form]").count() == 1)
        await close_modal(d)
        await d.locator("[data-testid=board-group]").select_option("kind"); await d.wait_for_timeout(300)
        ok("guruhlash: tur bo'yicha", await d.locator("[data-board-col=install]").count() == 1)
        await d.locator("[data-testid=board-group]").select_option("status")

        # ---------- Brigada ----------
        await d.locator("[data-jobs-mode=brigade]").click(); await d.wait_for_timeout(600)
        await d.locator("[aria-label=Keyingi]").click(); await d.wait_for_timeout(300)   # ertaga
        ok("brigada: montajchilar qatorlari", await d.locator("[data-brigade-row=bekzod]").count() == 1 and await d.locator("[data-brigade-row=sardor]").count() == 1)
        ok("Bekzodning 14:00 montaji jadvalda", await d.locator(f"[data-brigade-row=bekzod] [data-block='{bz['id']}']").count() == 1)
        ok("bo'sh vaqt shtrixli (09:00 dan)", await d.locator("[data-brigade-row=sardor] [data-free='sardor@09:00']").count() == 1)
        ok("rejalashtirilmagan ro'yxatda mas'ulsiz montaj", await d.locator(f"[data-unplanned='{a['id']}']").count() == 1)
        # Sardor qatoriga ~10:00 ga sudrash
        lane = d.locator("[data-brigade-lane=sardor]"); bb = await lane.bounding_box()
        x = bb["width"] * (2 / 12)  # 08:00 + 2 soat
        await d.locator(f"[data-unplanned='{a['id']}']").drag_to(lane, target_position={"x": x, "y": bb["height"] / 2}); await d.wait_for_timeout(1200)
        ja = job(adm, a["id"])
        ok("sudrab qo'yildi: ertaga, ~10:00, Sardor", ja["date"] == TOM and ja["assigneeIds"] == ["sardor"] and ja["time"] in ("09:45", "10:00", "10:15"), ja)
        # Bekzodning 14:00 montajini Sardorga 10:30 ga — ustma-ust ogohlantirish
        lane_b = d.locator("[data-brigade-lane=bekzod]"); bb2 = await lane_b.bounding_box()
        await d.locator(f"[data-block='{a['id']}']").drag_to(lane_b, target_position={"x": bb2["width"] * (6 / 12), "y": bb2["height"] / 2}); await d.wait_for_timeout(1200)
        ok("ustma-ust tushdi → ogohlantirish", await d.locator("[data-testid=brigade-warn]").count() == 1 and "Bekzod" in await d.locator("[data-testid=brigade-warn]").inner_text())
        ok("boshqa qatorga sudrash → mas'ul almashdi", job(adm, a["id"])["assigneeIds"] == ["bekzod"])
        await d.screenshot(path=OUT + "jobs3_brigade.png")
        await d.locator("[data-free='sardor@09:00']").click(); await d.wait_for_timeout(400)
        ok("bo'sh vaqtni bosish → forma: Sardor, 09:00", await d.locator("[data-testid=job-form] [data-person=sardor][aria-pressed=true]").count() == 1 and await d.locator("[data-testid=job-time]").input_value() == "09:00")
        await close_modal(d)
        await d.locator("[data-brigade-span=week]").click(); await d.wait_for_timeout(400)
        await d.screenshot(path=OUT + "jobs3_week.png")

        # ---------- Telefon (rahbar) ----------
        m = await (await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPH, device_scale_factor=2, timezone_id="Asia/Tashkent")).new_page(); m.on("pageerror", lambda e: errs.append("M:" + str(e)))
        await mob_login(m, "Administrator", "0000"); await m.wait_for_timeout(2500)
        await m.evaluate("localStorage.setItem('uvix_jobs_mode2', JSON.stringify('board'))")
        await m.locator(".uvix-bottomnav [data-tab=__more]").click(); await m.wait_for_timeout(500)
        await m.locator("[data-tile=jobs]").click(); await m.wait_for_timeout(1500)
        ok("telefon: doska yorliqlari", await m.locator("[data-board-tab]").count() == 4, await m.locator("body").inner_text() if await m.locator("[data-board-tab]").count() == 0 else "")
        await m.screenshot(path=OUT + "jobs3_board_phone.png")
        await b.close()
    ok("JS xatolar yo'q", not errs, errs)
    finish()

asyncio.run(main())
