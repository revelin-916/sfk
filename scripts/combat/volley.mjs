/**
 * Area Fire / Auto-Fire support.
 *
 * The sf2e system (1.5.x) builds the area-attack chat card (save button, damage button, area placement) but does
 * not spend ammunition for these actions. This module:
 *  - Area Fire: expends the weapon's listed expend value when the card is created.
 *  - Auto-Fire: waits for the cone to be placed, counts creatures inside it, and expends 2 × targets.
 *  - Lists the creatures caught in a placed area and (optionally) targets/selects them so the system's
 *    "Roll saves" button works on the right tokens.
 *  - Records the volley so Suppressing Fire can be applied to failed saves (see suppression.mjs).
 */
import { autoFireExpend, ammoRemaining } from "../core/logic.mjs";
import { L, escapeHTML, ownerIds, gmIds, setting, sysFlags, wait, warn } from "../core/foundry.mjs";
import { postCard, registerCardAction } from "../core/chat.mjs";

/** Recent volleys keyed by attacker actor UUID. Populated on every client (chat hooks fire everywhere). */
export const recentVolleys = new Map();
const VOLLEY_TTL_MS = 10 * 60 * 1000;

function areaContext(message) {
    const ctx = sysFlags(message).context;
    return ctx && ["area-fire", "auto-fire"].includes(ctx.type) ? ctx : null;
}

async function originWeapon(message) {
    const uuid = sysFlags(message).origin?.uuid;
    if (!uuid) return null;
    const item = await fromUuid(uuid);
    return item?.type === "weapon" ? item : null;
}

export function getRecentVolley(actorUuid) {
    const v = recentVolleys.get(actorUuid);
    if (!v || Date.now() - v.ts > VOLLEY_TTL_MS) return null;
    return v;
}

/** Shots left in the weapon's loaded ammunition, or null if it doesn't use tracked ammo. */
export function weaponAmmoState(weapon) {
    const ammo = weapon?.ammo;
    if (!ammo || ammo.type !== "ammo") return null;
    const uses = ammo.system?.uses ?? {};
    return {
        ammo,
        remaining: ammoRemaining({ usesValue: uses.value, usesMax: uses.max, quantity: ammo.quantity }),
        max: uses.max > 1 ? uses.max : null,
    };
}

async function expend(weapon, count, { messageId } = {}) {
    const state = weaponAmmoState(weapon);
    const whisper = ownerIds(weapon.actor);
    if (weapon.system?.ammo?.builtIn) return; // built-in ammo isn't tracked by the system either
    if (!state) {
        if (weapon.system?.ammo?.capacity) {
            await postCard(
                { title: weapon.name, icon: "fa-solid fa-battery-empty", variant: "warn", body: `<p>${L("Volley.NoAmmo")}</p>` },
                { whisper },
            );
        }
        return;
    }
    if (count <= 0) return;
    const short = state.remaining < count;
    const spend = Math.min(count, state.remaining);
    if (spend > 0) await state.ammo.consume(spend);
    const after = weaponAmmoState(weapon)?.remaining ?? 0;
    const body = short
        ? `<p>${L("Volley.Insufficient", { need: count, have: state.remaining })}</p>`
        : `<p>${L("Volley.Expended", { n: spend, left: after })}</p>`;
    await postCard(
        { title: weapon.name, icon: "fa-solid fa-burst", variant: short ? "warn" : "info", body },
        { whisper, flags: { volleyFor: messageId } },
    );
}

async function promptExpend(weapon, count, message, extra = "") {
    const state = weaponAmmoState(weapon);
    const left = state ? state.remaining : "—";
    await postCard(
        {
            title: `${weapon.name}: ${L(areaContext(message)?.type === "auto-fire" ? "Volley.AutoFire" : "Volley.AreaFire")}`,
            icon: "fa-solid fa-burst",
            body: `${extra}<p>${L("Volley.Prompt", { n: count, left })}</p>`,
            buttons: [
                {
                    action: "volley-expend",
                    label: L("Volley.ExpendButton", { n: count }),
                    icon: "fa-solid fa-bolt",
                    gate: "owner",
                    data: { weapon: weapon.uuid, count, message: message.id },
                },
            ],
        },
        { whisper: ownerIds(weapon.actor) },
    );
}

