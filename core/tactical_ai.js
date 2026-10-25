"use strict";
// Planning reads current observations and their last known positions, never unseen HP or future rolls.
class CombatTacticalAI {
  constructor(engine) {
    this.engine = engine;
  }
  observe(id) {
    const e = this.engine,
      s = e.s;
    e.recordObservations(id);
    return Object.entries(s.memory[id]).map(([key, v]) => ({
      id: key,
      ...v,
      visible:
        e.enemies(id).includes(key) && e.canSee(id, key) && !e.unit(key).hidden,
    }));
  }
  reachable(id, budget = this.engine.unit(id).move) {
    const e = this.engine,
      u = e.unit(id),
      queue = [{ x: u.x, y: u.y, cost: 0, path: [] }],
      best = new Map([[u.x + "," + u.y, 0]]),
      out = [];
    let serial=1;queue[0].serial=0;
    const cmp=(a,b)=>a.cost-b.cost||a.path.length-b.path.length||a.serial-b.serial;
    const push=node=>{node.serial=serial++;let i=queue.length;queue.push(node);while(i){const p=(i-1)>>1;if(cmp(queue[p],node)<=0)break;queue[i]=queue[p];i=p;}queue[i]=node;};
    const pop=()=>{const first=queue[0],last=queue.pop();if(queue.length){let i=0;while(2*i+1<queue.length){let c=2*i+1;if(c+1<queue.length&&cmp(queue[c+1],queue[c])<0)c++;if(cmp(last,queue[c])<=0)break;queue[i]=queue[c];i=c;}queue[i]=last;}return first;};
    while (queue.length) {
      const p = pop();
      if (p.cost !== best.get(p.x + "," + p.y)) continue;
      const at = e.occupied(p.x, p.y, id),
        knownAt =
          at &&
          (e.unit(at).team === u.team ||
            (!e.unit(at).hidden && e.canSee(id, at)));
      if (!knownAt || !p.path.length) out.push(p);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const q = { x: p.x + dx, y: p.y + dy };
        const step = e.movementStep(id,p,q);
        if (!step.allowed) continue;
        const cost = p.cost + step.cost,
          key = q.x + "," + q.y;
        if (cost > budget || (best.get(key) ?? Infinity) <= cost) continue;
        best.set(key, cost);
        push({ ...q, cost, path: [...p.path, q] });
      }
    }
    return out;
  }
  risk(id, path, known) {
    const e = this.engine,
      u = e.unit(id);
    if (u.disengaged) return 0;
    let risk = 0,
      from = u;
    const charged = new Set();
    for (const p of path) {
      for (const t of known.filter((t) => t.visible))
        if (
          !charged.has(t.id) &&
          e.distance(from, t) <= 5 &&
          e.distance(p, t) > 5
        ) {
          risk++;
          charged.add(t.id);
        }
      from = p;
    }
    return risk;
  }
  // A forecast deliberately differs from adjudication: unseen enemies and another
  // creature's private senses must not influence the position we choose.
  estimateModifiers(id, target, weapon, from, known) {
    const e = this.engine,
      u = e.unit(id),
      distance = e.distance(from, target),
      ranged = !["melee", "meleeSpell"].includes(weapon.kind);
    const adv =
      ["restrained", "stunned", "paralyzed", "unconscious", "blinded"].some(
        (kind) => e.has(target.id, kind),
      ) ||
      (e.has(target.id, "prone") && distance <= 5) ||
      (u.vex?.[target.id] !== undefined && u.vex[target.id] >= u.turnCount) ||
      (u.features.packTactics &&
        e.s.order.some(
          (ally) =>
            ally !== id &&
            e.unit(ally).team === u.team &&
            e.active(ally) &&
            !e.incapacitated(ally) &&
            e.distance(e.unit(ally), target) <= 5,
        )) ||
      e.s.help?.some(
        (h) =>
          h.target === target.id &&
          h.helper !== id &&
          e.unit(h.helper).team === u.team,
      );
    const disadv =
      !e.canSee(id, target.id, from) ||
      ["restrained", "poisoned", "prone"].some((k) =>
        e.has(id, k),
      ) ||
      (e.has(id,"frightened") && e.fearSources(id).some(source =>
        known.some(t => t.id === source && t.visible) && e.canSee(id,source,from))) ||
      e.has(target.id, "dodge") ||
      (e.has(target.id, "prone") && distance > 5) ||
      u.statuses.some((z) => z.kind === "grappled" && z.source !== target.id) ||
      (ranged &&
        (distance > (weapon.normalRange || weapon.range) ||
          known.some(
            (t) =>
              t.visible && e.distance(from, t) <= 5 && !e.incapacitated(t.id),
          )));
    return { adv: Boolean(adv), disadv: Boolean(disadv) };
  }
  investigate(id, known, obscures) {
    const e = this.engine,
      u = e.unit(id),
      done = { kind: "endTurn", actor: id };
    // Reachability is based on known occupancy. An actual hidden obstruction is
    // resolved by moveStep, just as for an ordinary player move.
    const routes = this.reachable(
      id,
      e.s.terrain.width * e.s.terrain.height * 15,
    );
    const endpoints = new Set(this.reachable(id).map((p) => p.x + "," + p.y));
    for (const memory of [...known].sort((a, b) => b.seenTurn - a.seenTurn)) {
      const searched = new Set(memory.searchedFrom || []),
        radius = Math.max(5, Math.min(60, u.tactics?.searchRadius || 15)),
        options = routes
          .filter(
            (p) =>
              e.distance(p, memory) <= radius &&
              !searched.has(p.x + "," + p.y) &&
              !p.path.some((q) =>
                e.s.zones.some((z) => obscures(z) && e.zoneAt(q, z)),
              ) &&
              !e.s.zones.some((z) => obscures(z) && e.zoneAt(p, z)),
          )
          .sort(
            (a, b) =>
              e.distance(a, memory) - e.distance(b, memory) ||
              a.cost +
                this.risk(id, a.path, known) * 25 -
                (b.cost + this.risk(id, b.path, known) * 25),
          );
      const goal = options[0];
      if (!goal) continue;
      if (!goal.path.length)
        return u.action + (u.surgeAction || 0) > 0
          ? { kind: "search", actor: id }
          : done;
      let spent = 0;
      const path = [];
      for (const p of goal.path) {
        spent += e.stepCost(id, p);
        if (spent > u.move) break;
        path.push(p);
      }
      while (path.length && !endpoints.has(path.at(-1).x + "," + path.at(-1).y))
        path.pop();
      if (path.length)
        return {
          kind: "move",
          actor: id,
          path,
          reason: "обследует окрестности последнего известного места",
        };
      return u.action + (u.surgeAction || 0) > 0
        ? { kind: e.speed(id) > 0 ? "dash" : "dodge", actor: id }
        : done;
    }
    return u.action + (u.surgeAction || 0) > 0
      ? { kind: "dodge", actor: id }
      : done;
  }
  choose(id) {
    const command = this.plan(id), e = this.engine;
    if (command.kind === "endTurn" || e.availableAction(command).enabled) return command;
    // One bounded fallback. Execution still reports unexpected errors instead of
    // retrying indefinitely; unavailable known actions never stop the UI timer.
    const dodge = {kind: "dodge", actor: id};
    return e.availableAction(dodge).enabled ? dodge : {kind: "endTurn", actor: id};
  }
  plan(id) {
    const e = this.engine,
      s = e.s,
      u = e.unit(id),
      known = this.observe(id),
      visible = known.filter((t) => t.visible),
      role = u.tactics?.role || "skirmisher",
      done = { kind: "endTurn", actor: id };
    if (e.incapacitated(id) || !e.active(id)) return done;
    if (
      u.features.secondWind &&
      u.bonus > 0 &&
      (u.counters?.second_wind?.current || 0) > 0 &&
      u.max - u.hp >= (u.features.fighterLevel || 0) + 5
    )
      return { kind: "secondWind", actor: id };
    if (
      u.features.actionSurge &&
      (u.counters?.action_surge?.current || 0) > 0 &&
      u.surgeTurn !== s.turnSerial &&
      u.action + (u.surgeAction || 0) <= 0 &&
      u.attacksLeft <= 0 &&
      visible.length
    )
      return { kind: "actionSurge", actor: id };
    if (e.occupied(u.x, u.y, id) && u.move > 0) {
      const exits = this.reachable(id)
        .filter((p) => p.path.length)
        .sort((a, b) => a.cost - b.cost);
      if (exits[0])
        return {
          kind: "move",
          actor: id,
          path: exits[0].path,
          reason: "освобождает общую клетку",
        };
    }
    // Support behavior uses only allies in reach and actual carried supplies.
    // Revive an unconscious ally before spending the action to Stabilize;
    // only self-administer preventively when seriously injured.
    if (u.bonus > 0) {
      const healing = Object.keys(u.itemTypes || {}).find(
        item => u.itemTypes[item] === "healing" && (u.items[item] || 0) > 0,
      );
      if (healing) {
        const ally = s.order.find(k => k !== id && e.unit(k).team === u.team &&
          !e.unit(k).dead && e.unit(k).hp === 0 &&
          e.distance(u, e.unit(k)) <= 5);
        const target = ally || (u.hp > 0 && u.hp <= Math.floor(u.max * 0.3) ? id : null);
        if (target) return {kind:"healPotion",actor:id,item:healing,target,
          reason:ally ? "помогает потерявшему сознание союзнику" : "использует лечебное зелье"};
      }
    }
    const dying = s.order.find(
      (k) =>
        e.unit(k).team === u.team &&
        e.unit(k).hp === 0 &&
        !e.unit(k).dead &&
        !e.unit(k).stable &&
        e.canSee(id, k),
    );
    if (dying && u.action + (u.surgeAction || 0) > 0) {
      if (e.distance(u, e.unit(dying)) <= 5)
        return { kind: "stabilize", actor: id, target: dying };
      const routes = this.reachable(id)
        .filter((p) => p.path.length)
        .sort(
          (a, b) =>
            e.distance(a, e.unit(dying)) - e.distance(b, e.unit(dying)) ||
            a.cost - b.cost,
        );
      if (
        routes[0] &&
        e.distance(routes[0], e.unit(dying)) < e.distance(u, e.unit(dying))
      )
        return {
          kind: "move",
          actor: id,
          path: routes[0].path,
          reason: "спешит помочь умирающему союзнику",
        };
    }
    if (
      e.has(id, "prone") &&
      u.move >= Math.floor(e.speed(id) / 2) &&
      e.speed(id) > 0
    )
      return { kind: "stand", actor: id };
    if (u.tactics?.canFlee && u.hp / u.max < (u.tactics.morale ?? 0.2)) {
      if (
        u.x === 0 ||
        u.y === 0 ||
        u.x === s.terrain.width - 1 ||
        u.y === s.terrain.height - 1
      )
        return { kind: "flee", actor: id };
      if (
        u.action + (u.surgeAction || 0) > 0 &&
        visible.some((t) => e.distance(u, t) <= 5) &&
        !u.disengaged
      )
        return { kind: "disengage", actor: id };
      const edge = (p) =>
        Math.min(
          p.x,
          p.y,
          s.terrain.width - 1 - p.x,
          s.terrain.height - 1 - p.y,
        );
      const exits = this.reachable(id)
        .filter((p) => p.path.length)
        .sort(
          (a, b) =>
            edge(a) - edge(b) ||
            this.risk(id, a.path, known) - this.risk(id, b.path, known) ||
            a.cost - b.cost,
        );
      if (exits.length && edge(exits[0]) < edge(u))
        return {
          kind: "move",
          actor: id,
          path: exits[0].path,
          reason: "отступает к выходу",
        };
      return u.action + (u.surgeAction || 0) > 0
        ? { kind: "dodge", actor: id }
        : done;
    }
    if (!known.length)
      return u.action + (u.surgeAction || 0) > 0
        ? { kind: "dodge", actor: id }
        : done;
    const obscures = (z) =>
      ["darkness", "fog", "smoke"].includes(z.kind) &&
      !(z.kind === "darkness" && z.owner === id && u.features.shadowArts);
    if (!visible.length && s.zones.some((z) => obscures(z) && e.zoneAt(u, z))) {
      const exits = this.reachable(id)
        .filter(
          (p) =>
            p.path.length &&
            !s.zones.some((z) => obscures(z) && e.zoneAt(p, z)),
        )
        .sort((a, b) => a.cost - b.cost || a.path.length - b.path.length);
      if (exits.length)
        return {
          kind: "move",
          actor: id,
          path: exits[0].path,
          reason: "выходит из непроглядной области",
        };
    }
    const adjacent = visible.find((t) => e.distance(u, t) <= 5),
      unarmed = u.attacks.find((a) => a.unarmed);
    if (adjacent && unarmed && u.flurryLeft > 0)
      return {
        kind: "attack",
        actor: id,
        target: adjacent.id,
        weapon: unarmed.id,
        mode: "flurry",
      };
    if (
      adjacent &&
      unarmed &&
      u.features.martialArts &&
      u.action + (u.surgeAction || 0) === 0 &&
      u.bonus > 0
    ) {
      if (u.focus > 0) return { kind: "flurry", actor: id };
      return {
        kind: "attack",
        actor: id,
        target: adjacent.id,
        weapon: unarmed.id,
        mode: "bonus",
      };
    }
    if (
      u.features.shadowArts &&
      u.action > 0 &&
      u.focus > 0 &&
      !s.zones.some((z) => z.owner === id && z.kind === "darkness")
    ) {
      const cluster = visible.find(
        (t) =>
          e.distance(u, t) <= 60 &&
          visible.filter((o) => Math.hypot(o.x - t.x, o.y - t.y) * 5 <= 15)
            .length >= 2 &&
          !s.order.some(
            (a) =>
              a !== id &&
              e.unit(a).team === u.team &&
              e.active(a) &&
              Math.hypot(e.unit(a).x - t.x, e.unit(a).y - t.y) * 5 <= 15,
          ),
      );
      if (cluster)
        return {
          kind: "darkness",
          actor: id,
          point: { x: cluster.x, y: cluster.y },
        };
    }
    const cells = this.reachable(id),
      candidates = [];
    for (const p of cells) {
      const exposure = visible.filter((t) => e.distance(p, t) <= 5).length,
        risk = this.risk(id, p.path, known),
        cover = s.terrain.cover?.[p.x + "," + p.y] || 0;
      for (const target of visible)
        for (const weapon of u.attacks) {
          if (u.action + (u.surgeAction || 0) <= 0 && u.attacksLeft <= 0)
            continue;
          try {
            e.validateAttack(id, target.id, weapon, p);
          } catch {
            continue;
          }
          const range = e.distance(p, target),
            ranged = !["melee", "meleeSpell"].includes(weapon.kind),
            m = this.estimateModifiers(id, target, weapon, p, known);
          let chance = Math.min(
            0.95,
            Math.max(0.05, (21 + weapon.bonus - 14) / 20),
          );
          if (m.adv && !m.disadv) chance = 1 - (1 - chance) ** 2;
          if (m.disadv && !m.adv) chance *= chance;
          let score =
            chance * ((weapon.count * (weapon.die + 1)) / 2 + weapon.flat) +
            cover * 0.5 -
            risk * 7 -
            p.cost * 0.035;
          score += ranged
            ? Math.min(range, 40) * 0.06 - exposure * 5
            : -exposure * 0.3;
          if (role === "guardian" && u.tactics.anchor)
            score -= e.distance(p, u.tactics.anchor) * 0.09;
          if (role === "pack")
            score +=
              s.order.filter(
                (a) =>
                  a !== id &&
                  e.unit(a).team === u.team &&
                  e.active(a) &&
                  e.distance(e.unit(a), target) <= 5,
              ).length * 2;
          candidates.push({ score, p, target: target.id, weapon: weapon.id });
        }
    }
    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        a.p.cost - b.p.cost ||
        a.target.localeCompare(b.target),
    );
    const best = candidates[0];
    if (best) {
      if (best.p.path.length) {
        if (
          this.risk(id, best.p.path, known) > 0 &&
          u.action + (u.surgeAction || 0) > 0 &&
          role === "ranged" &&
          !u.disengaged
        )
          return { kind: "disengage", actor: id };
        return {
          kind: "move",
          actor: id,
          path: best.p.path,
          reason:
            role === "ranged"
              ? "выбирает линию огня"
              : "занимает позицию для атаки",
        };
      }
      return {
        kind: "attack",
        actor: id,
        target: best.target,
        weapon: best.weapon,
      };
    }
    if (u.action + (u.surgeAction || 0) > 0 && u.tactics.hold)
      return { kind: "dodge", actor: id };
    if (!visible.length) return this.investigate(id, known, obscures);
    const goal = [...known].sort(
      (a, b) => b.seenTurn - a.seenTurn || e.distance(u, a) - e.distance(u, b),
    )[0];
    if (goal) {
      const routes = cells
        .filter(
          (p) =>
            p.path.length &&
            !p.path.some((q) =>
              s.zones.some((z) => obscures(z) && e.zoneAt(q, z)),
            ),
        )
        .map((p) => ({
          p,
          score:
            e.distance(p, goal) +
            this.risk(id, p.path, known) * 25 +
            p.cost * 0.03,
        }))
        .sort((a, b) => a.score - b.score);
      if (routes[0] && e.distance(routes[0].p, goal) < e.distance(u, goal))
        return {
          kind: "move",
          actor: id,
          path: routes[0].p.path,
          reason: goal.visible
            ? "сближается"
            : "проверяет последнее известное место",
        };
      if (!goal.visible && u.action + (u.surgeAction || 0) > 0)
        return { kind: "search", actor: id };
      if (u.action + (u.surgeAction || 0) > 0 && u.move === 0 && goal.visible)
        return { kind: "dash", actor: id };
    }
    return u.action + (u.surgeAction || 0) > 0
      ? { kind: "dodge", actor: id }
      : done;
  }
}
if (typeof module !== "undefined") module.exports = { CombatTacticalAI };
