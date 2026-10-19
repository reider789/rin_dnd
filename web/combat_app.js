"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    root = $("combat-app"),
    embeddedRuntime = JSON.parse($("runtime").textContent),
    embeddedScene = JSON.parse($("scene").textContent),
    art = JSON.parse($("artpack").textContent).assets;
  const PACK_SLOT = "dnd-combat-active-pack:" + embeddedRuntime.campaign_id;
  const ACTIVE_SLOT = "dnd-combat-active-session:" + embeddedRuntime.campaign_id;
  const INDEX_SLOT = "dnd-combat-session-index:" + embeddedRuntime.campaign_id;
  const battleKey = (s) => "dnd-combat-session:" + encodeURIComponent(s.meta.campaignId) + ":" + encodeURIComponent(s.meta.battleId);
  const readLocal = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  let runtime = embeddedRuntime,
    defaultScene = embeddedScene,
    KEY = runtime.campaign_id + "-combat-session-v30";
  function sessionValue(clone = true) {
    const value = engine.export({ clone });
    if (runtime.content_pack) value.contentPack = runtime.content_pack;
    return value;
  }
  function rememberPack() {
    if (rememberedPack === runtime.content_pack) return;
    if (runtime.content_pack) localStorage.setItem(PACK_SLOT, JSON.stringify(runtime.content_pack));
    else localStorage.removeItem(PACK_SLOT);
    rememberedPack = runtime.content_pack;
  }
  let rememberedPack, localSaved, hostSaved, localRevision = -1, hostRevision = -1;
  let hostFlight = false, hostNeedsSave = false;
  const drafts = new Map();
  const panelOpen = new Map();
  let draftScope = "";
  let visibleActor, visiblePending;
  function captureDraft() {
    if (!draftScope) return;
    const values = {};
    for (const el of root.querySelectorAll("select[id],input[id]:not([type=file]),textarea[id]"))
      values[el.id] = el.type === "checkbox" ? el.checked : el.value;
    drafts.set(draftScope, values);
    panelOpen.set(draftScope, [...root.querySelectorAll("aside details")].map((el) => el.open));
  }
  function restoreDraft() {
    const values = drafts.get(draftScope) || {};
    for (const [id, value] of Object.entries(values)) {
      const el = $(id);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = value;
      else if (el.tagName !== "SELECT" || [...el.options].some((o) => o.value === value)) el.value = value;
    }
    const open = panelOpen.get(draftScope);
    if (open) [...root.querySelectorAll("aside details")].forEach((el, i) => el.open = Boolean(open[i]));
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
    if (!engine) return false;
    const value = sessionValue(false), revision = engine.revision;
    let localOK = localSaved === engine && localRevision === revision;
    let hostOK = hostSaved === engine && hostRevision === revision;
    try {
      if (!localOK) {
        localStorage.setItem(KEY, JSON.stringify(value));
        localSaved = engine; localRevision = revision; localOK = true;
      }
      localStorage.setItem(ACTIVE_SLOT, KEY);
      const index = JSON.parse(localStorage.getItem(INDEX_SLOT) || "{}");
      if (!index[KEY]) {
        index[KEY] = { name: engine.s.meta.name, campaign: engine.s.meta.campaignId, battle: engine.s.meta.battleId };
        localStorage.setItem(INDEX_SLOT, JSON.stringify(index));
      }
      rememberPack();
    } catch { /* The host channel remains independent of local storage. */ }
    const status = () => { $("save-status").textContent = localSaved === engine && localRevision === engine.revision ? "Сохранено в этом браузере" : hostSaved === engine && hostRevision === engine.revision ? "Сохранено в чате; локальное хранилище недоступно" : hostFlight ? "Сохранение в чат…" : "Автосохранение недоступно · скачай JSON"; };
    if (!hostOK && globalThis.__bindings?.setValue) {
      const savedEngine = engine;
      if (hostFlight) hostNeedsSave = true;
      else try {
        // Host owns its snapshot; never hand it the live mutable session.
        const result = globalThis.__bindings.setValue(structuredClone({ session: value.session, contentPack: value.contentPack }));
        if (result?.then) {
          hostFlight = true;
          Promise.resolve(result).then(() => {
            hostSaved = savedEngine; hostRevision = revision;
          }).catch(() => {}).finally(() => {
            hostFlight = false;
            const dirty = hostNeedsSave; hostNeedsSave = false;
            if (dirty) save(); else status();
          });
        }
        else { hostSaved = savedEngine; hostRevision = revision; hostOK = true; }
      } catch { /* A broken host cannot prevent local saving. */ }
    }
    status();
    return localOK || hostOK;
  }
  function checkpoint() {
    if (!engine) return;
    try { localStorage.setItem(KEY + ":previous", JSON.stringify(sessionValue(false))); } catch {}
  }
  function preserveSlot(key, incoming = null) {
    try {
      const previous = localStorage.getItem(key);
      if (previous && (!incoming || previous !== JSON.stringify(incoming))) {
        CombatRulesEngine.validate(JSON.parse(previous).session);
        localStorage.setItem(key + ":previous", previous);
      }
    } catch {}
  }
  function newBattle(scene, nextRuntime = runtime) {
    const next = new CombatRulesEngine(
      CombatCampaignAdapter.create(nextRuntime, scene, seed()),
    );
    next.initialize();
    checkpoint();
    runtime = nextRuntime;
    KEY = battleKey(next.s);
    if (runtime.content_pack)
      defaultScene = CombatContentPack.encounter(runtime);
    engine = next;
    preserveSlot(KEY);
    drafts.clear(); draftScope = "";
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
      : value.session?.meta?.campaignId === embeddedRuntime.campaign_id ? embeddedRuntime : runtime;
    const next = new CombatRulesEngine(value.session);
    if (next.s.meta.campaignId !== nextRuntime.campaign_id)
      throw Error("Сохранение другой кампании");
    next.initialize();
    next.run();
    const nextScene = nextRuntime.content_pack
      ? CombatContentPack.encounter(nextRuntime)
      : nextRuntime === embeddedRuntime ? embeddedScene : defaultScene;
    checkpoint();
    runtime = nextRuntime;
    KEY = battleKey(next.s);
    defaultScene = nextScene;
    engine = next;
    preserveSlot(KEY, value);
    drafts.clear(); draftScope = "";
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
  function fitWorkspace() {
    const scroll = document.fullscreenElement ? root.scrollTop : window.scrollY;
    const top = root.querySelector(".layout").getBoundingClientRect().top + scroll;
    root.querySelector("aside").style.maxHeight = Math.max(260, innerHeight - top - 12) + "px";
    const board = $("board"), boardTop = board.getBoundingClientRect().top + scroll;
    board.parentElement.style.maxWidth = "min(100%, " + Math.max(260, (innerHeight - boardTop - 90) * engine.s.terrain.width / engine.s.terrain.height) + "px)";
  }
  function commandFromButton(b) {
    const op = b.dataset.op, id = engine.actorId, u = engine.unit(id);
    const base = { actor: id, target: selected, weapon };
    const strike = (mode, key = weapon) => ({ ...base, kind: "attack", mode, weapon: key, mastery: $("mastery")?.value || null });
    const moves = { patientFree: ["disengage", false], patientPaid: ["disengage", true], windFree: ["dash", false], windPaid: ["dash", true], cunningHide: ["hide", false], cunningDash: ["dash", false], cunningDisengage: ["disengage", false] };
    if (moves[op]) return { ...base, kind: moves[op][0], cost: "bonus", paid: moves[op][1] };
    if (op === "attack" || op === "hew") return strike(op === "hew" ? "hew" : "action");
    if (op === "bonusStrike" || op === "flurryStrike") return strike(op === "bonusStrike" ? "bonus" : "flurry", u.attacks.find(a => a.unarmed)?.id || weapon);
    if (op === "nick") return strike("nick", u.attacks.find(a => a.mastery === "nick")?.id || weapon);
    if (op === "stabilize" || op === "healPotion") return { ...base, kind: op, target: b.dataset.target, item: b.dataset.item };
    if (op === "layOnHands" || op === "curePoison") return { ...base, kind: "layOnHands", target: $("healing-target")?.value, amount: Number($("healing-amount")?.value), curePoison: op === "curePoison" };
    if (op === "readyApproach" || op === "readyAlly") return { ...base, kind: "ready", trigger: op === "readyApproach" ? "approach" : "attackAlly" };
    if (op === "shovePush") return { ...base, kind: "shove", push: true };
    if (op === "bait") return { ...base, kind: "bait", recipient: selected };
    if (op === "move") return { ...base, kind: "move", path };
    if (["dash", "disengage", "dodge", "hide", "search", "grapple", "shove", "helpAttack", "stand", "escape", "endTurn", "endConcentration", "flurry", "secondWind", "actionSurge", "steadyAim", "knowEnemy", "restoreKnowEnemy"].includes(op)) return { ...base, kind: op };
    return null;
  }
  let availabilityEngine, availabilityRevision = -1;
  const availability = new Map();
  function updateAvailableCommands() {
    if (availabilityEngine !== engine || availabilityRevision !== engine.revision) {
      availability.clear(); availabilityEngine = engine; availabilityRevision = engine.revision;
    }
    const playable = engine.unit(engine.actorId).controlled;
    for (const b of root.querySelectorAll("button[data-op]")) {
      const command = commandFromButton(b);
      if (!command) continue;
      const key = JSON.stringify(command);
      if (!availability.has(key)) availability.set(key, engine.availableAction(command));
      const result = availability.get(key);
      b.disabled = !playable || !result.enabled;
      b.title = result.reason;
    }
  }
  const renderedPanels = new Map();
  function updateHTML(id, value) {
    if (renderedPanels.get(id) === value) return;
    $(id).innerHTML = value;
    renderedPanels.set(id, value);
  }
  function render() {
    const panels = {};
    captureDraft();
    const focused = document.activeElement?.id,
      selectionStart = document.activeElement?.selectionStart,
      selectionEnd = document.activeElement?.selectionEnd;
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
    draftScope = engine.s.meta.campaignId + ":" + engine.s.meta.battleId + ":" + id + ":" + (s.pending?.id || "turn");
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
    panels.queue = s.order
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
    const geometry = s.terrain.width + "x" + s.terrain.height;
    board.style.aspectRatio = s.terrain.width + "/" + s.terrain.height;
    board.parentElement.style.maxWidth = "min(100%, calc((100vh - 310px) * " + (s.terrain.width / s.terrain.height) + "))";
    if (board.dataset.geometry !== geometry) {
      board.dataset.geometry = geometry;
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
    if (selected && s.units[selected]?.team !== u.team &&
        (engine.unit(selected).hidden || !engine.canSee(id, selected))) selected = null;
    for (const b of board.children) {
      const [x, y] = b.dataset.tile.split(",").map(Number),
        p = { x, y },
        occupant = engine.displayedAt(x, y),
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
    panels.route = path.length
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
      panels.route += button(
        "endConcentration",
        "Прекратить свою концентрацию",
        false,
        'data-owner=\"' + esc(owner) + '\"',
      );
    panels.actor =
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
    panels.actions =
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
      '</div><details class="additional"><summary>Другие действия</summary><div class="choices">' +
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
      "</div></details>";
    $("turn-controls").innerHTML = button("endTurn", "Завершить ход", !play, 'class="wide primary"');
    const aid = [];
    for (const item of Object.keys(u.itemTypes || {})) {
      if (u.itemTypes[item] !== "healing") continue;
      const availability = engine.availableAction({ kind: "healPotion", actor: id, item });
      const label = runtime.characters[id]?.inventory?.find((i) => i.id === item)?.name || "Лечебное зелье";
      aid.push(button("healPotion", esc(label) + " · " + (u.items[item] || 0) + "<small>Бонусное действие</small>", !play || !availability.enabled, 'data-item="' + esc(item) + '" title="' + esc(availability.reason) + '"'));
    }
    for (const targetId of s.order.filter((k) => engine.unit(k).team === u.team && engine.unit(k).hp === 0 && !engine.unit(k).dead)) {
      const availability = engine.availableAction({ kind: "stabilize", actor: id, target: targetId });
      aid.push(button("stabilize", "Помочь: " + esc(engine.name(targetId)) + "<small>Медицина · действие</small>", !play || !availability.enabled, 'data-target="' + esc(targetId) + '" title="' + esc(availability.reason) + '"'));
    }
    if (aid.length) panels.actions += '<div class="choices">' + aid.join("") + '</div>';
    panels.abilities = f.martialArts
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
      panels.abilities += button(
        "restoreKnowEnemy",
        "Восстановить анализ · кость превосходства",
        !play || count("superiority") <= 0,
      );
    if (classButtons)
      panels.abilities +=
        '<h3>Способности</h3><div class="choices">' + classButtons + "</div>";
    if (f.greatWeaponMaster)
      panels.abilities += button(
        "hew",
        "Добивающая атака · бонусное",
        !play || !target || u.bonus <= 0 || u.hewTurn !== s.turnSerial,
      );
    if (!f.martialArts && f.masteries?.includes("nick"))
      panels.abilities += button(
        "nick",
        "Быстрая атака другим лёгким оружием",
        !play || !target || u.nickUsed || !u.lightWeaponUsed,
      );
    if (f.maneuvers?.includes("bait"))
      panels.abilities += button(
        "bait",
        "Приманка и смена · защита союзнику",
        !play ||
          !selected ||
          engine.unit(selected).team !== u.team ||
          selected === id ||
          u.move < 5,
      );
    if (f.tacticalMaster)
      panels.abilities +=
        '<label>Свойство следующей атаки <select id="mastery"><option value="">Свойство оружия</option><option value="push">Толчок</option><option value="sap">Ослабление</option><option value="slow">Замедление</option></select></label>';
    if (f.layOnHands)
      panels.abilities +=
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
    panels.policies = u.controlled
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
    panels.inspector = s.order
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
                    aim: "точный прицел", bait: "прикрыт манёвром", protected: "под защитой",
                    sap: "ослаблен", slow: "замедлен", goaded: "спровоцирован",
                    charmed: "очарован", exhaustion: "истощение",
                  })[z.kind] || z.kind,
              )
              .join(", "),
          ) +
          "</p>" +
          (inv.length
            ? "<p>" +
              inv
                .filter((i) => i.combat_available)
                .map((i) => esc(i.name) + " ×" + (a.items?.[i.id] ?? i.quantity))
                .join(" · ") +
              "</p>"
            : "")
        );
      })
      .join("");
    panels.journal = s.events
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
    for (const [key, value] of Object.entries(panels)) updateHTML(key, value);
    restoreDraft();
    updateAvailableCommands();
    if (focused && $(focused)) {
      $(focused).focus({ preventScroll: true });
      if (typeof selectionStart === "number" && ["textarea", "text"].includes($(focused).type))
        $(focused).setSelectionRange(selectionStart, selectionEnd);
    }
    const recovery = $("recovery");
    try {
      const index = JSON.parse(localStorage.getItem(INDEX_SLOT) || "{}");
      recovery.innerHTML = '<option value="">Сохранённые бои…</option>' + Object.entries(index).map(([key, v]) => '<option value="' + esc(key) + '">' + esc(v.name + ' · ' + v.campaign) + '</option>').join("");
    } catch { recovery.innerHTML = '<option value="">Хранилище недоступно</option>'; }
    fitWorkspace();
    if (visibleActor !== id || visiblePending !== s.pending?.id)
      root.querySelector("aside").scrollTop = 0;
    visibleActor = id; visiblePending = s.pending?.id;
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
        occupant = engine.displayedAt(x, y),
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
          stepCost: (p) => engine.stepCost(movingId, p),
          canStop: (p) => {
            const other = engine.occupied(p.x, p.y, movingId);
            return !other || (engine.unit(other).team !== movingUnit.team &&
              (engine.unit(other).hidden || !engine.canSee(movingId, other)));
          },
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
      newBattle(defaultScene);
      return;
    }
    if (op === "save") {
      save();
      return;
    }
    if (op === "recover") {
      try {
        const raw = localStorage.getItem(KEY + ":previous");
        if (!raw) throw Error("Для этого боя пока нет предыдущего сохранения");
        load(JSON.parse(raw));
      } catch (e) { notice = e.message; error = true; render(); }
      return;
    }
    if (op === "fullscreen") {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else root.requestFullscreen?.().catch(() => { notice = "Полноэкранный режим недоступен в этом окне браузера."; render(); });
      return;
    }
    if (op === "stabilize" || op === "healPotion") {
      act(commandFromButton(b));
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
    if (["darkness", "moveDarkness", "attackAt"].includes(op)) {
      pointMode = op; render(); return;
    }
    if (op === "minorIllusion") {
      const description = prompt("Какой звук или образ создаёт иллюзия?");
      if (description) act({ kind: op, description });
      return;
    }
    const command = commandFromButton(b);
    if (command) act(command);
  });
  root.addEventListener("change", (e) => {
    if (["mastery", "healing-target", "healing-amount"].includes(e.target.id)) {
      captureDraft(); updateAvailableCommands();
    }
    if (e.target.id === "recovery" && e.target.value) {
      try {
        const raw = localStorage.getItem(e.target.value);
        if (!raw) throw Error("Сохранение не найдено");
        load(JSON.parse(raw));
      } catch (err) { notice = err.message; error = true; render(); }
      return;
    }
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
  window.addEventListener("resize", () => requestAnimationFrame(fitWorkspace));
  document.addEventListener("fullscreenchange", () => requestAnimationFrame(fitWorkspace));
  try {
    const stored = globalThis.__bindings?.value?.session;
    const active = readLocal(ACTIVE_SLOT), activeValue = active && readLocal(active);
    let local = activeValue || readLocal(KEY);
    if (activeValue) KEY = active;
    const savedPack = readLocal(PACK_SLOT);
    if (!stored && !local && savedPack) {
      runtime = CombatContentPack.compile(JSON.parse(savedPack));
      defaultScene = CombatContentPack.encounter(runtime);
      KEY = runtime.campaign_id + "-combat-session-v30";
      local = readLocal(KEY);
    }
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
    let recovered = false;
    try {
      const previous = readLocal(KEY + ":previous");
      if (previous) { load(JSON.parse(previous)); recovered = true; }
    } catch {}
    if (!recovered) newBattle(defaultScene);
    notice = (recovered ? "Восстановлено предыдущее исправное сохранение. " : "Не удалось открыть сохранение. Его исходный JSON оставлен отдельно. ") + err.message;
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
        engine.revision++;
        render();
      },
      load,
      create: newBattle,
      stop: () => clearTimeout(timer),
      outcome: () => CombatCampaignAdapter.outcome(engine.s),
    };
})();
