/**
 * Solarian stellar attunement presentation.
 * Reads the system's `stellar-attunement:<state>` roll option and, on change, re-lights the solarian's tokens
 * (photon = stellar flare glow, graviton = deep violet gravity well) and posts a short flourish card.
 * Original token lighting is stored and restored when the solarian becomes unattuned.
 */
import { MODULE_ID } from "../core/constants.mjs";
import { parseAttunement } from "../core/logic.mjs";
import { L, escapeHTML, isPrimaryGM, keyedDebounce, setting, warn } from "../core/foundry.mjs";
import { postCard } from "../core/chat.mjs";

const LIGHTS = {
    photon: { dim: 15, bright: 5, color: "#ff8a2a", alpha: 0.45, animation: { type: "torch", speed: 3, intensity: 4 } },
    graviton: { dim: 10, bright: 0, color: "#7a3cff", alpha: 0.55, animation: { type: "vortex", speed: 2, intensity: 5 } },
};

export function getAttunement(actor) {
    if (!actor?.items?.some((i) => i.slug === "stellar-attunement")) return null;
    try {
        return parseAttunement(actor.getRollOptions(["all"]));
    } catch {
        return null;
    }
}

async function relight(actor, state) {
    for (const token of actor.getActiveTokens(true, true)) {
        const stored = token.flags?.[MODULE_ID]?.baseLight;
        if (state === "photon" || state === "graviton") {
            const update = { light: LIGHTS[state] };
            if (!stored) update[`flags.${MODULE_ID}.baseLight`] = token.light.toObject?.() ?? foundry.utils.deepClone(token._source.light);
            await token.update(update);
        } else if (stored) {
            await token.update({ light: stored });
            await token.unsetFlag(MODULE_ID, "baseLight");
        }
    }
}

async function evaluate(actorUuid) {
    const actor = fromUuidSync(actorUuid);
    if (!actor) return;
    const state = getAttunement(actor);
    if (!state) return;
    const prev = actor.flags?.[MODULE_ID]?.attunement ?? null;
    if (prev === state) return;
    await actor.setFlag(MODULE_ID, "attunement", state);
    if (prev === null) return; // first observation: record silently
    if (setting("attunementLight")) await relight(actor, state);
    if (setting("attunementChat")) {
        await postCard(
            {
                title: L(`Attune.${state}.Title`),
                icon: state === "photon" ? "fa-solid fa-sun" : state === "graviton" ? "fa-solid fa-circle-half-stroke" : "fa-regular fa-circle",
                variant: `attune-${state}`,
                body: `<p>${L(`Attune.${state}.Body`, { name: escapeHTML(actor.name) })}</p>`,
            },
            { speaker: ChatMessage.getSpeaker({ actor }) },
        );
    }
}

const debounced = keyedDebounce((uuid) => evaluate(uuid).catch((e) => warn("Attunement failed", e)), 200);

export function initAttunement() {
    const queue = (actor) => {
        if (!isPrimaryGM() || actor?.type !== "character") return;
        debounced(actor.uuid);
    };
    Hooks.on("updateItem", (item) => queue(item.actor));
    Hooks.on("createItem", (item) => queue(item.actor));
    Hooks.on("deleteItem", (item) => queue(item.actor));
    Hooks.on("updateActor", (actor, changes) => {
        // ignore our own flag write
        if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.attunement`)) return;
        queue(actor);
    });
    Hooks.once("ready", () => {
        if (!isPrimaryGM()) return;
        for (const a of game.actors.filter((x) => x.type === "character")) debounced(a.uuid);
    });
}
