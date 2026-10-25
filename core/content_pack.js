"use strict";
const ContentCapabilities =
  typeof module !== "undefined"
    ? require("./capabilities").CombatCapabilities
    : CombatCapabilities;
const ContentActivities = typeof module !== "undefined"
  ? require("./activities").CombatActivities : CombatActivities;
class CombatContentPack {
  static compile(input) {
    const C = ContentCapabilities,
      pack = structuredClone(input);
    C.require(
      pack?.kind === "dnd-combat-pack" && pack.version === 1,
      "Нужен пакет dnd-combat-pack v1",
    );
    C.require(
      pack.rules_version === C.RULES && pack.api === C.API,
      "Несовместимая версия правил или API пакета",
    );
    const id = (value) =>
      typeof value === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/.test(value) &&
      !["__proto__", "constructor", "prototype"].includes(value);
    C.require(
      id(pack.id) && Number.isInteger(pack.revision) && pack.revision >= 1,
      "Неверный ID или ревизия пакета",
    );
    const object = (v) => v && typeof v === "object" && !Array.isArray(v);
    const fields = (value, allowed, where) =>
      C.require(
        Object.keys(value).every((k) => allowed.includes(k)),
        "Неподдержанное поле: " +
          where +
          " / " +
          Object.keys(value)
            .filter((k) => !allowed.includes(k))
            .join(", "),
      );
    fields(
      pack,
      [
        "kind",
        "version",
        "api",
        "id",
        "revision",
        "name",
        "rules_version",
        "requires",
        "abilities",
        "profiles",
        "characters",
        "default_encounter",
        "encounters",
        "notes",
        "source_state_sha256", "continuity", "campaign_clock",
      ],
      "пакет",
    );
    C.require(
      object(pack.profiles) &&
        object(pack.characters) &&
        Object.keys(pack.characters).length,
      "Нет профилей или персонажей пакета",
    );
    for (const requirement of pack.requires || [])
      C.require(
        requirement.startsWith("feature:")
          ? Object.hasOwn(C.FEATURES, requirement.slice(8))
          : C.manifest().handlers.includes(requirement),
        "Недостающая возможность: " + requirement,
      );
    const definitions = pack.abilities || {},
      profiles = {};
    // All declarations are checked, including an ability not yet assigned to an actor.
    for (const [key, ability] of Object.entries(definitions)) {
      C.require(id(key) && object(ability), "Неверное описание способности");
      if (ability.handler === "features") {
        fields(ability, ["handler", "features"], key);
        C.require(
          object(ability.features),
          "Нужны параметры способности: " + key,
        );
        C.features(ability.features);
      } else if (ability.handler === "onHitCondition") {
        C.require(
          Array.isArray(ability.attacks) && ability.attacks.length,
          "Нужны атаки способности " + key,
        );
        const { attacks, ...effect } = ability;
        C.effect(effect);
      } else if (ability.handler === "healing") ContentActivities.validate(ability);
      else
        throw Error(
          "Недостающий обработчик способности: " +
            key +
            " / " +
            ability.handler,
        );
    }
    for (const [key, raw] of Object.entries(pack.profiles)) {
      C.require(id(key) && object(raw), "Неверный профиль");
      const p = structuredClone(raw);
      fields(
        p,
        [
          "name",
          "hp",
          "ac",
          "speed",
          "scores",
          "proficiency",
          "features",
          "attacks",
          "abilities",
          "saveProficiencies",
          "skillProficiencies",
          "saves",
          "skills",
          "senses",
          "deathSaves",
          "resistances",
          "immunities",
          "vulnerabilities",
          "conditionImmunities",
          "tactics",
          "tokenKey",
          "size", "casting", "equipment", "exhaustion", "reference", "summoner", "summonLevel", "summonDC", "creatureType", "powerAvailable", "initialHP",
        ],
        key,
      );
      C.require(p.initialHP===undefined||(Number.isInteger(p.initialHP)&&p.initialHP>=0&&p.initialHP<=p.hp),"Неверные текущие ПЗ профиля");
      p.features ??= {};
      C.require(
        p.size === undefined ||
          (Number.isInteger(p.size) && p.size >= 0 && p.size <= 5),
        "Неверный размер: " + key,
      );
      C.require(
        typeof p.name === "string" &&
          p.name.trim() &&
          Number.isInteger(p.hp) &&
          p.hp > 0 &&
          Number.isInteger(p.ac) &&
          p.ac >= 0 &&
          p.ac <= 40,
        "Нужны имя, ПЗ и КД профиля " + key,
      );
      C.require(
        Number.isInteger(p.speed) &&
          p.speed >= 0 &&
          p.speed <= 200 &&
          Number.isInteger(p.proficiency) &&
          p.proficiency >= 0 &&
          p.proficiency <= 9,
        "Неверная скорость или мастерство: " + key,
      );
      C.require(
        object(p.scores) &&
          ["STR", "DEX", "CON", "INT", "WIS", "CHA"].every(
            (k) =>
              Number.isInteger(p.scores[k]) &&
              p.scores[k] >= 1 &&
              p.scores[k] <= 30,
          ),
        "Нужны шесть характеристик: " + key,
      );
      C.require(
        Array.isArray(p.attacks) &&
          p.attacks.length &&
          new Set(p.attacks.map((a) => a.id)).size === p.attacks.length,
        "Нужны уникальные атаки: " + key,
      );
      for (const abilityId of p.abilities || []) {
        const ability = definitions[abilityId];
        C.require(ability, "Неизвестная способность " + key + ": " + abilityId);
        if (ability.handler === "features") {
          for (const [feature, value] of Object.entries(ability.features)) {
            C.require(
              p.features[feature] === undefined ||
                JSON.stringify(p.features[feature]) === JSON.stringify(value),
              "Конфликт параметров: " + feature,
            );
            p.features[feature] = structuredClone(value);
          }
        } else if (ability.handler === "healing") {
          (p.activities ??= {})[abilityId] = structuredClone(ability);
        } else {
          const { attacks, ...effect } = ability;
          for (const attackId of attacks) {
            const attack = p.attacks.find((a) => a.id === attackId);
            C.require(attack, "Нет атаки " + attackId + " для " + abilityId);
            (attack.effects ??= []).push(structuredClone(effect));
          }
        }
      }
      const M = typeof module !== "undefined" ? require("./magic").CombatMagic : CombatMagic;
      M.validateCasting(p.casting);
      if(p.equipment) C.require(Object.keys(p.equipment).every(k=>["armor","forgeAttuned","stormBracers","vaeltirFocus","leafPartner","rootPartner","potionIds","consumables","reference"].includes(k)), "Неизвестный предметный обработчик");
      C.features(p.features);
      for (const a of p.attacks) C.attack(a);
      if (p.conditionImmunities)
        C.require(
          Array.isArray(p.conditionImmunities) &&
            p.conditionImmunities.every((x) =>
              ["poisoned", "prone", "frost", "paralyzed", "stunned", "restrained", "blinded", "deafened", "frightened", "charmed", "unconscious"].includes(x),
            ),
          "Неверный иммунитет к состоянию",
        );
      profiles[key] = p;
    }
    const characters = {};
    const resourceFields = [
      "hp",
      "focus",
      "luck",
      "heroic",
      "arrows",
      "unusual_metabolism",
      ...C.COUNTERS,
    ];
    for (const [key, char] of Object.entries(pack.characters)) {
      fields(char, ["name", "profile", "resources", "inventory"], key);
      C.require(
        id(key) && profiles[char.profile],
        "Неизвестный профиль персонажа: " + key,
      );
      const p = profiles[char.profile],
        resources = structuredClone(
          char.resources || { hp: { current: p.hp, max: p.hp } },
        );
      C.require(
        resources.hp?.max === p.hp,
        "Максимум ПЗ расходится с профилем: " + key,
      );
      for (const [name, value] of Object.entries(resources)) {
        if (name === "spell_slots") {
          for (const [level, pool] of Object.entries(value)) {
            C.require(/^[1-9]$/.test(level), "Неверный круг ячейки");
            C.counter(pool);
          }
        } else {
          C.require(
            resourceFields.includes(name),
            "Неподдержанный ресурс: " + name,
          );
          C.counter(value);
        }
      }
      const inventory = char.inventory || [];
      C.require(
        Array.isArray(inventory) &&
          new Set(inventory.map((v) => v.id)).size === inventory.length &&
          inventory.every(
            (v) =>
              typeof v.id === "string" && v.id.length>0 && v.id.length<=200 && !["__proto__","constructor","prototype"].includes(v.id) &&
              Number.isInteger(v.quantity) &&
              v.quantity >= 0 &&
              typeof v.combat_available === "boolean",
          ),
        "Неверный инвентарь: " + key,
      );
      characters[key] = {
        name: char.name || p.name,
        resources,
        inventory,
        combat_profile: p,
      };
    }
    C.require(
      pack.default_encounter && pack.encounters?.[pack.default_encounter],
      "Нет стартового сценария",
    );
    for (const [name, scene] of Object.entries(pack.encounters)) {
      C.require(
        id(name) && object(scene.heroes) && Array.isArray(scene.enemies),
        "Неверный сценарий: " + name,
      );
      for (const [key, actor] of Object.entries(scene.heroes)) {
        fields(
          actor,
          [
            "cell",
            "initiative",
            "profile",
            "controlled",
            "name",
            "tactics",
            "tokenKey",
          ],
          name + "/" + key,
        );
        C.require(
          characters[key] || profiles[actor.profile],
          "Нет персонажа или профиля: " + key,
        );
      }
      for (const actor of scene.enemies) {
        fields(
          actor,
          [
            "id",
            "profile",
            "cell",
            "initiative",
            "name",
            "tactics",
            "tokenKey",
            "resources",
          ],
          name + "/противник",
        );
        C.require(
          profiles[actor.profile],
          "Нет профиля противника: " + actor.profile,
        );
      }
      if (scene.kind === "story")
        C.require(
          /^[a-f0-9]{64}$/.test(pack.source_state_sha256 || ""),
          "Сюжетный пакет требует SHA-256 исходного канона",
        );
      else C.require(scene.kind === "training", "Неверный тип сценария");
    }
    return {
      schema_version: 2,
      combat_schema_version: 30,
      campaign_id: pack.id,
      title: pack.name || pack.id,
      source_state_revision: pack.revision,
      source_state_sha256:
        pack.source_state_sha256 ||
        "content-pack:" + pack.id + ":" + pack.revision,
      rules_version: pack.rules_version,
      result_kind: "dnd-combat-result",
      characters,
      npc_profiles: profiles,
      content_pack: pack,
      is_canonical: false,
    };
  }
  static encounter(runtime, name = runtime.content_pack.default_encounter) {
    const scene = structuredClone(runtime.content_pack.encounters[name]);
    ContentCapabilities.require(scene, "Нет сценария: " + name);
    return scene;
  }
}
if (typeof module !== "undefined") module.exports = { CombatContentPack };
