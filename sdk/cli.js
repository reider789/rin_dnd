#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const { createBattle, CombatCapabilities } = require("./index");
try {
  const [command, path, encounter] = process.argv.slice(2);
  if (command === "capabilities")
    console.log(JSON.stringify(CombatCapabilities.manifest(), null, 2));
  else {
    if (!["validate", "compile"].includes(command) || !path)
      throw Error(
        "Usage: node sdk/cli.js capabilities | validate PACK | compile PACK [ENCOUNTER]",
      );
    const pack = JSON.parse(fs.readFileSync(path, "utf8"));
    if (command === "validate") {
      for (const name of Object.keys(pack.encounters || {}))
        createBattle(pack, name);
      createBattle(pack);
      console.log(
        JSON.stringify({
          ok: true,
          id: pack.id,
          revision: pack.revision,
          encounters: Object.keys(pack.encounters),
        }),
      );
    } else {
      const { runtime, scene } = createBattle(pack, encounter);
      console.log(JSON.stringify({ runtime, scene }));
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
