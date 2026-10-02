/**
 * Cinematic Starship Scene state (SF2e GM Core, "Cinematic Starship Scenes").
 *
 * Model: one active scene per world, stored in a world setting. The party's ship and each threat track
 * AC, saves, HP, and Shields with a per-round regeneration value; shields regenerate at the start of each round.
 * PCs pick a role at the start of their turn; the role determines the skill rolled for initiative.
 * Persistent damage resolves at the end of each round, with one flat check (DC 15, or DC 10 after an
 * engineer's Assisted Recovery).
 */
import { PERSISTENT_DC, ASSISTED_RECOVERY_DC } from "../core/constants.mjs";
import { applyShipDamage, regenShields, degreeOfSuccess, mergeIndexed } from "../core/logic.mjs";
import { L, escapeHTML, setting, setSetting } from "../core/foundry.mjs";
import { postCard } from "../core/chat.mjs";

export const SETTING = "starshipScene";

const id = () => foundry.utils.randomID(8);

export const DEFAULT_ROLES = [
    { name: "Captain", skill: "diplomacy" },
    { name: "Engineer", skill: "crafting" },
    { name: "Gunner", skill: "perception" },
    { name: "Magic Officer", skill: "mysticism" },
    { name: "Pilot", skill: "piloting" },
    { name: "Science Officer", skill: "computers" },
];

export function blankCraft(name = "") {
    return {
        id: id(),
        name,
        ac: 15,
        fort: 7,
        ref: 7,
        will: 0,
        hp: { value: 20, max: 20 },
        shields: { value: 5, max: 5, regen: 5 },
        init: { skill: "Piloting", mod: 7 },
        routine: "",
        notes: "",
        persistent: [],
    };
}

export function defaultState() {
    const ship = blankCraft("Party Starship");
    return {
        active: false,
        name: "",
        level: 1,
        round: 0,
        victory: { mode: "hp", vp: 0, vpTarget: 5, roundsTarget: 4, text: "" },
        ship: { ...ship, bonuses: "", roles: DEFAULT_ROLES.map((r) => ({ id: id(), ...r, actorId: "", notes: "" })) },
        threats: [],
    };
}

export function getState() {
    const raw = setting(SETTING);
    return raw && raw.ship ? foundry.utils.deepClone(raw) : defaultState();
}

export async function saveState(state) {
    if (!game.user.isGM) throw new Error("Only a GM can modify the starship scene");
    await setSetting(SETTING, state);
    return state;
}

/** Find the ship or a threat by key ("ship" or threat id). */
export function craftOf(state, key) {
    return key === "ship" ? state.ship : state.threats.find((t) => t.id === key);
}

/** Apply a form submission (expanded object) onto the state. */
export function applyForm(state, data) {
    const next = foundry.utils.deepClone(state);
    for (const k of ["name", "level"]) if (k in data) next[k] = data[k];
    if (data.victory) Object.assign(next.victory, data.victory);
    if (data.ship) {
        const { roles, persistent, ...rest } = data.ship;
        foundry.utils.mergeObject(next.ship, rest);
        if (roles) next.ship.roles = mergeIndexed(next.ship.roles, roles);
        if (persistent) next.ship.persistent = mergeIndexed(next.ship.persistent, persistent);
    }
    if (data.threats) {
        next.threats = next.threats.map((t, i) => {
            const patch = data.threats[i] ?? data.threats[String(i)];
            if (!patch) return t;
            const { persistent, ...rest } = patch;
            const out = foundry.utils.mergeObject(foundry.utils.deepClone(t), rest);
            if (persistent) out.persistent = mergeIndexed(t.persistent, persistent);
            return out;
        });
    }
    return next;
}

/* --------------------------------- Operations --------------------------------- */

export async function damage(key, amount) {
    const state = getState();
    const craft = craftOf(state, key);
    if (!craft) return;
    const r = applyShipDamage(craft, amount);
    craft.hp = r.hp;
    craft.shields = r.shields;
    await saveState(state);
    const healed = r.toHP < 0;
    await postCard({
        title: craft.name,
        icon: healed ? "fa-solid fa-screwdriver-wrench" : "fa-solid fa-explosion",
        variant: "ship",
        body: healed
            ? `<p>${L("Ship.Repaired", { n: -r.toHP, hp: craft.hp.value, max: craft.hp.max })}</p>`
            : `<p>${L("Ship.Hit", { s: r.toShields, h: r.toHP, sh: craft.shields.value, hp: craft.hp.value, max: craft.hp.max })}</p>${
                  craft.hp.value === 0 ? `<p class="sfk-emph">${L(key === "ship" ? "Ship.Disabled" : "Ship.ThreatDown")}</p>` : ""
              }`,
    });
}

