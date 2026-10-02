/**
 * Turn-boundary automation for SF2e conditions.
 *  - Glitching: start-of-turn flat check (DC 5 + value) with full degree-of-success handling.
 *  - Untethered: end-of-turn drift of 5 feet in the last direction moved.
 */
import { MODULE_ID } from "../core/constants.mjs";
import { degreeOfSuccess, DEGREES, glitchingDC, moveDirection } from "../core/logic.mjs";
import { L, isPrimaryGM, ownerIds, gmIds, setting, warn } from "../core/foundry.mjs";
import { postCard, registerCardAction } from "../core/chat.mjs";

/* ---------------------------------- Glitching --------------------------------- */

export async function rollGlitching(actor) {
    const condition = actor?.getCondition?.("glitching");
    if (!condition) return null;
    const value = Number(condition.value) || 1;
    const dc = glitchingDC(value);
    const roll = await new Roll("1d20").evaluate();
    const natural = roll.dice[0]?.total ?? roll.total;
    const degree = degreeOfSuccess(roll.total, dc, natural);
    const outcome = DEGREES[degree];

    const setFailure = (on) => actor.toggleRollOption("all", "glitching-failure", condition.id, on);
    let effect;
    switch (outcome) {
        case "criticalSuccess":
            await setFailure(false);
            await actor.decreaseCondition("glitching");
            effect = L("Glitch.CritSuccess");
            break;
        case "success":
            await setFailure(false);
            effect = L("Glitch.Success");
            break;
        case "failure":
            await setFailure(true);
            effect = L("Glitch.Failure", { value });
            break;
        default:
            await setFailure(true);
            if (!actor.hasCondition("stunned")) await actor.increaseCondition("stunned");
            effect = L("Glitch.CritFailure", { value });
    }

    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<div class="sfk-card sfk-alert"><header class="sfk-card-header"><i class="fa-solid fa-microchip"></i><span>${L(
            "Glitch.Title",
            { dc },
        )}</span></header><div class="sfk-card-body"><p class="sfk-degree sfk-${outcome}">${L(
            `Degree.${outcome}`,
        )}</p><p>${effect}</p></div></div>`,
        flags: { [MODULE_ID]: { glitching: outcome } },
    });
    return outcome;
}

async function onStartTurnGlitching(combatant) {
    const actor = combatant.actor;
    if (!actor?.hasCondition?.("glitching")) return;
    const mode = setting("glitchingAuto");
    if (mode === "off") return;
    if (mode === "auto") return rollGlitching(actor);
    await postCard(
        {
            title: L("Glitch.PromptTitle", { name: actor.name }),
            icon: "fa-solid fa-microchip",
            variant: "alert",
            body: `<p>${L("Glitch.PromptBody", { dc: glitchingDC(actor.getCondition("glitching")?.value) })}</p>`,
            buttons: [{ action: "glitch-roll", label: L("Glitch.RollButton"), icon: "fa-solid fa-dice-d20", data: { actor: actor.uuid } }],
        },
        { whisper: [...new Set([...ownerIds(actor), ...gmIds()])] },
    );
}

/* ---------------------------------- Untethered -------------------------------- */

/** Record movement direction on the token itself so any client can read it later. */
function trackMovement(token, changes) {
    if (!("x" in changes) && !("y" in changes)) return;
    const dx = (changes.x ?? token.x) - token.x;
    const dy = (changes.y ?? token.y) - token.y;
    if (!dx && !dy) return;
    const dir = moveDirection(dx, dy);
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.lastMove`, dir);
}

async function drift(tokenDoc) {
    const dir = tokenDoc.flags?.[MODULE_ID]?.lastMove;
    if (!dir || (!dir.x && !dir.y)) return ui.notifications.warn(L("Drift.NoDirection"));
    const size = tokenDoc.parent?.grid?.size ?? canvas.grid.size;
    // 5 feet = one square on a standard 5-ft grid
    const squares = Math.max(1, Math.round(5 / (tokenDoc.parent?.grid?.distance || 5)));
    await tokenDoc.update(
        { x: tokenDoc.x + dir.x * size * squares, y: tokenDoc.y + dir.y * size * squares },
        { [MODULE_ID]: { drift: true } },
    );
}

async function onEndTurnUntethered(combatant) {
    if (setting("untetheredDrift") === "off") return;
    const tokenDoc = combatant.token;
    const actor = combatant.actor;
    if (!tokenDoc || !actor?.hasCondition?.("untethered")) return;
    await postCard(
        {
            title: L("Drift.Title", { name: tokenDoc.name }),
            icon: "fa-solid fa-user-astronaut",
            body: `<p>${L("Drift.Body")}</p>`,
            buttons: [{ action: "drift", label: L("Drift.Button"), icon: "fa-solid fa-arrows-up-down-left-right", gate: "gm", data: { token: tokenDoc.uuid } }],
        },
        { whisper: gmIds() },
    );
}

export function initConditions() {
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isPrimaryGM()) return;
        onStartTurnGlitching(combatant).catch((err) => warn("Glitching failed", err));
    });
    Hooks.on("pf2e.endTurn", (combatant) => {
        if (!isPrimaryGM()) return;
        onEndTurnUntethered(combatant).catch((err) => warn("Untethered failed", err));
    });
    Hooks.on("preUpdateToken", (token, changes, options) => {
        if (options?.[MODULE_ID]?.drift) return; // drifting doesn't change "last direction moved"
        trackMovement(token, changes);
    });

    registerCardAction("glitch-roll", async (_m, button) => {
        const actor = await fromUuid(button.dataset.actor);
        if (!actor?.isOwner) return ui.notifications.warn(L("Notify.NotOwner"));
        await rollGlitching(actor);
        button.closest("footer")?.remove();
    });
    registerCardAction("drift", async (_m, button) => {
        const token = await fromUuid(button.dataset.token);
        if (token) await drift(token);
    });
}
