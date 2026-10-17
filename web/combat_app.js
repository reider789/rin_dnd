"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    root = $("combat-app"),
    embeddedRuntime = JSON.parse($("runtime").textContent),
    embeddedScene = JSON.parse($("scene").textContent),
    art = JSON.parse($("artpack").textContent).assets;
  const PACK_SLOT = "dnd-combat-active-pack:" + embeddedRuntime.campaign_id;
  let runtime = embeddedRuntime,
    defaultScene = embeddedScene,
    KEY = runtime.campaign_id + "-combat-session-v30";
  function sessionValue() {
    const value = engine.export();
    if (runtime.content_pack) value.contentPack = runtime.content_pack;
    return value;
  }
  function rememberPack() {
    if (runtime.content_pack)
      localStorage.setItem(PACK_SLOT, JSON.stringify(runtime.content_pack));
    else localStorage.removeItem(PACK_SLOT);
  }
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
      const value = sessionValue();
      localStorage.setItem(KEY, JSON.stringify(value));
      globalThis.__bindings?.setValue?.({
        session: value.session,
        contentPack: value.contentPack,
      });
      rememberPack();
      $("save-status").textContent = "Сохранено в этом браузере";
      return true;
    } catch {
      $("save-status").textContent =
        "Локальное сохранение недоступно; скачай JSON";
      return false;
    }
  }
  function newBattle(scene, nextRuntime = runtime) {
    const next = new CombatRulesEngine(
      CombatCampaignAdapter.create(nextRuntime, scene, seed()),
    );
    next.initialize();
    runtime = nextRuntime;
    KEY = runtime.campaign_id + "-combat-session-v30";
    if (runtime.content_pack)
      defaultScene = CombatContentPack.encounter(runtime);
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
      ![30, 31, 32].includes(value.version)
    )
      throw Error(
        "Нужно сохранение v30–v32; файлы v29 открываются в прежней версии",
      );
    const nextRuntime = value.contentPack
      ? CombatContentPack.compile(value.contentPack)
      : runtime;
    const next = new CombatRulesEngine(value.session);
    if (next.s.meta.campaignId !== nextRuntime.campaign_id)
      throw Error("Сохранение другой кампании");
    const nextScene = nextRuntime.content_pack
      ? CombatContentPack.encounter(nextRuntime)
      : defaultScene;
    runtime = nextRuntime;
    KEY = runtime.campaign_id + "-combat-session-v30";
    defaultScene = nextScene;
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
    if (p.kind === "precision" || p.kind === "riposte") {
      title =
        (p.kind === "precision" ? "Точная атака" : "Ответный удар") +
        " · " +
        name;
      body =
        p.kind === "precision"
          ? "Потратить кость превосходства и добавить её к промахнувшейся атаке?"
          : "Враг промахнулся. Потратить реакцию и кость превосходства на ответную атаку?";
      buttons = choice("yes", "Использовать") + choice("no", "Пропустить");
    }
    if (p.kind === "strikeChoice") {
      title = "Попадание · " + name;
      const labels = {
        trip: "Опрокидывающая атака",
        push: "Отталкивающая атака",
        goad: "Провоцирующая атака",
        maneuvering: "Маневрирующая атака",
      };
      body =
        '<label>Манёвр <select id="strike-maneuver"><option value="">Без манёвра</option>' +
        p.maneuvers
          .map(
            (k) => '<option value="' + esc(k) + '">' + labels[k] + "</option>",
          )
          .join("") +
        "</select></label>";
      if (p.maneuvers.includes("maneuvering"))
        body +=
          '<label>Союзник <select id="strike-ally">' +
          engine.s.order
            .filter(
              (k) =>
                k !== p.actor &&
                engine.unit(k).team === engine.unit(p.actor).team &&
                !engine.incapacitated(k) &&
                engine.unit(k).reaction > 0,
            )
            .map(
              (k) =>
                '<option value="' +
                esc(k) +
                '">' +
                esc(engine.name(k)) +
                "</option>",
            )
            .join("") +
          "</select></label>";
      if (p.savage)
        body +=
          '<label><input type="checkbox" id="strike-savage"> Свирепый атакующий · раз за ход</label>';
      buttons =
        choice("use", "Применить выбранное") + choice("skip", "Обычный урон");
    }
    if (p.kind === "defensiveReaction") {
      title =
        {
          protection: "Защита союзника",
          shield: "Щит",
          cloak: "Плащ Ваэльтира",
          mark: "Знак Непоколебимого Стража",
        }[p.ability] +
        " · " +
        name;
      body =
        "Потратить реакцию" +
        (["cloak", "mark"].includes(p.ability) ? " и заряд предмета" : "") +
        "?";
      buttons =
        choice("yes", "Использовать") + choice("no", "Сохранить реакцию");
    }
    if (p.kind === "classRoll") {
      title =
        p.ability === "indomitable" ? "Несгибаемость" : "Тактический разум";
      body =
        p.ability === "indomitable"
          ? "Проверка провалена. Потратить использование, перебросить спасбросок и добавить уровень воина?"
          : "Проверка провалена. Добавить к10? Второе дыхание расходуется только при превращении провала в успех.";
      buttons =
        choice("yes", "Использовать") + choice("no", "Оставить результат");
    }
    if (p.kind === "uncannyDodge") {
      title = "Невероятное уклонение · " + name;
      body =
        "Урон от видимого атакующего: " +
        p.damage.amount +
        ". Потратить реакцию и уменьшить его вдвое?";
      buttons =
        choice("yes", "Уменьшить урон") + choice("no", "Сохранить реакцию");
    }
    if (p.kind === "freeMovement") {
      title = p.label + " · " + name;
      body =
        "Можно пройти до " +
        p.budget +
        " футов отдельно от обычного движения, без атак по возможности. Выбери свободную клетку на карте.";
      buttons =
        (path.length ? choice("move", "Пройти по выбранному маршруту") : "") +
        choice("skip", "Остаться на месте");
    }
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
    $("campaign-label").textContent =
      (runtime.title || runtime.campaign_id) + " · D&D 2024";
    document.title =
      (runtime.title || runtime.campaign_id) + " · Тактический бой";
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
      const key = art[a?.tokenKey]
        ? a.tokenKey
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
      ((u.surgeAction || 0) > 0 ? " + Всплеск " + u.surgeAction : "") +
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
        !play ||
          !target ||
          (u.action + (u.surgeAction || 0) <= 0 && u.attacksLeft <= 0),
      ) +
      button(
        "attackAt",
        "Атаковать клетку<small>Если цель не видна</small>",
        !play || (u.action + (u.surgeAction || 0) <= 0 && u.attacksLeft <= 0),
      ) +
      button("dash", "Рывок", !play || u.action + (u.surgeAction || 0) <= 0) +
      button(
        "disengage",
        "Отход",
        !play || u.action + (u.surgeAction || 0) <= 0,
      ) +
      button(
        "dodge",
        "Уклонение",
        !play || u.action + (u.surgeAction || 0) <= 0,
      ) +
      button(
        "hide",
        "Спрятаться",
        !play || u.action + (u.surgeAction || 0) <= 0,
      ) +
      button("search", "Поиск", !play || u.action + (u.surgeAction || 0) <= 0) +
      button("grapple", "Захват", !play || !target) +
      button("shove", "Опрокинуть", !play || !target) +
      button(
        "helpAttack",
        "Помочь атакой",
        !play || !target || u.action + (u.surgeAction || 0) <= 0,
      ) +
      button("shovePush", "Оттолкнуть", !play || !target) +
      button(
        "readyApproach",
        "Подготовить удар<small>Если враг приблизится</small>",
        !play || u.action + (u.surgeAction || 0) <= 0,
      ) +
      button(
        "readyAlly",
        "Прикрыть союзника<small>Подготовить ответ на атаку</small>",
        !play || u.action + (u.surgeAction || 0) <= 0,
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
    const count = (key) => u.counters?.[key]?.current || 0;
    const classButtons = [
      f.secondWind
        ? button(
            "secondWind",
            "Второе дыхание · " + count("second_wind"),
            !play || u.bonus <= 0 || count("second_wind") <= 0,
          )
        : "",
      f.actionSurge
        ? button(
            "actionSurge",
            "Всплеск действий · " + count("action_surge"),
            !play || u.surgeTurn === s.turnSerial || count("action_surge") <= 0,
          )
        : "",
      f.steadyAim
        ? button(
            "steadyAim",
            "Точный прицел",
            !play || u.bonus <= 0 || u.movedThisTurn > 0,
          )
        : "",
      f.cunningAction
        ? button(
            "cunningHide",
            "Спрятаться · бонусное",
            !play || u.bonus <= 0,
          ) +
          button("cunningDash", "Рывок · бонусное", !play || u.bonus <= 0) +
          button("cunningDisengage", "Отход · бонусное", !play || u.bonus <= 0)
        : "",
      f.knowEnemy
        ? button("knowEnemy", "Познай врага", !play || !target || u.bonus <= 0)
        : "",
    ].join("");
    if (f.knowEnemy && count("know_enemy") === 0)
      $("abilities").innerHTML += button(
        "restoreKnowEnemy",
        "Восстановить анализ · кость превосходства",
        !play || count("superiority") <= 0,
      );
    if (classButtons)
      $("abilities").innerHTML +=
        '<h3>Способности</h3><div class="choices">' + classButtons + "</div>";
    if (f.greatWeaponMaster)
      $("abilities").innerHTML += button(
        "hew",
        "Добивающая атака · бонусное",
        !play || !target || u.bonus <= 0 || u.hewTurn !== s.turnSerial,
      );
    if (!f.martialArts && f.masteries?.includes("nick"))
      $("abilities").innerHTML += button(
        "nick",
        "Быстрая атака другим лёгким оружием",
        !play || !target || u.nickUsed || !u.lightWeaponUsed,
      );
    if (f.maneuvers?.includes("bait"))
      $("abilities").innerHTML += button(
        "bait",
        "Приманка и смена · защита союзнику",
        !play ||
          !selected ||
          engine.unit(selected).team !== u.team ||
          selected === id ||
          u.move < 5,
      );
    if (f.tacticalMaster)
      $("abilities").innerHTML +=
        '<label>Свойство следующей атаки <select id="mastery"><option value="">Свойство оружия</option><option value="push">Толчок</option><option value="sap">Ослабление</option><option value="slow">Замедление</option></select></label>';
    if (f.layOnHands)
      $("abilities").innerHTML +=
        "<h3>Наложение рук · " +
        count("lay_on_hands") +
        '</h3><select id="healing-target">' +
        s.order
          .filter((k) => engine.unit(k).team === u.team && !engine.unit(k).dead)
          .map(
            (k) =>
              '<option value="' +
              esc(k) +
              '">' +
              esc(engine.name(k)) +
              "</option>",
          )
          .join("") +
        '</select><label>ПЗ <input type="number" id="healing-amount" min="1" max="' +
        count("lay_on_hands") +
        '" value="5"></label><div class="choices">' +
        button(
          "layOnHands",
          "Восстановить ПЗ",
          !play || u.bonus <= 0 || count("lay_on_hands") <= 0,
        ) +
        button(
          "curePoison",
          "Снять отравление · 5",
          !play || u.bonus <= 0 || count("lay_on_hands") < 5,
        ) +
        "</div>";
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
        path,
        maneuver: $("strike-maneuver")?.value || null,
        ally: $("strike-ally")?.value,
        savage: $("strike-savage")?.checked || false,
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
      if (
        (u.controlled && !p) ||
        (p?.kind === "freeMovement" && engine.unit(p.actor).controlled)
      ) {
        const movingId = p?.kind === "freeMovement" ? p.actor : id,
          movingUnit = engine.unit(movingId);
        const field = new CombatBattlefield({
          walls: new Set(engine.s.terrain.walls),
          rubble: new Set(engine.s.terrain.rubble),
          key: (x, y) => x + "," + y,
          occupant: (x, y) => {
            const k = engine.occupied(x, y);
            return k &&
              !engine.canPass(movingId, k) &&
              !engine.unit(k).hidden &&
              engine.canSee(movingId, k)
              ? k
              : null;
          },
          actor: () => movingUnit,
          webDifficult: () => false,
          width: engine.s.terrain.width,
          height: engine.s.terrain.height,
          movementRisk: (a, b) =>
            engine
              .enemies(movingId)
              .filter(
                (k) =>
                  engine.canSee(movingId, k) &&
                  engine.distance(a, engine.unit(k)) <= 5 &&
                  engine.distance(b, engine.unit(k)) > 5,
              ).length,
        });
        path = field.findPath(point) || [];
        if (
          field.pathCost(path) >
          (p?.kind === "freeMovement" ? p.budget : u.move)
        )
          path = [];
        notice = path.length
          ? "Проверь маршрут и нажми «Пройти» в окне решения."
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
        localStorage.setItem(KEY + "-previous", JSON.stringify(sessionValue()));
      } catch {}
      newBattle(defaultScene);
      return;
    }
    if (op === "save") {
      save();
      return;
    }
    if (op === "export") {
      download(runtime.campaign_id + "-battle-v30.json", sessionValue());
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
          runtime.campaign_id + "-battle-result.json",
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
        runtime.campaign_id + "-combat-journal.txt",
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
    if (op === "pack") {
      $("pack-file").click();
      return;
    }
    if (["layOnHands", "curePoison"].includes(op)) {
      act({
        kind: "layOnHands",
        actor: id,
        target: $("healing-target").value,
        amount: Number($("healing-amount").value),
        curePoison: op === "curePoison",
      });
      return;
    }
    if (
      [
        "secondWind",
        "actionSurge",
        "steadyAim",
        "knowEnemy",
        "restoreKnowEnemy",
      ].includes(op)
    ) {
      act({ kind: op, actor: id, target: selected });
      return;
    }
    if (["cunningHide", "cunningDash", "cunningDisengage"].includes(op)) {
      act({
        kind: {
          cunningHide: "hide",
          cunningDash: "dash",
          cunningDisengage: "disengage",
        }[op],
        actor: id,
        cost: "bonus",
      });
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
    if (op === "hew") {
      act({
        kind: "attack",
        actor: id,
        target: selected,
        weapon,
        mode: "hew",
        mastery: $("mastery")?.value || null,
      });
      return;
    }
    if (op === "bait") {
      act({ kind: "bait", actor: id, target: selected, recipient: selected });
      return;
    }
    const mapped = {
      bonusStrike: {
        kind: "attack",
        weapon: u.attacks.find((a) => a.unarmed)?.id || weapon,
        mode: "bonus",
      },
      flurryStrike: {
        kind: "attack",
        weapon: u.attacks.find((a) => a.unarmed)?.id || weapon,
        mode: "flurry",
      },
      nick: {
        kind: "attack",
        weapon: u.attacks.find((a) => a.mastery === "nick")?.id || weapon,
        mode: "nick",
      },
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
      act({
        kind: op,
        actor: id,
        target: selected,
        weapon,
        mastery: op === "attack" ? $("mastery")?.value || null : null,
        ...mapped[op],
      });
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
  $("pack-file").addEventListener("change", async (e) => {
    try {
      if (e.target.files[0]) {
        const nextRuntime = CombatContentPack.compile(
          JSON.parse(await e.target.files[0].text()),
        );
        newBattle(CombatContentPack.encounter(nextRuntime), nextRuntime);
      }
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
    const savedPack = localStorage.getItem(PACK_SLOT);
    if (savedPack) {
      runtime = CombatContentPack.compile(JSON.parse(savedPack));
      defaultScene = CombatContentPack.encounter(runtime);
      KEY = runtime.campaign_id + "-combat-session-v30";
    }
    const stored = globalThis.__bindings?.value?.session;
    const local = localStorage.getItem(KEY);
    if (stored)
      load({
        kind: "dnd-combat-session",
        version: 30,
        session: stored,
        contentPack: globalThis.__bindings?.value?.contentPack,
      });
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