async function handleSpend(weapon, count, message, extra = "") {
    const mode = setting("volleyAmmo");
    if (mode === "off") return;
    if (mode === "auto") return expend(weapon, count, { messageId: message.id });
    return promptExpend(weapon, count, message, extra);
}

/** Tokens inside a region by the system's square-coverage rules, excluding the attacker. */
export function tokensInRegion(region, excludeActor) {
    const scene = region.parent;
    if (!scene) return [];
    return scene.tokens.filter((t) => {
        if (!t.actor || t.hidden) return false;
        if (excludeActor && t.actor.uuid === excludeActor.uuid) return false;
        try {
            return t.testInsideRegion(region);
        } catch (err) {
            warn("testInsideRegion failed", err);
            return false;
        }
    });
}

function targetListHTML(tokens) {
    if (!tokens.length) return `<p><em>${L("Volley.NoTargets")}</em></p>`;
    return `<ul class="sfk-target-list">${tokens.map((t) => `<li>${escapeHTML(t.name)}</li>`).join("")}</ul>`;
}

async function onAreaPlaced(region, message) {
    const ctx = areaContext(message);
    const weapon = await originWeapon(message);
    const attacker = weapon?.actor ?? (await fromUuid(sysFlags(message).origin?.actor ?? ""));
    // Allow core/system to finish computing coverage
    await wait(150);
    const tokens = tokensInRegion(region, attacker);

    if (setting("volleyAutoTarget") && canvas.ready && canvas.scene === region.parent) {
        canvas.tokens.setTargets(
            tokens.map((t) => t.id),
            { mode: "replace" },
        );
    }

    const list = targetListHTML(tokens);
    const buttons = [
        {
            action: "volley-select",
            label: L("Volley.SelectButton"),
            icon: "fa-solid fa-object-group",
            gate: "gm",
            data: { region: region.uuid, attacker: attacker?.uuid ?? "" },
        },
        { action: "volley-clear", label: L("Volley.ClearArea"), icon: "fa-solid fa-eraser", gate: "owner", data: { region: region.uuid } },
    ];

    if (ctx.type === "auto-fire" && weapon) {
        await handleSpend(weapon, autoFireExpend(tokens.length), message);
    }

    await postCard(
        {
            title: L("Volley.Caught", { n: tokens.length }),
            icon: "fa-solid fa-crosshairs",
            body: list,
            buttons,
        },
        { whisper: [...new Set([...gmIds(), game.user.id])] },
    );
}

/* ------------------------------- Clearing areas ------------------------------- */

/** Effect-area regions on a scene spawned from a given chat message (or any area-attack message). */
export function areaRegions({ scene = canvas.scene, messageId = null, actorUuid = null, ownedOnly = true } = {}) {
    if (!scene) return [];
    return scene.regions.filter((r) => {
        const f = sysFlags(r);
        if (!f.messageId || !f.areaShape) return false;
        if (messageId && f.messageId !== messageId) return false;
        if (actorUuid && f.origin?.actor !== actorUuid) return false;
        if (!messageId) {
            const msg = game.messages.get(f.messageId);
            if (msg && !areaContext(msg)) return false; // leave spell templates alone unless asked by message
        }
        return ownedOnly ? r.isOwner : true;
    });
}

/** Delete area-attack regions. With no filters, clears every Area Fire / Auto-Fire area on the current scene you own. */
export async function clearAreas(filters = {}) {
    const regions = areaRegions(filters);
    if (!regions.length) return 0;
    const scene = regions[0].parent;
    await scene.deleteEmbeddedDocuments("Region", regions.map((r) => r.id));
    return regions.length;
}

