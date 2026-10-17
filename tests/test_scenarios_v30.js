"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { CombatRulesEngine: E } = require("../core/rules_engine"),
  { CombatCampaignAdapter: A } = require("../core/campaign_adapter"),
  { CombatTacticalAI: AI } = require("../core/tactical_ai");
const runtime = JSON.parse(
    fs.readFileSync(__dirname + "/../config/rin_runtime.json"),
  ),
  scene = JSON.parse(
    fs.readFileSync(__dirname + "/../encounters/caravan_ambush_training.json"),
  );
function resolve(e) {
  const p = e.s.pending;
  if (p.kind === "metabolism")
    return e.dispatch({ kind: "decide", id: p.id, choice: "yes" });
  if (p.kind === "deflect" || p.kind === "opportunity" || p.kind === "ready")
    return e.dispatch({ kind: "decide", id: p.id, choice: "yes" });
  if (p.kind === "redirect") {
    const target = p.targets.find(
      (id) => e.unit(id).team !== e.unit(p.actor).team,
    );
    return e.dispatch({
      kind: "decide",
      id: p.id,
      choice: target ? "redirect" : "skip",
      target,
    });
  }
  if (p.kind === "knockout")
    return e.dispatch({ kind: "decide", id: p.id, choice: "spare" });
  if (p.kind === "initiativeSwap")
    return e.dispatch({ kind: "decide", id: p.id, choice: "skip" });
  throw Error("Unexpected decision " + p.kind);
}
for (const seed of [1, 2, 9, 42, 177, 1000, 12345, 98765])
  test(
    "complete multiround caravan battle, checkpoint/replay, seed " + seed,
    () => {
      let e = new E(A.create(runtime, scene, seed));
      e.initialize();
      let n = 0,
        reloaded = 0;
      while (e.s.phase === "active" || e.s.pending || e.s.queue.length) {
        assert.ok(++n < 1800, "battle did not converge");
        if (n % 11 === 0) {
          const saved = JSON.stringify(e.export()),
            copy = new E(JSON.parse(saved).session);
          assert.equal(JSON.stringify(copy.export()), saved);
          e = copy;
          reloaded++;
        }
        if (e.s.pending) {
          resolve(e);
          continue;
        }
        if (e.s.queue.length) {
          e.run();
          continue;
        }
        const c = new AI(e).choose(e.actorId);
        e.dispatch(c);
        for (const u of Object.values(e.s.units)) {
          assert.ok(u.hp >= 0 && u.hp <= u.max);
          assert.ok(
            u.action >= 0 &&
              u.bonus >= 0 &&
              u.reaction >= 0 &&
              u.move >= 0 &&
              u.focus >= 0,
          );
        }
      }
      assert.equal(e.s.phase, "ended");
      assert.ok(e.s.round >= 2);
      assert.ok(reloaded > 0);
      assert.ok(e.s.events.some((e) => e.type === "attack"));
      assert.equal(A.outcome(e.s).session_kind, "training");
    },
  );

test("simultaneous blindness and Dodge cancel rather than stacking extra dice", () => {
  const e = new E(A.create(runtime, scene, 777));
  e.initialize();
  while (e.s.pending) resolve(e);
  const id = "enemy_1";
  Object.assign(e.unit("rin"), { x: 5, y: 3, reaction: 0 });
  Object.assign(e.unit(id), { x: 6, y: 3 });
  e.s.terrain.walls = [];
  e.s.zones = [
    {
      id: "z",
      kind: "darkness",
      owner: "enemy_2",
      x: 5,
      y: 3,
      radius: 15,
      until: 600,
      concentration: true,
    },
  ];
  e.status("rin", "dodge");
  const count = e.s.random.draws;
  e.enqueue({
    kind: "attackRoll",
    actor: id,
    target: "rin",
    spec: e.attackSpec(id, "main"),
    mode: "reaction",
  });
  e.run();
  const attack = e.s.events.findLast((x) => x.type === "attack");
  assert.equal(attack.rolls.length, 1);
  assert.ok(e.s.random.draws > count);
});

const classPack = JSON.parse(fs.readFileSync(__dirname + '/../examples/portable/class-defense-lab.json'));
const { createBattle } = require('../sdk');
for (const seed of [7, 31, 104]) test('shared classes complete a battle with serializable reactions, seed '+seed,()=>{
  let {engine:e}=createBattle(classPack,undefined,seed);e.initialize();
  for(let n=0;e.s.phase!=='ended'||e.s.pending||e.s.queue.length;n++) {
    assert.ok(n<1800,'class battle did not converge');
    if(e.s.pending) {
      const p=e.s.pending;
      if(p.kind==='freeMovement')e.dispatch({kind:'decide',id:p.id,choice:'skip'});
      else if(['classRoll','uncannyDodge','defensiveReaction','precision','riposte'].includes(p.kind))e.dispatch({kind:'decide',id:p.id,choice:'yes'});
      else if(p.kind==='strikeChoice')e.dispatch({kind:'decide',id:p.id,choice:'skip'});
      else resolve(e);
    } else if(e.s.queue.length)e.run();
    else e.dispatch(new AI(e).choose(e.actorId));
    if(n%9===0){const saved=JSON.stringify(e.export());e=new E(JSON.parse(saved).session);assert.equal(JSON.stringify(e.export()),saved);}
    for(const u of Object.values(e.s.units))for(const pool of Object.values(u.counters||{}))assert.ok(pool.current>=0&&pool.current<=pool.max);
  }
  const report=A.outcome(e.s);assert.equal(report.campaign_id,'class-defense-lab');
  assert.ok(report.after.ena.second_wind.current<=3);
  assert.equal(4-report.after.ena.second_wind.current,e.s.events.filter(x=>x.type==='roll'&&x.text.includes('Второе дыхание')).length);
  assert.equal(1-report.after.ena.action_surge.current,e.s.events.filter(x=>x.type==='ability'&&x.text.includes('Всплеск действий')).length);
  assert.equal(e.export().version,32);
});
