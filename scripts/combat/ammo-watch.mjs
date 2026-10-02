/**
 * Low-ammo / dead-battery alerts. Watches every weapon with tracked ammunition on the updating client and warns
 * owners once when the loaded supply crosses the configured threshold or runs dry.
 */
import { crossedLowAmmo } from "../core/logic.mjs";
import { L, escapeHTML, keyedDebounce, ownerIds, playSound, setting } from "../core/foundry.mjs";
import { postCard } from "../core/chat.mjs";
import { weaponAmmoState } from "./volley.mjs";

const lastSeen = new Map(); // weapon uuid -> remaining

function snapshot(actor) {
    for (const weapon of actor?.itemTypes?.weapon ?? []) {
        const s = weaponAmmoState(weapon);
        if (s) lastSeen.set(weapon.uuid, s.remaining);
    }
}

async function check(actorUuid) {
    const actor = fromUuidSync(actorUuid);
    if (!actor) return;
    const pct = Number(setting("ammoWarnPct")) || 0;
    for (const weapon of actor.itemTypes?.weapon ?? []) {
        const s = weaponAmmoState(weapon);
        if (!s) continue;
        const prev = lastSeen.get(weapon.uuid);
        lastSeen.set(weapon.uuid, s.remaining);
        if (prev === undefined || !crossedLowAmmo(prev, s.remaining, s.max, pct)) continue;
        const empty = s.remaining === 0;
        await postCard(
            {
                title: weapon.name,
                icon: empty ? "fa-solid fa-battery-empty" : "fa-solid fa-battery-quarter",
                variant: empty ? "alert" : "warn",
                body: `<p>${empty ? L("Ammo.Empty", { ammo: escapeHTML(s.ammo.name) }) : L("Ammo.Low", { ammo: escapeHTML(s.ammo.name), n: s.remaining, max: s.max })}</p>`,
            },
            { whisper: ownerIds(actor) },
        );
        playSound(setting("ammoWarnSound"));
    }
}

const debounced = keyedDebounce(check, 250);

export function initAmmoWatch() {
    Hooks.once("ready", () => {
        for (const actor of game.actors.filter((a) => a.isOwner && a.type === "character")) snapshot(actor);
    });
    const onItem = (item, _c, _o, userId) => {
        if (userId !== game.user.id || !item.actor) return;
        if (!["weapon", "ammo"].includes(item.type)) return;
        // First sighting of an actor this session: seed the cache before the change is evaluated
        if (![...lastSeen.keys()].some((k) => k.startsWith(item.actor.uuid))) snapshot(item.actor);
        debounced(item.actor.uuid, item.actor.uuid);
    };
    Hooks.on("updateItem", onItem);
    Hooks.on("deleteItem", (item, o, userId) => onItem(item, null, o, userId));
}
