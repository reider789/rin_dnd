"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    root = $("combat-app"),
    runtime = JSON.parse($("runtime").textContent),
    defaultScene = JSON.parse($("scene").textContent),
    art = JSON.parse($("artpack").textContent).assets;
  const KEY = "rin-veir-combat-session-v30";
  let engine,
    selected = null,
    weapon = null,
    path = [],
    pointMode = null,
    fullJournal = false,
    timer = null,
    notice = "",
    error = false;
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const asset = (key) => art[key]?.data || "";
  const seed = () => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] || 1;
  };
  function save() {
    try {
      const value = engine.export();
      localStorage.setItem(KEY, JSON.stringify(value));
      globalThis.__bindings?.setValue?.({ session: value.session });
      $("save-status").textContent = "Сохранено в этом браузере";
      return true;
    } catch {
      $("save-status").textContent =
        "Локальное сохранение недоступно; скачай JSON";
      return false;
    }
  }
  function newBattle(scene) {
    const next = new CombatRulesEngine(
      CombatCampaignAdapter.create(runtime, scene, seed()),
    );
    next.initialize();
    engine = next;
    selected = engine.enemies(engine.actorId)[0] || null;
    weapon = null;
    path = [];
    pointMode = null;
    notice = "Выбери цель и действие.";
    error = false;
    save();
    render();
    schedule();
  }
  function load(value) {
    if (
      !["dnd-combat-session", "rin-veir-combat-session"].includes(
        value?.kind,
      ) ||
      value.version !== 30
    )
      throw Error(
        "Нужно сохранение v30; старые файлы v29 открываются в прежней версии",
      );
    const next = new CombatRulesEngine(value.session);
    if (next.s.meta.campaignId !== runtime.campaign_id)
      throw Error("Сохранение другой кампании");
    engine = next;
    selected = null;
    path = [];
    pointMode = null;
    notice = "Бой восстановлен вместе с незавершёнными решениями.";
    save();
    render();
    schedule();
  }
  function act(c) {
    try {
      engine.dispatch(c);
      notice = "";
      error = false;
      path = [];
      pointMode = null;
      save();
    } catch (e) {
      notice = e.message;
      error = true;
    }
    render();
    schedule();
  }
  function download(name, value) {
    const text =
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
      url = URL.createObjectURL(
        new Blob([text], {
          type: typeof value === "string" ? "text/plain" : "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function schedule() {
    clearTimeout(timer);
    if (!engine || engine.s.pending || engine.s.phase !== "active") return;
    const u = engine.unit(engine.actorId);
    if (u.controlled && !engine.incapacitated(engine.actorId)) return;
    timer = setTimeout(() => {
      try {
        const c = new CombatTacticalAI(engine).choose(engine.actorId);
        if (c.reason)
          engine.emit(
            "tactic",
            c.actor,
            engine.name(c.actor) + ": " + c.reason + ".",
          );
        engine.dispatch(c);
        save();
        render();
        schedule();
      } catch (e) {
        notice = "Автоход остановлен: " + e.message;
        error = true;
        render();
      }
    }, 150);
  }
  function button(op, label, disabled = false, attrs = "") {
    return (
      "<button " +
      (disabled ? "disabled " : "") +
      'data-op="' +
      op +
      '" ' +
      attrs +
      ">" +
      label +
      "</button>"
    );
  }
  function decision() {
    const p = engine.s.pending;
    if (!p) {
      $("decision").innerHTML = "";
      return;
    }
    const name = engine.name(p.actor),
      choice = (v, t) =>
        '<button class="primary" data-decision="' + v + '">' + t + "</button>";
    let title = "Решение: " + name,
      body = "",
      buttons = "";
    if (p.kind === "metabolism") {
      title = "Необычный метаболизм";
      body =
        "При броске инициативы можно восстановить весь фокус и часть здоровья. Один раз до долгого отдыха.";
      buttons =
        choice("yes", "Использовать") + choice("no", "Сохранить способность");
    }
    if (p.kind === "initiativeSwap") {
      title = "Бдительный · обмен инициативой";
      body = "Можно поменяться результатом инициативы с согласным союзником.";
      buttons =
        p.targets
          .map(
            (id) =>
              '<button data-swap=\"' +
              esc(id) +
              '\">' +
              esc(engine.name(id)) +
              " · " +
              engine.s.initiative[id] +
              "</button>",
          )
          .join("") + choice("skip", "Оставить порядок");
    }
    if (p.kind === "deflect") {
      title = "Отражение атак · " + name;
      body = "Входящий урон: " + p.damage.amount + ". Уменьшить его реакцией?";
      buttons = choice("yes", "Отразить") + choice("no", "Принять удар");
    }
    if (p.kind === "redirect") {
      title = "Перенаправление · " + name;
      body =
        "Урон сведён к нулю. За 1 фокус можно направить силу в видимую цель в пределах " +
        p.range +
        " футов.";
      buttons =
        p.targets
          .map(
            (id) =>
              '<button data-redirect="' +
              esc(id) +
              '">' +
              esc(engine.name(id)) +
              "</button>",
          )
          .join("") + choice("skip", "Сохранить фокус");
    }
    if (p.kind === "knockout") {
      title = "Исход рукопашного удара";
      body =
        esc(engine.name(p.damage.target)) + ": выбрать несмертельный исход?";
      buttons =
        choice("spare", "Оставить без сознания") +
        choice("lethal", "Обычный удар");
    }
    if (p.kind === "opportunity") {
      title = "Атака по возможности · " + name;
      body = "Враг покидает досягаемость. Потратить реакцию?";
      buttons = choice("yes", "Атаковать") + choice("no", "Пропустить");
    }
    if (p.kind === "ready") {
      title = "Подготовленная атака · " + name;
      body = "Наступило указанное условие. Потратить реакцию?";
      buttons = choice("yes", "Атаковать") + choice("no", "Пропустить");
    }
    if (p.kind === "defenseLuck") {
      title = "Удача · защита";
      body =
        "Враг собирается атаковать " +
        esc(name) +
        ". Потратить Удачу на помеху?";
      buttons = choice("yes", "Потратить Удачу") + choice("no", "Сохранить");
    }
    if (p.kind === "roll") {
      title = p.roll.label + " · " + name;
      body = "Выпало: " + p.roll.rolls.join(", ") + ".";
      buttons = choice("accept", "Принять результат");
      if (p.lucky) buttons += choice("luck", "Удача: преимущество");
      if (p.heroic)
        buttons += p.roll.rolls
          .map(
            (v, i) =>
              '<button data-reroll="' +
              i +
              '">Вдохновение: перебросить ' +
              v +
              "</button>",
          )
          .join("");
    }
    if (p.kind === "adjudication") {
      title = "Решение ведущего";
      body =
        esc(p.description) +
        '<p class="hint">Запиши согласованное решение. До этого действие не расходуется.</p><textarea id="ruling" placeholder="Решение ведущего"></textarea>';
      buttons =
        choice("approve", "Зафиксировать решение") +
        choice("cancel", "Отменить заявку");
    }
    $("decision").innerHTML =
      '<div class="panel decision"><h3>' +
      esc(title) +
      "</h3><p>" +
      body +
      '</p><div class="buttons">' +
      buttons +
      "</div></div>";
  }
  function render() {
    const s = engine.s,
      id = engine.actorId,
      u = engine.unit(id),
      play =
        u.controlled &&
        !s.pending &&
        s.phase === "active" &&
        !engine.incapacitated(id);
    if (!u.attacks.some((a) => a.id === weapon)) weapon = u.attacks[0]?.id;
    $("battle-name").textContent = s.meta.name;
    $("round").textContent =
      s.phase === "ended" ? "Бой завершён" : "Раунд " + s.round;
    $("source-status").textContent =
      (s.meta.kind === "training" ? "Учебный бой · " : "Сюжетный бой · ") +
      "снимок кампании " +
      s.meta.sourceRevision +
      (s.meta.sourceHash !== runtime.source_state_sha256
        ? " · сохранение основано на прежнем снимке"
        : "");
    $("queue").innerHTML = s.order
      .map(
        (k) =>
          '<span class="' +
          (k === id ? "on " : "") +
          (!engine.active(k) ? "out" : "") +
          '">' +
          esc(engine.name(k)) +
          " · " +
          s.initiative[k] +
          "</span>",
      )
      .join("");
    const board = $("board");
    board.style.gridTemplateColumns =
      "repeat(" + s.terrain.width + ",minmax(0,1fr))";
    board.style.backgroundImage =
      'url("' + asset("backgrounds." + s.meta.theme) + '")';
    if (board.children.length !== s.terrain.width * s.terrain.height) {
      board.replaceChildren();
      for (let y = 0; y < s.terrain.height; y++)
        for (let x = 0; x < s.terrain.width; x++) {
          const b = document.createElement("button");
          b.dataset.tile = x + "," + y;
          b.setAttribute("role", "gridcell");
          board.append(b);
        }
    }
    const observers = s.order.filter(
      (k) => engine.unit(k).controlled && engine.active(k),
    );
    for (const b of board.children) {
      const [x, y] = b.dataset.tile.split(",").map(Number),
        p = { x, y },
        occupant = engine.occupied(x, y),
        a = occupant ? engine.unit(occupant) : null,
        visible =
          a &&
          (a.team === "party" ||
            (!a.hidden && observers.some((k) => engine.canSee(k, occupant))));
      const wall = engine.wall(p),
        rough = s.terrain.rubble.includes(x + "," + y),
        dark = s.zones.some(
          (z) => z.kind === "darkness" && engine.zoneAt(p, z),
        );
      b.className =
        "tile" +
        (wall ? " wall" : "") +
        (rough ? " rubble" : "") +
        (dark ? " dark" : "") +
        (occupant === selected && visible ? " selected" : "") +
        (path.some((q) => q.x === x && q.y === y) ? " path" : "");
      b.style.backgroundImage = wall
        ? 'url("' + asset("obstacles.wall") + '")'
        : rough
          ? 'url("' + asset("obstacles.rubble") + '")'
          : "";
      b.disabled = wall;
      b.title = visible
        ? a.name + " · " + a.hp + "/" + a.max + " ПЗ"
        : engine.cell(p);
      const key = a?.controlled
        ? "heroes.rin"
        : a?.team === "party"
          ? "enemies.warrior"
          : "enemies." +
            (a?.tokenKey ||
              (a?.tactics.role === "ranged" ? "archer" : "warrior"));
      const html =
        '<span class="coord">' +
        engine.cell(p) +
        "</span>" +
        (visible
          ? '<span class="token ' +
            (a.team === "enemies" ? "enemy " : "") +
            (occupant === id ? "current " : "") +
            (engine.incapacitated(occupant) ? "down" : "") +
            '" style="background-image:url(\'' +
            asset(key) +
            "')\"><b>" +
            esc(a.name.split(" ")[0]) +
            " " +
            a.hp +
            '</b><span class="hpbar"><i style="width:' +
            (100 * a.hp) / a.max +
            '%"></i></span></span>'
          : "");
      if (b.innerHTML !== html) b.innerHTML = html;
    }
    $("notice").textContent =
      notice ||
      (pointMode
        ? pointMode === "attackAt"
          ? "Выбери клетку для атаки вслепую."
          : "Выбери центр Тьмы на карте."
        : selected
          ? "Цель: " + engine.name(selected)
          : "Выбери цель на карте.");
    $("notice").className = error ? "error" : "";
    $("route").innerHTML = path.length
      ? '<div class="panel">Маршрут: ' +
        path.map((p) => engine.cell(p)).join(" → ") +
        '<div class="buttons">' +
        button("move", "Пройти маршрут", !play) +
        button("cancel-route", "Отмена") +
        "</div></div>"
      : "";
    const owner = s.order.find(
      (k) =>
        engine.unit(k).controlled &&
        s.zones.some((z) => z.owner === k && z.concentration),
    );
    if (owner)
      $("route").innerHTML += button(
        "endConcentration",
        "Прекратить свою концентрацию",
        false,
        'data-owner=\"' + esc(owner) + '\"',
      );
    $("actor").innerHTML =
      "<h2>" +
      esc(u.name) +
      '</h2><div class="resources">ПЗ ' +
      u.hp +
      "/" +
      u.max +
      " · КД " +
      u.ac +
      "<br>Действие " +
      u.action +
      " · Бонус " +
      u.bonus +
      " · Реакция " +
      u.reaction +
      " · Движение " +
      u.move +
      " фт" +
      (u.features.monkFocus
        ? "<br>Фокус " +
          u.focus +
          "/" +
          u.focusMax +
          " · Удача " +
          u.luck +
          " · Вдохновение " +
          u.heroic
        : "") +
      "</div>";
    const target =
        selected &&
        s.units[selected]?.team !== u.team &&
        engine.active(selected),
      f = u.features;
    $("actions").innerHTML =
      '<h3>Действия</h3><select id="weapon" ' +
      (!play ? "disabled" : "") +
      ">" +
      u.attacks
        .map(
          (a) =>
            '<option value="' +
            esc(a.id) +
            '" ' +
            (weapon === a.id ? "selected" : "") +
            ">" +
            esc(a.name) +
            " · +" +
            a.bonus +
            " · " +
            a.count +
            "к" +
            a.die +
            "+" +
            a.flat +
            "</option>",
        )
        .join("") +
      '</select><div class="choices">' +
      button(
        "attack",
        "Атаковать",
        !play || !target || (u.action <= 0 && u.attacksLeft <= 0),
      ) +
      button(
        "attackAt",
        "Атаковать клетку<small>Если цель не видна</small>",
        !play || (u.action <= 0 && u.attacksLeft <= 0),
      ) +
      button("dash", "Рывок", !play || u.action <= 0) +
      button("disengage", "Отход", !play || u.action <= 0) +
      button("dodge", "Уклонение", !play || u.action <= 0) +
      button("hide", "Спрятаться", !play || u.action <= 0) +
      button("search", "Поиск", !play || u.action <= 0) +
      button("grapple", "Захват", !play || !target) +
      button("shove", "Опрокинуть", !play || !target) +
      button("helpAttack", "Помочь атакой", !play || !target || u.action <= 0) +
      button("shovePush", "Оттолкнуть", !play || !target) +
      button(
        "readyApproach",
        "Подготовить удар<small>Если враг приблизится</small>",
        !play || u.action <= 0,
      ) +
      button(
        "readyAlly",
        "Прикрыть союзника<small>Подготовить ответ на атаку</small>",
        !play || u.action <= 0,
      ) +
      (engine.has(id, "prone") ? button("stand", "Встать", !play) : "") +
      (engine.has(id, "grappled")
        ? button("escape", "Освободиться", !play)
        : "") +
      "</div>" +
      button("endTurn", "Завершить ход", !play, 'class="wide"');
    $("abilities").innerHTML = f.martialArts
      ? '<h3>Боевые искусства</h3><div class="choices">' +
        button(
          "bonusStrike",
          "Безоружный удар<small>Бонусное действие</small>",
          !play || !target || u.bonus <= 0,
        ) +
        button(
          "flurry",
          "Шквал ударов<small>Бонусное · 1 фокус</small>",
          !play || u.bonus <= 0 || u.focus <= 0,
        ) +
        (u.flurryLeft
          ? button(
              "flurryStrike",
              "Удар Шквала · осталось " + u.flurryLeft,
              !play || !target,
            )
          : "") +
        button(
          "nick",
          "Быстрота — кинжал<small>Другим лёгким оружием · без бонуса Ловкости к урону</small>",
          !play || !target || !u.lightWeaponUsed || u.nickUsed,
        ) +
        button(
          "patientFree",
          "Терпеливая защита<small>Бонусное · Отход</small>",
          !play || u.bonus <= 0,
        ) +
        button(
          "patientPaid",
          "Защита и Уклонение<small>Бонусное · 1 фокус</small>",
          !play || u.bonus <= 0 || u.focus <= 0,
        ) +
        button(
          "windFree",
          "Шаг ветра<small>Бонусное · Рывок</small>",
          !play || u.bonus <= 0,
        ) +
        button(
          "windPaid",
          "Рывок и Отход<small>Бонусное · 1 фокус</small>",
          !play || u.bonus <= 0 || u.focus <= 0,
        ) +
        button(
          "darkness",
          "Тьма<small>Действие · 1 фокус</small>",
          !play || u.action <= 0 || u.focus <= 0,
        ) +
        button(
          "moveDarkness",
          "Перенести Тьму<small>Начало хода</small>",
          !play ||
            !u.darkMoveWindow ||
            !s.zones.some((z) => z.owner === id && z.kind === "darkness"),
        ) +
        button(
          "endConcentration",
          "Прекратить концентрацию",
          !play || !s.zones.some((z) => z.owner === id && z.concentration),
        ) +
        button(
          "minorIllusion",
          "Малая иллюзия<small>Заявка ведущему</small>",
          !play || u.action <= 0,
        ) +
        "</div>"
      : "";
    $("policies").innerHTML = u.controlled
      ? "<details><summary>Выбор Удачи и вдохновения</summary>" +
        [
          ["heroic", "Предлагать вдохновение после бросков"],
          ["luck", "Предлагать Удачу на свои проверки d20"],
          ["defenseLuck", "Спрашивать об Удаче перед атакой врага"],
          ["sneak", "Применять доступную Скрытую атаку"],
        ]
          .map(
            ([k, label]) =>
              '<label class="policy"><input type="checkbox" data-policy="' +
              k +
              '" ' +
              (u.policies[k] ? "checked" : "") +
              (!play ? " disabled" : "") +
              "> " +
              label +
              "</label>",
          )
          .join("") +
        "</details>"
      : "";
    decision();
    $("inspector").innerHTML = s.order
      .filter(
        (k) =>
          engine.unit(k).team === "party" ||
          (!engine.unit(k).hidden &&
            observers.some((o) => engine.canSee(o, k))),
      )
      .map((k) => {
        const a = engine.unit(k),
          inv = runtime.characters[k]?.inventory || [];
        return (
          "<p><b>" +
          esc(a.name) +
          "</b> · ПЗ " +
          a.hp +
          "/" +
          a.max +
          " · КД " +
          a.ac +
          " · " +
          esc(
            a.statuses
              .map(
                (z) =>
                  ({
                    prone: "лежит",
                    unconscious: "без сознания",
                    grappled: "в захвате",
                    dodge: "уклоняется",
                    invisible: "невидим",
                    restrained: "опутан",
                    blinded: "ослеплён",
                    deafened: "оглох",
                    stunned: "ошеломлён",
                    paralyzed: "парализован",
                    incapacitated: "недееспособен",
                    poisoned: "отравлен",
                    frightened: "испуган",
                    petrified: "окаменел",
                    frost: "охлаждён",
                    shield: "магический щит",
                  })[z.kind] || z.kind,
              )
              .join(", "),
          ) +
          "</p>" +
          (inv.length
            ? "<p>" +
              inv
                .filter((i) => i.combat_available)
                .map((i) => esc(i.name) + " ×" + i.quantity)
                .join(" · ") +
              "</p>"
            : "")
        );
      })
      .join("");
    $("journal").innerHTML = s.events
      .slice(fullJournal ? 0 : -35)
      .reverse()
      .map(
        (e) =>
          '<div class="event"><small>Раунд ' +
          e.round +
          "</small>" +
          esc(e.text) +
          "</div>",
      )
      .join("");
    $("report-button").disabled =
      s.phase !== "ended" || Boolean(s.pending) || s.queue.length > 0;
  }
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = engine.actorId,
      u = engine.unit(id),
      p = engine.s.pending,
      op = b.dataset.op;
    if (b.dataset.decision) {
      act({
        kind: "decide",
        id: p.id,
        choice: b.dataset.decision,
        note: $("ruling")?.value,
      });
      return;
    }
    if (b.dataset.redirect) {
      act({
        kind: "decide",
        id: p.id,
        choice: "redirect",
        target: b.dataset.redirect,
      });
      return;
    }
    if (b.dataset.swap) {
      act({ kind: "decide", id: p.id, choice: "swap", target: b.dataset.swap });
      return;
    }
    if (b.dataset.reroll !== undefined) {
      act({
        kind: "decide",
        id: p.id,
        choice: "heroic",
        die: Number(b.dataset.reroll),
      });
      return;
    }
    if (b.dataset.tile) {
      const [x, y] = b.dataset.tile.split(",").map(Number),
        point = { x, y },
        occupant = engine.occupied(x, y),
        target =
          occupant &&
          (engine.unit(occupant).team === "party" ||
            (!engine.unit(occupant).hidden &&
              engine.s.order.some(
                (k) => engine.unit(k).controlled && engine.canSee(k, occupant),
              )))
            ? occupant
            : null;
      if (pointMode) {
        act({ kind: pointMode, actor: id, point, weapon });
        return;
      }
      if (target) {
        selected = target;
        path = [];
        render();
        return;
      }
      if (u.controlled && !p) {
        const field = new CombatBattlefield({
          walls: new Set(engine.s.terrain.walls),
          rubble: new Set(engine.s.terrain.rubble),
          key: (x, y) => x + "," + y,
          occupant: (x, y) => {
            const k = engine.occupied(x, y);
            return k &&
              !engine.canPass(id, k) &&
              !engine.unit(k).hidden &&
              engine.canSee(id, k)
              ? k
              : null;
          },
          actor: () => u,
          webDifficult: () => false,
          width: engine.s.terrain.width,
          height: engine.s.terrain.height,
          movementRisk: (a, b) =>
            engine
              .enemies(id)
              .filter(
                (k) =>
                  engine.canSee(id, k) &&
                  engine.distance(a, engine.unit(k)) <= 5 &&
                  engine.distance(b, engine.unit(k)) > 5,
              ).length,
        });
        path = field.findPath(point) || [];
        if (field.pathCost(path) > u.move) path = [];
        notice = path.length
          ? "Проверь маршрут и нажми «Пройти»."
          : "Клетка недоступна за оставшееся движение.";
        render();
      }
      return;
    }
    if (op === "endConcentration" && b.dataset.owner) {
      act({ kind: "endConcentration", actor: b.dataset.owner });
      return;
    }
    if (op === "new") {
      try {
        localStorage.setItem(
          KEY + "-previous",
          JSON.stringify(engine.export()),
        );
      } catch {}
      newBattle(defaultScene);
      return;
    }
    if (op === "save") {
      save();
      return;
    }
    if (op === "export") {
      download("rin-battle-v30.json", engine.export());
      return;
    }
    if (op === "import") {
      $("import-file").click();
      return;
    }
    if (op === "scenario") {
      $("scenario-file").click();
      return;
    }
    if (op === "report") {
      try {
        download(
          "rin-battle-result.json",
          CombatCampaignAdapter.outcome(engine.s),
        );
      } catch (e) {
        notice = e.message;
        render();
      }
      return;
    }
    if (op === "journal") {
      fullJournal = !fullJournal;
      render();
      return;
    }
    if (op === "journal-export") {
      download(
        "rin-combat-journal.txt",
        engine.s.events.map((e) => e.text).join("\n"),
      );
      return;
    }
    if (op === "cancel-route") {
      path = [];
      pointMode = null;
      render();
      return;
    }
    if (op === "move") {
      act({ kind: "move", actor: id, path });
      return;
    }
    if (["darkness", "moveDarkness", "attackAt"].includes(op)) {
      pointMode = op;
      render();
      return;
    }
    const mapped = {
      bonusStrike: { kind: "attack", weapon: "unarmed", mode: "bonus" },
      flurryStrike: { kind: "attack", weapon: "unarmed", mode: "flurry" },
      nick: { kind: "attack", weapon: "dagger", mode: "nick" },
      patientFree: { kind: "disengage", cost: "bonus" },
      patientPaid: { kind: "disengage", cost: "bonus", paid: true },
      windFree: { kind: "dash", cost: "bonus" },
      windPaid: { kind: "dash", cost: "bonus", paid: true },
    };
    if (op === "readyApproach") {
      act({ kind: "ready", weapon, trigger: "approach" });
      return;
    }
    if (op === "readyAlly") {
      act({ kind: "ready", weapon, trigger: "attackAlly" });
      return;
    }
    if (op === "shovePush") {
      act({ kind: "shove", target: selected, push: true });
      return;
    }
    if (op === "minorIllusion") {
      const description = prompt("Какой звук или образ создаёт иллюзия?");
      if (description) act({ kind: op, description });
      return;
    }
    if (op)
      act({ kind: op, actor: id, target: selected, weapon, ...mapped[op] });
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "weapon") {
      weapon = e.target.value;
      render();
    }
    if (e.target.dataset.policy)
      act({
        kind: "policy",
        policy: e.target.dataset.policy,
        enabled: e.target.checked,
      });
  });
  $("import-file").addEventListener("change", async (e) => {
    try {
      if (e.target.files[0]) load(JSON.parse(await e.target.files[0].text()));
    } catch (err) {
      notice = err.message;
      error = true;
      render();
    } finally {
      e.target.value = "";
    }
  });
  $("scenario-file").addEventListener("change", async (e) => {
    try {
      if (e.target.files[0])
        newBattle(JSON.parse(await e.target.files[0].text()));
    } catch (err) {
      notice = err.message;
      error = true;
      render();
    } finally {
      e.target.value = "";
    }
  });
  window.addEventListener("beforeunload", save);
  try {
    const stored = globalThis.__bindings?.value?.session;
    const local = localStorage.getItem(KEY);
    if (stored)
      load({ kind: "rin-veir-combat-session", version: 30, session: stored });
    else if (local) load(JSON.parse(local));
    else newBattle(defaultScene);
  } catch (err) {
    try {
      localStorage.setItem(
        KEY + "-unreadable",
        localStorage.getItem(KEY) || "",
      );
    } catch {}
    newBattle(defaultScene);
    notice =
      "Не удалось открыть сохранение. Его исходный JSON оставлен отдельно. " +
      err.message;
    error = true;
    render();
  }
  if (globalThis.__HV_ENABLE_TEST_APIS === true)
    globalThis.__RIN_TEST_API = {
      snapshot: () => structuredClone(engine.s),
      dispatch: (c) => {
        engine.dispatch(c);
        save();
        render();
      },
      set: (f) => {
        f(engine.s);
        render();
      },
      load,
      create: newBattle,
      stop: () => clearTimeout(timer),
      outcome: () => CombatCampaignAdapter.outcome(engine.s),
    };
})();
