"use strict";
// Storage policy only: never evict a battle to make room for another one.
class CombatSessionStore {
  constructor(storage, limits = {}) {
    this.storage = storage;
    this.archiveLimit = limits.archive ?? 900000;
    this.backupLimit = limits.backup ?? 120000;
    this.totalLimit = limits.total ?? 2250000;
  }
  entries() {
    const result = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith("dnd-combat-session:"))
        result.push([key, this.storage.getItem(key) || ""]);
    }
    return result;
  }
  isBattle(key) {
    return !key.endsWith(":previous") && !key.endsWith("-unreadable");
  }
  stats(current) {
    const entries = this.entries(),
      archived = entries.filter(([k]) => k !== current && this.isBattle(k));
    return {
      archive: archived.reduce((n, [k, v]) => n + k.length + v.length, 0),
      count: archived.length,
      total: entries.reduce((n, [k, v]) => n + k.length + v.length, 0),
      limit: this.archiveLimit,
    };
  }
  trimBackups(current, all = false) {
    for (const [key, raw] of this.entries())
      if (
        key.endsWith(":previous") &&
        (all || key !== current + ":previous" || raw.length > this.backupLimit)
      )
        this.storage.removeItem(key);
  }
  write(key, raw) {
    this.trimBackups(key);
    try {
      this.storage.setItem(key, raw);
    } catch {
      // Redundant recovery copies yield to the current battle, never history.
      this.trimBackups(key, true);
      this.storage.setItem(key, raw);
    }
  }
  checkpoint(key, raw) {
    this.trimBackups(key);
    const previous = key + ":previous";
    if (
      raw.length > this.backupLimit ||
      this.stats(key).total + raw.length > this.totalLimit
    ) {
      this.storage.removeItem(previous);
      return false;
    }
    try {
      this.storage.setItem(previous, raw);
      return true;
    } catch {
      return false;
    }
  }
  allowSwitch(next, released = null) {
    const size = this.archive(next)
      .filter(([key]) => key !== released)
      .reduce((n, [k, v]) => n + k.length + v.length, 0);
    if (size > this.archiveLimit)
      throw Error(
        "Архив боёв заполнен. Выгрузи архив и удали старые бои в «Бои и настройки»; текущий бой сохранён и остаётся открытым",
      );
  }
  archive(current) {
    return this.entries().filter(
      ([key]) => key !== current && this.isBattle(key),
    );
  }
  remove(key, current) {
    if (key === current) throw Error("Текущий бой защищён от удаления");
    this.storage.removeItem(key);
    this.storage.removeItem(key + ":previous");
  }
}
if (typeof module !== "undefined") module.exports = { CombatSessionStore };
