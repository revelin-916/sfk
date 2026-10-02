/**
 * SFK — Starfinder Foundry Kit
 * Automation and immersion layer for the Starfinder Second Edition system (sf2e) on Foundry VTT v14.
 */
import { MODULE_ID, SYSTEM_ID, TEMPLATE_ROOT } from "./core/constants.mjs";
import { log, warn } from "./core/foundry.mjs";
import { registerSettings } from "./core/settings.mjs";
import { initChat } from "./core/chat.mjs";

import { initVolley } from "./combat/volley.mjs";
import { initSuppression } from "./combat/suppression.mjs";
import { initConditions, rollGlitching } from "./combat/conditions.mjs";
import { initAmmoWatch } from "./combat/ammo-watch.mjs";
import { initAttunement, getAttunement } from "./combat/attunement.mjs";

import { StarshipSceneApp } from "./starship/app.mjs";
import * as starship from "./starship/state.mjs";

import { initComms, send as commsSend, prompt as commsPrompt } from "./immersion/comms.mjs";
import { initInfosphere, broadcast, editHeadlines } from "./immersion/infosphere.mjs";

import { initLedger, LedgerApp, wallet } from "./economy/ledger.mjs";
import { payout, payoutDialog } from "./economy/payout.mjs";
import { FactionsApp, adjust as adjustFaction, getFactions } from "./economy/factions.mjs";

const api = {
    version: null,
    combat: { rollGlitching, getAttunement },
    starship: {
        open: () => StarshipSceneApp.open(),
        getState: starship.getState,
        damage: starship.damage,
        nextRound: starship.nextRound,
        rollInitiative: starship.rollRoleInitiative,
        roleCheck: starship.roleCheck,
    },
    comms: { send: commsSend, prompt: commsPrompt },
    infosphere: { broadcast, editHeadlines },
    economy: {
        payout,
        payoutDialog,
        wallet,
        openLedger: () => LedgerApp.open(),
        openFactions: () => FactionsApp.open(),
        adjustFaction,
        getFactions,
    },
};

Hooks.once("init", () => {
    if (game.system.id !== SYSTEM_ID) {
        warn(`SFK requires the ${SYSTEM_ID} system; current system is ${game.system.id}. Disabled.`);
        return;
    }
    registerSettings({ StarshipSceneApp, FactionsApp, LedgerApp });
    foundry.applications.handlebars.loadTemplates([`${TEMPLATE_ROOT}/apps/partials/craft-stats.hbs`]);

    initChat();
    initVolley();
    initSuppression();
    initConditions();
    initAmmoWatch();
    initAttunement();
    initComms();
    initInfosphere();
    initLedger();

    const mod = game.modules.get(MODULE_ID);
    api.version = mod.version;
    mod.api = api;
    globalThis.SFK = api;
});

Hooks.once("ready", () => {
    if (game.system.id !== SYSTEM_ID) return;
    log(`v${api.version} ready`);
});
