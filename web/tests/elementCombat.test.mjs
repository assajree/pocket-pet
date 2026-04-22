import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAction,
  createExchangeSnapshot,
  createNewState,
  runCombatEncounter,
  tickState,
  validateExchangeSnapshot
} from "../gameState.js";
import {
  formatPetElementLabel,
  getPetAttackElement,
  getPetDefenseElement,
  getPetDefaultAttackElement,
  PET_CATALOG
} from "../helpers/petAssets.js";

test("pet catalog exposes defense elements for each species", () => {
  assert.equal(PET_CATALOG.classic.attackElement, "neutral");
  assert.equal(PET_CATALOG.specie1.attackElement, "water");
  assert.equal(PET_CATALOG.specie2.attackElement, "shadow");
  assert.equal(getPetDefaultAttackElement("classic"), "neutral");
  assert.equal(getPetDefaultAttackElement("specie1"), "water");
  assert.equal(getPetDefenseElement("egg"), "neutral");
  assert.equal(getPetDefenseElement("classic"), "neutral");
  assert.equal(getPetDefenseElement("specie1"), "water");
  assert.equal(getPetDefenseElement("specie2"), "shadow");
  assert.equal(formatPetElementLabel("water"), "Water");
});

test("element orb item changes attack element temporarily and then expires", () => {
  const state = createNewState();
  state.petId = "classic";
  state.evolutionStage = "child";
  state.inventory = {
    ...state.inventory,
    "element-water": 1
  };

  const result = applyAction(state, "element-water");

  assert.equal(result.ok, true);
  assert.equal(state.attackElement, "water");
  assert.equal(getPetAttackElement(state), "water");

  state.attackElementExpiresAt = Date.now() - 1;
  tickState(state, 1);

  assert.equal(state.attackElement, null);
  assert.equal(state.attackElementExpiresAt, 0);
  assert.equal(getPetAttackElement(state), "neutral");
});

test("exchange snapshots include attack and defense elements and validate the schema", () => {
  const state = createNewState();
  state.petId = "specie1";
  state.evolutionStage = "teen";
  state.inventory = {
    ...state.inventory,
    "element-water": 1
  };
  applyAction(state, "element-water");

  const snapshot = createExchangeSnapshot(state);
  const validated = validateExchangeSnapshot(snapshot);

  assert.equal(snapshot.version, 3);
  assert.equal(snapshot.attackElement, "water");
  assert.equal(snapshot.defenseElement, "water");
  assert.equal(validated.ok, true);
  assert.equal(validated.snapshot.attackElement, "water");
  assert.equal(validated.snapshot.defenseElement, "water");
});

test("combat uses attack and defense elements independently", () => {
  const neutralSnapshot = {
    version: 3,
    petName: "Alpha",
    createdAt: 1,
    evolutionStage: "adult",
    attackElement: "neutral",
    defenseElement: "neutral",
    hunger: 80,
    happiness: 80,
    energy: 60,
    health: 80,
    cleanliness: 80,
    weight: 30,
    money: 10,
    str: 30,
    agi: 30,
    int: 30,
    isAlive: true,
    isSleeping: false,
    isSick: false,
    checksum: "00000001"
  };

  const remoteSnapshot = {
    version: 3,
    petName: "Beta",
    createdAt: 2,
    evolutionStage: "adult",
    attackElement: "neutral",
    defenseElement: "fire",
    hunger: 80,
    happiness: 80,
    energy: 60,
    health: 80,
    cleanliness: 80,
    weight: 30,
    money: 10,
    str: 30,
    agi: 30,
    int: 30,
    isAlive: true,
    isSleeping: false,
    isSick: false,
    checksum: "00000002"
  };

  const neutralResult = runCombatEncounter(neutralSnapshot, remoteSnapshot, "seed-1");
  const waterResult = runCombatEncounter(
    { ...neutralSnapshot, attackElement: "water", checksum: "00000003" },
    remoteSnapshot,
    "seed-1"
  );

  assert.notDeepEqual(neutralResult.rounds, waterResult.rounds);
  assert.notEqual(neutralResult.summary, waterResult.summary);
});
