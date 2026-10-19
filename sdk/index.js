"use strict";
const { CombatCapabilities } = require("../core/capabilities");
const { CombatContentPack } = require("../core/content_pack");
const { CombatRulesEngine } = require("../core/rules_engine");
const { CombatCampaignAdapter } = require("../core/campaign_adapter");
const { CombatTacticalAI } = require("../core/tactical_ai");
function createBattle(pack, encounter, seed = 1) {
  const runtime = CombatContentPack.compile(pack);
  const scene = CombatContentPack.encounter(runtime, encounter);
  const engine = new CombatRulesEngine(
    CombatCampaignAdapter.create(runtime, scene, seed),
  );
  return { runtime, scene, engine };
}
module.exports = {
  CombatMagic:require("../core/magic").CombatMagic,
  CombatAdvancedFeatures:require("../core/advanced_features").CombatAdvancedFeatures,
  CombatCapabilities,
  CombatContentPack,
  CombatRulesEngine,
  CombatCampaignAdapter,
  CombatTacticalAI,
  createBattle,
};
