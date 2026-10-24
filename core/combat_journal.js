"use strict";
// Presentation-only diagnostics. Formatting never runs rules or rolls dice.
class CombatJournal {
  static DAMAGE_TYPES = {bludgeoning:"дробящий",piercing:"колющий",slashing:"рубящий",
    acid:"кислота",cold:"холод",fire:"огонь",force:"силовой",lightning:"электричество",
    necrotic:"некротический",poison:"яд",psychic:"психический",radiant:"излучение",thunder:"звук"};
  static validateEvent(event) {
    const object = x => x && typeof x === "object" && !Array.isArray(x);
    const require = ok => { if (!ok) throw Error("Повреждены подробности журнала"); };
    require(object(event) && typeof event.text === "string");
    const array = (value, check) => value === undefined ||
      (Array.isArray(value) && value.every(check));
    if (event.modifiers !== undefined) {
      require(object(event.modifiers));
      for (const key of ["advantage", "disadvantage"])
        require(array(event.modifiers[key], x => typeof x === "string"));
    }
    require(array(event.bonusParts, b => object(b) && typeof b.label === "string" &&
      Number.isFinite(b.amount) && array(b.rolls, Number.isFinite)));
    require(array(event.breakdown, b => object(b) && typeof b.label === "string" &&
      Number.isFinite(b.before) && Number.isFinite(b.after) &&
      (b.damageType === undefined || typeof b.damageType === "string")));
    this.validateTrace(event.trace);
  }
  static details(event) {
    // Runtime diagnostics must never prevent the rest of the battle from rendering.
    try { this.validateEvent(event); }
    catch (_) { return ["Подробности события повреждены; исходная запись сохранена."]; }

    const out = [], sign = n => (n >= 0 ? "+" : "") + n;
    const m = event.modifiers;
    if (m?.advantage?.length) out.push("Источники преимущества: " + m.advantage.join("; "));
    if (m?.disadvantage?.length) out.push("Источники помехи: " + m.disadvantage.join("; "));
    if (m?.advantage?.length && m?.disadvantage?.length)
      out.push("Преимущество и помеха отменяют друг друга независимо от числа источников.");
    if (event.type === "roll") {
      if (event.sides === 20 && Number.isFinite(event.kept)) out.push("Выбранный результат кости: " + event.kept);
      else if (Number.isFinite(event.total)) out.push("Сумма костей с учётом минимальных значений: " + (event.total - (event.bonus || 0)));
      if (Number.isFinite(event.dc)) out.push("Сложность: " + event.dc);
      if (event.minimum && event.kept > event.rawKept)
        out.push("Минимальный результат по способности: " + event.minimum);
    }
    for (const b of event.bonusParts || []) out.push(b.label + ": " + sign(b.amount) +
      (b.rolls?.length ? " (кости: " + b.rolls.join(", ") + ")" : ""));
    if (event.type === "attack") {
      if (Number.isFinite(event.targetAC)) out.push("Итоговый КД цели: " + event.targetAC);
      if (event.acBonus) out.push("Защитная реакция к КД этой атаки: " + sign(event.acBonus));
    }
    for (const stage of event.breakdown || []) {
      const type = stage.damageType ? " · " + (this.DAMAGE_TYPES[stage.damageType] || stage.damageType) : "";
      out.push(stage.label + type + ": " + stage.before + " → " + stage.after);
    }
    if (event.type === "damage") {
      if (event.temp) out.push("Поглощено временными ПЗ: " + event.temp);
      if (Number.isFinite(event.lost)) out.push("Остаток урона после временных ПЗ: " + event.lost);
      if (Number.isFinite(event.hpLost)) out.push("Фактически потеряно ПЗ: " + event.hpLost);
    }
    if (event.type === "concentration" && Number.isFinite(event.damage))
      out.push("Полученный урон: " + event.damage + "; СЛ концентрации: " + event.dc);
    if (event.trace?.actionId) {
      const number = id => String(id).replace(/^action-/, "");
      out.push("Действие №" + number(event.trace.actionId) +
        (event.trace.parentActionId ? " · связано с действием №" + number(event.trace.parentActionId) : ""));
    }
    return out;
  }
  static text(events) {
    return events.map(e => "Раунд " + e.round + ". " + e.text +
      this.details(e).map(line => "\n  " + line).join("")).join("\n\n");
  }
  static validateTrace(trace) {
    if (trace === undefined) return;
    const id = value => typeof value === "string" && /^action-[1-9][0-9]{0,12}$/.test(value);
    if (!trace || !id(trace.actionId) || !id(trace.rootActionId) ||
        (trace.parentActionId !== null && !id(trace.parentActionId)) ||
        typeof trace.command !== "string" || trace.command.length > 100 ||
        typeof trace.actor !== "string" || trace.actor.length > 120)
      throw Error("Повреждена связь событий действия");
  }
}
if (typeof module !== "undefined") module.exports = {CombatJournal};