async function resolvePersistent(craft) {
    const lines = [];
    const keep = [];
    for (const p of craft.persistent) {
        let total = 0;
        try {
            const roll = await new Roll(p.formula || "0").evaluate();
            total = roll.total;
        } catch {
            lines.push(`<li>${escapeHTML(p.formula)}: ${L("Ship.BadFormula")}</li>`);
            keep.push(p);
            continue;
        }
        const r = applyShipDamage(craft, total);
        craft.hp = r.hp;
        craft.shields = r.shields;
        const dc = p.assisted ? ASSISTED_RECOVERY_DC : PERSISTENT_DC;
        const flat = await new Roll("1d20").evaluate();
        const recovered = degreeOfSuccess(flat.total, dc, flat.total) >= 2;
        lines.push(
            `<li>${escapeHTML(p.formula)} ${escapeHTML(p.type ?? "")}: <b>${total}</b> — ${L("Ship.FlatCheck", {
                roll: flat.total,
                dc,
            })} ${recovered ? L("Ship.Recovered") : L("Ship.Continues")}</li>`,
        );
        if (!recovered) keep.push({ ...p, assisted: false });
    }
    craft.persistent = keep;
    return lines;
}

/** End the current round (persistent damage), then begin the next one (shield regeneration). */
export async function nextRound() {
    const state = getState();
    const parts = [];
    if (state.round > 0) {
        for (const craft of [state.ship, ...state.threats]) {
            if (!craft.persistent.length) continue;
            const lines = await resolvePersistent(craft);
            parts.push(`<p><b>${escapeHTML(craft.name)}</b></p><ul>${lines.join("")}</ul>`);
        }
    }
    state.round += 1;
    for (const craft of [state.ship, ...state.threats]) craft.shields.value = regenShields(craft.shields);
    await saveState(state);

    const vp = state.victory.mode === "vp" ? `<p>${L("Ship.VPStatus", { vp: state.victory.vp, target: state.victory.vpTarget })}</p>` : "";
    const rounds =
        state.victory.mode === "rounds" ? `<p>${L("Ship.RoundsStatus", { r: state.round, target: state.victory.roundsTarget })}</p>` : "";
    await postCard({
        title: L("Ship.RoundStart", { r: state.round }),
        icon: "fa-solid fa-shuttle-space",
        variant: "ship",
        body: `${parts.join("")}<p>${L("Ship.ShieldsUp", {
            ship: escapeHTML(state.ship.name),
            sh: state.ship.shields.value,
        })}</p>${vp}${rounds}<p class="sfk-hint">${L("Ship.PickRoles")}</p>`,
    });
}

/** Roll initiative for every crewed role using the role's skill, writing into the active encounter. */
export async function rollRoleInitiative() {
    const state = getState();
    const combat = game.combat;
    const results = [];
    for (const role of state.ship.roles) {
        const actor = game.actors.get(role.actorId);
        if (!actor) continue;
        const stat = actor.getStatistic?.(role.skill);
        if (!stat) {
            results.push(`<li>${escapeHTML(actor.name)}: ${L("Ship.NoSkill", { skill: role.skill })}</li>`);
            continue;
        }
        const roll = await stat.roll({ skipDialog: true, extraRollOptions: ["starship-scene", `starship-role:${role.name.slugify()}`] });
        if (!roll) continue;
        const combatant = combat?.combatants.find((c) => c.actorId === actor.id);
        if (combatant) await combat.setInitiative(combatant.id, roll.total);
        results.push(`<li>${escapeHTML(actor.name)} — ${escapeHTML(role.name)} (${escapeHTML(stat.label)}): <b>${roll.total}</b></li>`);
    }
    if (results.length) {
        await postCard({ title: L("Ship.Initiative"), icon: "fa-solid fa-list-ol", variant: "ship", body: `<ul>${results.join("")}</ul>` });
    } else {
        ui.notifications.warn(L("Ship.NoCrew"));
    }
}

/** Role check against a DC from the scene stat block. */
export async function roleCheck(roleId, dc) {
    const state = getState();
    const role = state.ship.roles.find((r) => r.id === roleId);
    const actor = game.actors.get(role?.actorId ?? "");
    if (!actor) return ui.notifications.warn(L("Ship.NoCrew"));
    const stat = actor.getStatistic?.(role.skill);
    if (!stat) return ui.notifications.warn(L("Ship.NoSkill", { skill: role.skill }));
    return stat.roll({
        dc: dc ? { value: Number(dc) } : null,
        label: `${role.name}: ${stat.label}`,
        extraRollOptions: ["starship-scene", `starship-role:${role.name.slugify()}`],
    });
}

export async function mutate(fn) {
    const state = getState();
    await fn(state);
    return saveState(state);
}

export const ops = {
    addThreat: () => mutate((s) => void s.threats.push(blankCraft(L("Ship.NewThreat")))),
    removeThreat: (tid) => mutate((s) => void (s.threats = s.threats.filter((t) => t.id !== tid))),
    addRole: () => mutate((s) => void s.ship.roles.push({ id: id(), name: L("Ship.NewRole"), skill: "perception", actorId: "", notes: "" })),
    removeRole: (rid) => mutate((s) => void (s.ship.roles = s.ship.roles.filter((r) => r.id !== rid))),
    addPersistent: (key) =>
        mutate((s) => void craftOf(s, key)?.persistent.push({ id: id(), formula: "1d6", type: "fire", assisted: false })),
    removePersistent: (key, pid) =>
        mutate((s) => {
            const c = craftOf(s, key);
            if (c) c.persistent = c.persistent.filter((p) => p.id !== pid);
        }),
    adjustVP: (delta) => mutate((s) => void (s.victory.vp = Math.max(0, s.victory.vp + delta))),
    setActive: (active) => mutate((s) => void (s.active = active)),
    reset: () => saveState(defaultState()),
};

