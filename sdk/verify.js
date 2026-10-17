#!/usr/bin/env node
"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
try {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "engine-manifest.json"), "utf8"),
  );
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (path.isAbsolute(name) || name.split("/").includes(".."))
      throw Error("Invalid manifest path");
    const actual = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, name)))
      .digest("hex");
    if (actual !== expected) throw Error("Checksum mismatch: " + name);
  }
  console.log("Engine package verified: " + manifest.engine_version);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
