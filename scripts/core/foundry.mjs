import { MODULE_ID, SYSTEM_ID } from "./constants.mjs";

/** Localize a module key (prefix-free) with optional format data. */
export function L(key, data) {
    const full = `SFK.${key}`;
    return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function setting(key) {
    return game.settings.get(MODULE_ID, key);
}

export function setSetting(key, value) {
    return game.settings.set(MODULE_ID, key, value);
}

/** True on exactly one connected client: the active GM. */
export function isPrimaryGM() {
    return !!game.users.activeGM?.isSelf;
}

export function log(...args) {
    console.log(`%cSFK%c |`, "color:#3ad0ff;font-weight:bold", "color:inherit", ...args);
}

export function warn(...args) {
    console.warn("SFK |", ...args);
}

export function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = String(text ?? "");
    return div.innerHTML;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** sf2e system flags on a document. */
export function sysFlags(doc) {
    return doc?.flags?.[SYSTEM_ID] ?? {};
}

/** Resolve an actor from an actor UUID or a token UUID. */
export async function resolveActor(uuid) {
    if (!uuid) return null;
    const doc = await fromUuid(uuid);
    if (!doc) return null;
    if (doc instanceof Actor) return doc;
    return doc.actor ?? null;
}

/** Users who own an actor (non-GM players first), for whispers. */
export function ownerIds(actor) {
    return game.users.filter((u) => actor?.testUserPermission(u, "OWNER")).map((u) => u.id);
}

export function gmIds() {
    return game.users.filter((u) => u.isGM).map((u) => u.id);
}

export function playSound(src, volume = 0.6) {
    if (!src) return;
    try {
        foundry.audio.AudioHelper.play({ src, volume, autoplay: true, loop: false }, false);
    } catch (err) {
        warn("Sound failed", src, err);
    }
}

/** Debounce keyed calls (e.g., per actor). */
export function keyedDebounce(fn, ms) {
    const timers = new Map();
    return (key, ...args) => {
        clearTimeout(timers.get(key));
        timers.set(
            key,
            setTimeout(() => {
                timers.delete(key);
                fn(key, ...args);
            }, ms),
        );
    };
}

/** Player-character actors: party members if a party exists, else all character actors with a player owner. */
export function partyCharacters() {
    const party = game.actors.party;
    const members = party?.members?.filter((a) => a.type === "character") ?? [];
    if (members.length) return members;
    return game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner);
}
