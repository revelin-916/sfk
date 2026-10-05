import { test } from "node:test";
import assert from "node:assert/strict";
import { chat, dialogAnswers } from "./helpers/foundry-stub.mjs";
import { samplePreset } from "./fixtures/sample-preset.mjs";

const st = await import("../scripts/starship/state.mjs");
const eng = await import("../scripts/starship/engine.mjs");

test("starship engine: preset → actions → routines → victory → round → import", async () => {
    st.registerPreset(samplePreset);
    await st.loadPreset("test-chase", { setupIndex: 1 });
    let s = st.getState();
    assert.equal(s.ship.hp.max, 26);
    assert.equal(s.threats.length, 2);
    assert.equal(s.sceneMod.value, -1);
    assert.ok(s.ship.actions.every((a) => a.id) && s.ship.roles.every((r) => r.id));

    s.ship.roles.find((r) => r.name === "Pilot").actorId = st.NPC_CREW;
    await st.saveState(s);
    const dodge = s.ship.actions.find((a) => a.name === "Dodge Debris");
    for (let i = 0; i < 40 && !st.getState().ship.flags.dodge; i++) await eng.runAction(dodge.id);
    assert.equal(st.getState().ship.flags.dodge, true);

    const debris = st.getState().threats.find((t) => t.name === "Debris");
    await eng.runRoutine(debris.id);
    s = st.getState();
    assert.equal(s.ship.flags.dodge, undefined, "flag consumed");
    assert.equal(s.ship.hp.value, 26, "dodged debris");

    await eng.runRoutine(s.threats[0].id);
    s = st.getState();
    assert.ok(s.ship.hp.value + s.ship.shields.value <= 31);

    const evade = s.ship.actions.find((a) => a.name === "Evade");
    for (let i = 0; i < 80 && st.getState().victory.vp < 5; i++) {
        dialogAnswers.push({ crew: "0", check: "0" });
        await eng.runAction(evade.id);
    }
    dialogAnswers.length = 0;
    assert.ok(st.getState().victory.vp >= 5);
    assert.equal(st.getState().victory.announced, "vp");

    await st.nextRound();
    s = st.getState();
    assert.equal(s.round, 1);
    assert.equal(s.ship.offGuard, false);

    s.ship.roles.find((r) => r.name === "Engineer").actorId = st.NPC_CREW;
    s.ship.hp.value = 10;
    await st.saveState(s);
    dialogAnswers.push({ crew: "0", check: "0" });
    await eng.runAction(s.ship.actions.find((a) => a.name === "Repair").id);
    assert.ok(st.getState().ship.hp.value <= 26);

    await st.importScene(JSON.stringify(st.getState()));
    assert.equal(st.getState().ship.name, "Test Explorer");
    assert.ok(chat.length > 5);
});
