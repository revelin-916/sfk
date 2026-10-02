/**
 * Pure rules/math helpers. No Foundry globals: unit-tested under Node (see tests/).
 */

export const DEGREES = ["criticalFailure", "failure", "success", "criticalSuccess"];

/** PF2e/SF2e degree of success from a check total, DC, and the natural d20 result. Returns 0..3. */
export function degreeOfSuccess(total, dc, natural = null) {
    const diff = total - dc;
    let degree = diff >= 10 ? 3 : diff >= 0 ? 2 : diff <= -10 ? 0 : 1;
    if (natural === 20) degree = Math.min(3, degree + 1);
    else if (natural === 1) degree = Math.max(0, degree - 1);
    return degree;
}

/** Glitching start-of-turn flat check DC = 5 + condition value. */
export function glitchingDC(value) {
    return 5 + Math.max(0, Number(value) || 0);
}

/** Auto-Fire expends 2 rounds per target in the cone. */
export function autoFireExpend(targetCount) {
    return Math.max(0, Math.trunc(targetCount)) * 2;
}

/**
 * Remaining shots in a loaded ammo item.
 * Magazines/batteries (uses.max > 1) count uses on the loaded unit; loose ammo counts quantity.
 */
export function ammoRemaining({ usesValue = 0, usesMax = 1, quantity = 0 } = {}) {
    if (usesMax > 1) return Math.max(0, usesValue);
    return Math.max(0, quantity);
}

/** True when `next` drops to/below pct% of max while `prev` was above it, or when ammo just hit zero. */
export function crossedLowAmmo(prev, next, max, pct) {
    if (next === prev || next > prev) return false;
    if (next === 0) return true;
    if (!max || max <= 1) return false;
    const line = Math.floor((max * pct) / 100);
    return prev > line && next <= line;
}

/** Starship/threat shields regenerate by `regen` at the start of each round, up to max. */
export function regenShields({ value = 0, max = 0, regen = 0 } = {}) {
    return Math.min(Math.max(0, max), Math.max(0, value) + Math.max(0, regen));
}

/**
 * Apply damage to a starship-scene combatant: shields absorb first (they behave like temporary HP), then HP.
 * Negative damage heals HP (never shields). Returns the new values and the breakdown.
 */
export function applyShipDamage({ hp, shields }, amount) {
    const dmg = Math.trunc(Number(amount) || 0);
    if (dmg < 0) {
        const value = Math.min(hp.max, hp.value - dmg);
        return { hp: { ...hp, value }, shields: { ...shields }, toShields: 0, toHP: dmg };
    }
    const toShields = Math.min(Math.max(0, shields.value), dmg);
    const toHP = dmg - toShields;
    return {
        hp: { ...hp, value: Math.max(0, hp.value - toHP) },
        shields: { ...shields, value: shields.value - toShields },
        toShields,
        toHP,
    };
}

/** Read the Solarian stellar attunement from an actor's roll options. */
export function parseAttunement(rollOptions) {
    const opts = Array.isArray(rollOptions) ? rollOptions : [...(rollOptions ?? [])];
    for (const state of ["photon", "graviton", "unattuned"]) {
        if (opts.includes(`stellar-attunement:${state}`)) return state;
    }
    return null;
}

/** Split credits evenly. Returns per-recipient share and the undistributed remainder. */
export function splitCredits(total, count) {
    const t = Math.max(0, Math.trunc(Number(total) || 0));
    const n = Math.max(0, Math.trunc(count));
    if (n === 0) return { share: 0, remainder: t };
    return { share: Math.floor(t / n), remainder: t % n };
}

/** Faction standing label for a reputation value using ascending [{min, label}] tiers. */
export function factionTier(value, tiers) {
    const sorted = [...tiers].sort((a, b) => a.min - b.min);
    let label = sorted[0]?.label ?? "";
    for (const tier of sorted) if (value >= tier.min) label = tier.label;
    return label;
}

/** Unit direction (-1/0/1 per axis) from a movement delta. */
export function moveDirection(dx, dy) {
    return { x: Math.sign(dx), y: Math.sign(dy) };
}

/**
 * Merge a form-expanded indexed object ({0: {...}, 1: {...}}) back into an array, preserving unknown fields.
 */
export function mergeIndexed(existing, patch) {
    if (!patch || typeof patch !== "object") return existing;
    return existing.map((entry, i) => {
        const p = patch[i] ?? patch[String(i)];
        if (!p) return entry;
        const out = { ...entry };
        for (const [k, v] of Object.entries(p)) {
            out[k] = v && typeof v === "object" && !Array.isArray(v) && entry[k] && typeof entry[k] === "object"
                ? { ...entry[k], ...v }
                : v;
        }
        return out;
    });
}

/** Next scheduled tick (seconds) at or after `now` for an interval in hours, anchored at `last`. */
export function nextTick(last, intervalHours) {
    const step = Math.max(1, Number(intervalHours) || 1) * 3600;
    return (Number(last) || 0) + step;
}

/** Parse "/comm Sender | text", "/ai Name | text", "/alert text". Returns null when not a comms command. */
export function parseCommsCommand(text) {
    const m = String(text ?? "").match(/^\/(comm|ai|alert)\s+([\s\S]+)$/i);
    if (!m) return null;
    const channel = m[1].toLowerCase();
    const body = m[2];
    if (channel === "alert") return { channel, from: "", text: body.trim() };
    const [from, ...rest] = body.split("|");
    return rest.length ? { channel, from: from.trim(), text: rest.join("|").trim() } : { channel, from: "", text: body.trim() };
}
