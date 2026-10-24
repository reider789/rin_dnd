"""30.7 browser regressions: registry controls, journal downloads and reaction reload."""
from pathlib import Path
import argparse
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
API = "window.__RIN_TEST_API"


def run(html=None, screenshots=None):
    pack = json.loads((ROOT / "examples/portable/border-watch.json").read_text())
    pack["abilities"]["field-aid"] = {
        "handler": "healing", "version": 1, "name": "Полевая помощь",
        "cost": "action", "target": "ally", "range": 5,
        "dice": {"count": 2, "sides": 6, "flat": 2},
        "resource": {"counter": "second_wind", "amount": 1},
        "reference": "Тестовое согласованное действие",
    }
    pack["profiles"]["sentinel"]["abilities"].append("field-aid")
    maximum = pack["profiles"]["sentinel"]["hp"]
    pack["characters"]["ena"]["resources"] = {
        "hp": {"current": maximum, "max": maximum},
        "second_wind": {"current": 2, "max": 2},
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page.set_default_timeout(8000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("window.__HV_ENABLE_TEST_APIS=true")
        page.goto(Path(html or ROOT / "index.html").resolve().as_uri())
        page.wait_for_function(f"Boolean({API})")
        page.evaluate(f"{API}.stop()")
        # Rejected imports must preserve the active battle and every storage slot.
        original = page.evaluate(f"JSON.stringify({API}.snapshot())")
        storage = page.evaluate("JSON.stringify({...localStorage})")
        for bad in [{"breakdown": {}}, {"bonusParts": [None]}, {"modifiers": {"advantage": "bad"}}]:
            session = json.loads(original)
            session["events"].append({"round": 1, "type": "damage", "text": "BAD_IMPORT", **bad})
            page.locator("#import-file").set_input_files({
                "name": "broken.json", "mimeType": "application/json",
                "buffer": json.dumps({"kind": "dnd-combat-session", "version": 32, "session": session}).encode(),
            })
            page.wait_for_function("document.getElementById('import-file').value === ''")
            assert page.evaluate(f"JSON.stringify({API}.snapshot())") == original
            assert page.evaluate("JSON.stringify({...localStorage})") == storage
            assert "Повреждены" in page.locator("#notice").inner_text()
        page.reload()
        page.wait_for_function(f"Boolean({API})")
        page.evaluate(f"{API}.stop()")
        assert page.evaluate(f"JSON.stringify({API}.snapshot())") == original
        if screenshots:
            screenshots = Path(screenshots)
            screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshots / "native-1440.png"), full_page=True)

        page.locator("#pack-file").set_input_files({
            "name": "healing-pack.json", "mimeType": "application/json",
            "buffer": json.dumps(pack, ensure_ascii=False).encode(),
        })
        page.wait_for_function(f"{API}.snapshot().meta.campaignId==='border-watch'")
        page.evaluate(f"""()=>{{{API}.stop();{API}.set(s=>{{
          s.pending=null;s.queue=[];s.started=true;s.phase='active';s.index=s.order.indexOf('ena');
          s.terrain.walls=[];s.terrain.rubble=[];s.terrain.cover={{}};s.effects=[];s.zones=[];s.objects={{}};s.spellFrames={{}};
          for(const u of Object.values(s.units)){{u.features={{}};u.statuses=[];u.controlled=true;
            u.hidden=false;u.policies={{heroic:false,luck:false,defenseLuck:false}};}}
          Object.assign(s.units.ena,{{x:2,y:3,action:1,bonus:1,move:30,heroic:1,policies:{{heroic:true}}}});
          Object.assign(s.units.tal,{{x:6,y:3,hp:1}});
          Object.assign(s.units.hunter_a,{{x:8,y:5}});Object.assign(s.units.hunter_b,{{x:9,y:6}});
          s.random.tape=[3,4,6];
        }});}}""")
        activity = page.locator('[data-op="activity"][data-activity="field-aid"]')
        assert activity.count() == 1
        page.locator('[data-tile="6,3"]').click()
        assert activity.is_disabled()
        assert "дальности" in activity.get_attribute("title")
        page.evaluate(f"{API}.set(s=>{{s.units.tal.x=2;s.units.tal.y=4;}})")
        page.locator('[data-tile="2,4"]').click()
        assert activity.is_enabled()
        activity.click()
        assert page.evaluate(f"{API}.snapshot().pending.kind") == "roll"

        def snapshot():
            return page.evaluate(f"JSON.parse(JSON.stringify({API}.snapshot()))")

        saved = snapshot()
        assert saved["units"]["ena"]["counters"]["second_wind"]["current"] == 1
        page.reload()
        page.wait_for_function(f"Boolean({API})")
        page.evaluate(f"{API}.stop()")
        assert snapshot() == saved
        page.locator('#decision [data-reroll="0"]').click()
        assert page.evaluate(f"{API}.snapshot().units.tal.hp") == 13
        assert page.evaluate(f"{API}.snapshot().units.ena.counters.second_wind.current") == 1
        assert activity.is_disabled()
        roll = page.locator("#journal .event").filter(has_text="Полевая помощь [6, 4]")
        assert roll.count() == 1
        roll.locator("summary").click()
        assert "Основной модификатор: +2" in roll.inner_text()
        assert "Действие №" in roll.inner_text()

        # Real defensive reaction, with the damage continuation reloaded from storage.
        page.evaluate(f"""{API}.set(s=>{{
          s.index=s.order.indexOf('hunter_a');s.pending=null;s.queue=[];s.random.tape=[15,8];
          Object.assign(s.units.hunter_a,{{x:3,y:3,action:1,attacksLeft:0,
            attacks:[{{id:'blade',name:'Клинок',kind:'melee',range:5,bonus:5,flat:4,count:1,die:8,damageType:'piercing'}}]}});
          Object.assign(s.units.ena,{{hp:40,max:40,temp:1,reaction:1,heroic:0,policies:{{}},
            features:{{heavyArmor:true,heavyArmorReduction:2,uncannyDodge:true}},resistances:['piercing']}});
        }})""")
        page.locator('[data-tile="2,3"]').click()
        page.locator('[data-op="attack"]').click()
        assert page.evaluate(f"{API}.snapshot().pending.kind") == "uncannyDodge"
        saved = snapshot()
        page.reload()
        page.wait_for_function(f"Boolean({API})")
        page.evaluate(f"{API}.stop()")
        assert snapshot() == saved
        page.locator('#decision [data-decision="yes"]').click()
        assert page.evaluate(f"{API}.snapshot().units.ena.hp") == 39
        damage = page.locator("#journal .event").filter(has_text="2 урона (временные ПЗ поглотили 1)")
        damage.locator("summary").click()
        for text in ["Тяжёлый доспех: 12 → 10", "Невероятное уклонение: 10 → 5",
                     "Сопротивление · колющий: 5 → 2", "Фактически потеряно ПЗ: 1"]:
            assert text in damage.inner_text()

        before_download = snapshot()
        with page.expect_download() as pending:
            page.locator('[data-op="journal-export"]').click()
        text = Path(pending.value.path()).read_text()
        assert "Невероятное уклонение: 10 → 5" in text
        with page.expect_download() as pending:
            page.locator('[data-op="journal-json"]').click()
        exported = json.loads(Path(pending.value.path()).read_text())
        assert exported["format"] == "dnd-combat-journal" and exported["version"] == 1
        assert exported["events"] == before_download["events"]
        assert snapshot() == before_download, "journal controls must never change rules or RNG"
        with page.expect_download() as pending:
            page.locator('[data-op="export"]').click()
        assert json.loads(Path(pending.value.path()).read_text())["session"] == before_download

        for width, height in [(1366, 768), (1440, 900), (1920, 1080)]:
            page.set_viewport_size({"width": width, "height": height})
            # fitWorkspace is scheduled by resize on the next animation frame.
            page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
            boxes = page.evaluate("""Object.fromEntries(['board','turn-controls'].map(id=>
                [id,document.getElementById(id).getBoundingClientRect().toJSON()]))""")
            if screenshots:
                page.screenshot(path=str(screenshots / f"layout-{width}.png"), full_page=True)
            assert boxes["board"]["bottom"] <= height + 1, (width, height, boxes)
            assert boxes["turn-controls"]["bottom"] <= height + 1, (width, height, boxes)
            assert page.locator(".journal-title").evaluate("""el=>{
                const r=el.getBoundingClientRect();return [...el.querySelectorAll('button')].every(b=>{
                const x=b.getBoundingClientRect();return x.left>=r.left && x.right<=r.right+1})}""")
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        if screenshots:
            page.set_viewport_size({"width": 1440, "height": 900})
            page.screenshot(path=str(screenshots / "journal-1440.png"), full_page=True)
        assert not errors, errors
        browser.close()
        print("30.7 BROWSER OK: registry availability/payment/reroll, reaction reload, detailed journal, TXT/JSON/session downloads, RNG unchanged, three desktop sizes, no JS errors")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--html", type=Path)
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    run(args.html, args.screenshots)