/** Add a "Clear area" button to the system's Area Fire / Auto-Fire chat card. */
function injectClearButton(message, html) {
    if (!areaContext(message)) return;
    const buttons = html.querySelector(".message-buttons");
    if (!buttons || buttons.querySelector("[data-sfk-clear-area]")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.sfkClearArea = message.id;
    btn.innerHTML = `<i class="fa-solid fa-eraser"></i> ${L("Volley.ClearArea")}`;
    btn.hidden = !areaRegions({ messageId: message.id }).length;
    btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const n = await clearAreas({ messageId: message.id });
        if (!n) ui.notifications.warn(L("Volley.NothingToClear"));
        btn.hidden = true;
    });
    buttons.append(btn);
}

/** Show/hide clear buttons when areas appear or disappear. */
function refreshClearButtons(region) {
    const messageId = sysFlags(region).messageId;
    if (!messageId) return;
    for (const btn of document.querySelectorAll(`[data-sfk-clear-area="${messageId}"]`)) {
        btn.hidden = !areaRegions({ messageId }).length;
    }
}

export function initVolley() {
    Hooks.on("renderChatMessageHTML", (message, html) => injectClearButton(message, html));
    Hooks.on("deleteRegion", (region) => refreshClearButtons(region));

    // Optional: clear a combatant's Area Fire / Auto-Fire areas when their turn ends
    Hooks.on("pf2e.endTurn", async (combatant) => {
        if (!game.users.activeGM?.isSelf || setting("volleyAutoClear") !== "endTurn" || !combatant.actor) return;
        const scene = game.scenes.get(combatant.sceneId) ?? canvas.scene;
        await clearAreas({ scene, actorUuid: combatant.actor.uuid, ownedOnly: false }).catch((err) => warn("Auto-clear failed", err));
    });

    // Record volleys everywhere; spend Area Fire ammo on the author's client
    Hooks.on("createChatMessage", async (message, _opts, userId) => {
        const ctx = areaContext(message);
        if (!ctx) return;
        const origin = sysFlags(message).origin;
        if (origin?.actor) {
            recentVolleys.set(origin.actor, { ts: Date.now(), type: ctx.type, itemUuid: origin.uuid, messageId: message.id });
        }
        if (userId !== game.user.id || ctx.type !== "area-fire") return;
        const weapon = await originWeapon(message);
        if (!weapon) return;
        const n = Number(weapon.system?.expend) || 1;
        await handleSpend(weapon, n, message);
    });

    Hooks.on("createRegion", async (region, _opts, userId) => {
        if (userId !== game.user.id) return;
        const messageId = sysFlags(region).messageId;
        const message = messageId ? game.messages.get(messageId) : null;
        if (!message || !areaContext(message)) return;
        try {
            await onAreaPlaced(region, message);
        } catch (err) {
            warn("Area placement handling failed", err);
        }
    });

    registerCardAction("volley-expend", async (_message, button) => {
        const weapon = await fromUuid(button.dataset.weapon);
        if (!weapon?.isOwner) return ui.notifications.warn(L("Notify.NotOwner"));
        await expend(weapon, Number(button.dataset.count) || 0, { messageId: button.dataset.message });
        button.closest("footer")?.remove();
    });

    registerCardAction("volley-select", async (_message, button) => {
        const region = await fromUuid(button.dataset.region);
        if (!region || region.parent !== canvas.scene) return ui.notifications.warn(L("Volley.RegionGone"));
        const attacker = button.dataset.attacker ? await fromUuid(button.dataset.attacker) : null;
        const tokens = tokensInRegion(region, attacker);
        canvas.tokens.releaseAll();
        for (const t of tokens) t.object?.control({ releaseOthers: false });
        ui.notifications.info(L("Volley.Selected", { n: tokens.length }));
    });

    registerCardAction("volley-clear", async (_message, button) => {
        const region = await fromUuid(button.dataset.region);
        if (!region) return ui.notifications.warn(L("Volley.NothingToClear"));
        if (!region.isOwner) return ui.notifications.warn(L("Notify.NotOwner"));
        await region.delete();
    });
}

