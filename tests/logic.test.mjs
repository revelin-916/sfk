import { test } from "node:test";
import assert from "node:assert/strict";
import {
    degreeOfSuccess,
    glitchingDC,
    autoFireExpend,
    ammoRemaining,
    crossedLowAmmo,
    regenShields,
    applyShipDamage,
    parseAttunement,
    splitCredits,
    factionTier,
    moveDirection,
    mergeIndexed,
    nextTick,
    parseCommsCommand,
} from "../scripts/core/logic.mjs";

test("degree of success: thresholds and natural 20/1", () => {
    assert.equal(degreeOfSuccess(25, 15), 3);
    assert.equal(degreeOfSuccess(15, 15), 2);
    assert.equal(degreeOfSuccess(14, 15), 1);
    assert.equal(degreeOfSuccess(5, 15), 0);
    assert.equal(degreeOfSuccess(14, 15, 20), 2, "nat 20 bumps failure to success");
    assert.equal(degreeOfSuccess(16, 15, 1), 1, "nat 1 drops success to failure");
    assert.equal(degreeOfSuccess(30, 15, 20), 3, "cap at crit success");
    assert.equal(degreeOfSuccess(1, 15, 1), 0, "floor at crit failure");
});

test("glitching DC = 5 + value", () => {
    assert.equal(glitchingDC(1), 6);
    assert.equal(glitchingDC(3), 8);
    assert.equal(glitchingDC(undefined), 5);
});

test("auto-fire expends 2 per target", () => {
    assert.equal(autoFireExpend(0), 0);
    assert.equal(autoFireExpend(3), 6);
    assert.equal(autoFireExpend(-2), 0);
});

test("ammo remaining: battery uses vs loose quantity", () => {
    assert.equal(ammoRemaining({ usesValue: 14, usesMax: 20, quantity: 1 }), 14);
    assert.equal(ammoRemaining({ usesValue: 1, usesMax: 1, quantity: 9 }), 9);
});

test("low-ammo crossing fires once", () => {
    assert.equal(crossedLowAmmo(10, 5, 20, 25), true);
    assert.equal(crossedLowAmmo(5, 4, 20, 25), false, "already below line");
    assert.equal(crossedLowAmmo(2, 0, 20, 25), true, "empty always warns");
    assert.equal(crossedLowAmmo(5, 10, 20, 25), false, "reload is not a warning");
    assert.equal(crossedLowAmmo(3, 2, null, 25), false, "no max, not empty");
});

test("shields regenerate to max", () => {
    assert.equal(regenShields({ value: 2, max: 10, regen: 5 }), 7);
    assert.equal(regenShields({ value: 8, max: 10, regen: 5 }), 10);
    assert.equal(regenShields({ value: 0, max: 0, regen: 5 }), 0);
});

test("ship damage: shields first, then HP; repair heals HP only", () => {
    const craft = { hp: { value: 30, max: 30 }, shields: { value: 6, max: 10 } };
    const r = applyShipDamage(craft, 10);
    assert.deepEqual([r.toShields, r.toHP, r.shields.value, r.hp.value], [6, 4, 0, 26]);
    const s = applyShipDamage(craft, 4);
    assert.deepEqual([s.toShields, s.toHP, s.shields.value, s.hp.value], [4, 0, 2, 30]);
    const h = applyShipDamage({ hp: { value: 10, max: 30 }, shields: { value: 0, max: 10 } }, -50);
    assert.equal(h.hp.value, 30);
    assert.equal(h.shields.value, 0);
    const k = applyShipDamage({ hp: { value: 3, max: 30 }, shields: { value: 0, max: 10 } }, 99);
    assert.equal(k.hp.value, 0);
});

test("attunement parse", () => {
    assert.equal(parseAttunement(["self:level:3", "stellar-attunement:photon"]), "photon");
    assert.equal(parseAttunement(new Set(["stellar-attunement:graviton"])), "graviton");
    assert.equal(parseAttunement(["stellar-attunement:unattuned"]), "unattuned");
    assert.equal(parseAttunement(["stellar-attunement"]), null);
});

test("credit split", () => {
    assert.deepEqual(splitCredits(1000, 3), { share: 333, remainder: 1 });
    assert.deepEqual(splitCredits(100, 0), { share: 0, remainder: 100 });
});

test("faction tiers", () => {
    const tiers = [
        { min: -999, label: "Hostile" },
        { min: -4, label: "Neutral" },
        { min: 5, label: "Friendly" },
    ];
    assert.equal(factionTier(-20, tiers), "Hostile");
    assert.equal(factionTier(0, tiers), "Neutral");
    assert.equal(factionTier(5, tiers), "Friendly");
});

test("move direction", () => {
    assert.deepEqual(moveDirection(200, -100), { x: 1, y: -1 });
    assert.deepEqual(moveDirection(0, 50), { x: 0, y: 1 });
});

test("mergeIndexed preserves unpatched fields", () => {
    const out = mergeIndexed(
        [
            { id: "a", name: "Pilot", skill: "piloting" },
            { id: "b", name: "Gunner", skill: "perception" },
        ],
        { 1: { skill: "computers" } },
    );
    assert.deepEqual(out[1], { id: "b", name: "Gunner", skill: "computers" });
    assert.deepEqual(out[0], { id: "a", name: "Pilot", skill: "piloting" });
});

test("infosphere next tick", () => {
    assert.equal(nextTick(3600, 8), 3600 + 8 * 3600);
});

test("comms command parsing", () => {
    assert.deepEqual(parseCommsCommand("/comm Station Control | Hold position."), {
        channel: "comm",
        from: "Station Control",
        text: "Hold position.",
    });
    assert.deepEqual(parseCommsCommand("/ai Hull breach on deck 3"), { channel: "ai", from: "", text: "Hull breach on deck 3" });
    assert.deepEqual(parseCommsCommand("/alert Brace | for impact"), { channel: "alert", from: "", text: "Brace | for impact" });
    assert.equal(parseCommsCommand("hello"), null);
});
