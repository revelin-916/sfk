import { test } from "node:test";
import assert from "node:assert/strict";
import { basicSaveDamage, strikeDamage, roleMatches, resolveDC, victoryReached } from "../scripts/core/logic.mjs";

test("basic save damage by degree", () => {
    assert.deepEqual([0, 1, 2, 3].map((d) => basicSaveDamage(5, d)), [10, 5, 2, 0]);
});

test("strike damage by degree", () => {
    assert.deepEqual([0, 1, 2, 3].map((d) => strikeDamage(7, d)), [0, 0, 7, 14]);
});

test("role matching", () => {
    assert.equal(roleMatches("Gunner 2", "gunner"), true);
    assert.equal(roleMatches("Magic Officer", ["magic officer", "science officer"]), true);
    assert.equal(roleMatches("Science Officer", ["magic officer", "science officer"]), true);
    assert.equal(roleMatches("Pilot", "engineer"), false);
    assert.equal(roleMatches("Gunnery Chief", "gunner"), false);
    assert.equal(roleMatches("Anything", []), true);
});

test("DC references", () => {
    const ship = { ac: 15, fort: 10, ref: 6, will: 4 };
    assert.equal(resolveDC("will", ship), 14);
    assert.equal(resolveDC("ac", ship), 15);
    assert.equal(resolveDC(18, ship), 18);
});

test("victory modes", () => {
    const base = { round: 2, victory: { mode: "hpOrVp", vp: 0, vpTarget: 5 }, threats: [{ hp: { value: 10, max: 50 } }, { hp: { value: 0, max: 0 } }] };
    assert.equal(victoryReached(base), null);
    assert.equal(victoryReached({ ...base, victory: { ...base.victory, vp: 5 } }), "vp");
    assert.equal(victoryReached({ ...base, threats: [{ hp: { value: 0, max: 50 } }, { hp: { value: 0, max: 0 } }] }), "hp");
    assert.equal(victoryReached({ ...base, victory: { mode: "hp" }, threats: [{ hp: { value: 0, max: 0 } }] }), null, "hazard-only scenes can't be won by HP");
    assert.equal(victoryReached({ round: 5, victory: { mode: "rounds", roundsTarget: 4 }, threats: [] }), "rounds");
});
