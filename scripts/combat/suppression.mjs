/**
 * Soldier — Suppressing Fire automation.
 * "Enemies in the affected area who fail their save against your attack become suppressed until the start of your
 * next turn." The system ships this as a roll Note only; we apply and expire the condition.
 */
import { MODULE_ID } from "../core/constants.mjs";
import { isPrimaryGM, resolveActor, setting, sysFlags, warn, L, escapeHTML } from "../core/foundry.mjs";
import { postCard } from "../core/chat.mjs";
import { getRecentVolley } from "./volley.mjs";

const FAILURES = new Set(["failure", "criticalFailure"]);

function hasSuppressingFire(actor) {
    return actor?.items?.some((i) => i.slug === "suppressing-fire") ?? false;
}

function areEnemies(a, b) {
    if (!a || !b) return false;
    const x = a.alliance ?? null;
    const y = b.alliance ?? null;
    if (x === null || y === null) return x !== y;
    return x !== y;
}

async function applySuppressed(target, attacker) {
    const existing = target.itemTypes.condition.find((c) => c.slug === "suppressed");
    if (existing) {
        await existing.update({ [`flags.${MODULE_ID}.suppressedBy`]: attacker.uuid });
        return false;
    }
    const source = game.pf2e.ConditionManager.getCondition("suppressed")?.toObject();
    if (!source) return warn("Suppressed condition not found in system");
    source.flags = foundry.utils.mergeObject(source.flags ?? {}, { [MODULE_ID]: { suppressedBy: attacker.uuid } });
    await target.createEmbeddedDocuments("Item", [source]);
    return true;
}

async function onSaveMessage(message) {
    const ctx = sysFlags(message).context;
    if (ctx?.type !== "saving-throw" || !FAILURES.has(ctx.outcome)) return;
    if (ctx.domains && !ctx.domains.includes("reflex")) return;
    const attackerUuid = ctx.origin?.actor;
    if (!attackerUuid || !getRecentVolley(attackerUuid)) return;

    const attacker = await resolveActor(attackerUuid);
    if (!hasSuppressingFire(attacker)) return;
    const target = await resolveActor(ctx.token ?? ctx.actor);
    if (!target || !areEnemies(attacker, target)) return;

    const created = await applySuppressed(target, attacker);
    if (created) {
        await postCard(
            {
                title: L("Suppress.Title"),
                icon: "fa-solid fa-person-rifle",
                variant: "alert",
                body: `<p>${L("Suppress.Body", { target: escapeHTML(target.name), attacker: escapeHTML(attacker.name) })}</p>`,
            },
            { speaker: ChatMessage.getSpeaker({ actor: attacker }) },
        );
    }
}

/** Remove suppression an attacker caused when their next turn starts. */
async function expireFor(combatant) {
    const attacker = combatant.actor;
    if (!attacker) return;
    const scene = game.scenes.get(combatant.sceneId) ?? canvas.scene;
    const actors = new Set((scene?.tokens ?? []).map((t) => t.actor).filter(Boolean));
    for (const actor of actors) {
        const ids = actor.itemTypes.condition
            .filter((c) => c.slug === "suppressed" && c.flags?.[MODULE_ID]?.suppressedBy === attacker.uuid)
            .map((c) => c.id);
        if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
    }
}

export function initSuppression() {
    Hooks.on("createChatMessage", (message) => {
        if (!isPrimaryGM() || !setting("suppressionAuto")) return;
        onSaveMessage(message).catch((err) => warn("Suppression failed", err));
    });
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isPrimaryGM() || !setting("suppressionAuto")) return;
        expireFor(combatant).catch((err) => warn("Suppression expiry failed", err));
    });
}

