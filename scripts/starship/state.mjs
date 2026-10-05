/**
 * Cinematic Starship Scene state (SF2e GM Core, "Cinematic Starship Scenes").
 *
 * Model: one active scene per world, stored in a world setting. The party's ship and each threat track
 * AC, saves, HP, and Shields with a per-round regeneration value; shields regenerate at the start of each round.
 * PCs pick a role at the start of their turn; the role determines the skill rolled for initiative.
 * Persistent damage resolves at the end of each round, with one flat check (DC 15, or DC 10 after an
 * engineer's Assisted Recovery).
 *
 * Structured data (optional, usually supplied by presets):
 *   craft.actions[]  { id, name, role: string|string[], cost, text, checks: [{skill, dc}],
 *                      outcomes: { criticalSuccess|success|failure|criticalFailure: Effects } }
 *   craft.weapons[]  { id, name, role, damage, damageType, traits, attack? (threat weapons: attack modifier) }
 *   threat.steps[]   { id, name, kind: "check"|"strike"|"basicSave", ... } — see engine.mjs
 *   Effects          { vp, heal, clearPersistent, setFlag, note }
 */
import { PERSISTENT_DC, ASSISTED_RECOVERY_DC } from "../core/constants.mjs";
import { applyShipDamage, regenShields, degreeOfSuccess, mergeIndexed, victoryReached } from "../core/logic.mjs";
import { L, escapeHTML, setting, setSetting, warn } from "../core/foundry.mjs";
import { postCard } from "../core/chat.mjs";

export const SETTING = "starshipScene";
export const SCHEMA_VERSION = 2;

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
        actions: [],
        weapons: [],
        steps: [],
        flags: {},
        offGuard: false,
    };
}

export function defaultState() {
    const ship = blankCraft("Party Starship");
    return {
        schema: SCHEMA_VERSION,
        active: false,
        name: "",
        level: 1,
        round: 0,
        source: "",
        presetId: "",
        victory: { mode: "hp", vp: 0, vpTarget: 5, vpLabel: "", roundsTarget: 4, text: "" },
        sceneMod: { label: "", value: 0, type: "circumstance" },
        objectives: "",
        rewards: "",
        ship: { ...ship, bonuses: "", npcCrew: null, roles: DEFAULT_ROLES.map((r) => ({ id: id(), ...r, actorId: "", notes: "" })) },
        threats: [],
    };
}

/** Fill any missing fields (older saves, partial presets, imported JSON) and give every list entry an id. */
export function normalize(raw) {
    const base = defaultState();
    const s = foundry.utils.mergeObject(base, raw ?? {}, { inplace: false, insertKeys: true, insertValues: true });
    const fixCraft = (c, fallbackName) => {
        const merged = foundry.utils.mergeObject(blankCraft(fallbackName), c ?? {}, { inplace: false });
        merged.id ||= id();
        for (const list of ["persistent", "actions", "weapons", "steps"]) {
            merged[list] = (Array.isArray(merged[list]) ? merged[list] : []).map((e) => ({ ...e, id: e.id || id() }));
        }
        merged.flags ??= {};
        return merged;
    };
    s.ship = { ...fixCraft(s.ship, "Party Starship"), bonuses: s.ship?.bonuses ?? "", npcCrew: s.ship?.npcCrew ?? null };
    s.ship.roles = (Array.isArray(raw?.ship?.roles) ? raw.ship.roles : s.ship.roles ?? []).map((r) => ({
        actorId: "",
        notes: "",
        skill: "perception",
        ...r,
        id: r.id || id(),
    }));
    s.threats = (Array.isArray(raw?.threats) ? raw.threats : []).map((t) => fixCraft(t, "Threat"));
    s.schema = SCHEMA_VERSION;
    return s;
}

export function getState() {
    const raw = setting(SETTING);
    return raw && raw.ship ? normalize(foundry.utils.deepClone(raw)) : defaultState();
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

export function vpLabel(state) {
    return state.victory.vpLabel || L("Ship.VictoryVP");
}

/** Apply a form submission (expanded object) onto the state. */
export function applyForm(state, data) {
    const next = foundry.utils.deepClone(state);
    for (const k of ["name", "level", "objectives", "rewards"]) if (k in data) next[k] = data[k];
    if (data.victory) Object.assign(next.victory, data.victory);
    if (data.sceneMod) Object.assign(next.sceneMod, data.sceneMod);
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

/** Damage (positive) or repair (negative) a craft inside an already-loaded state. Returns a summary line. */
export function damageInState(state, key, amount) {
    const craft = craftOf(state, key);
    if (!craft) return "";
    const r = applyShipDamage(craft, amount);
    craft.hp = r.hp;
    craft.shields = r.shields;
    if (r.toHP < 0) return L("Ship.Repaired", { n: -r.toHP, hp: craft.hp.value, max: craft.hp.max });
    let line = L("Ship.Hit", { s: r.toShields, h: r.toHP, sh: craft.shields.value, hp: craft.hp.value, max: craft.hp.max });
    if (craft.hp.max > 0 && craft.hp.value === 0) line += ` <b>${L(key === "ship" ? "Ship.Disabled" : "Ship.ThreatDown")}</b>`;
    return line;
}

export async function damage(key, amount) {
    const state = getState();
    const craft = craftOf(state, key);
    if (!craft) return;
    const line = damageInState(state, key, amount);
    await saveState(state);
    await postCard({
        title: craft.name,
        icon: amount < 0 ? "fa-solid fa-screwdriver-wrench" : "fa-solid fa-explosion",
        variant: "ship",
        body: `<p>${line}</p>`,
    });
    await announceVictory(state);
}

/** Post a card when the scene's victory condition is newly met. */
export async function announceVictory(state) {
    const reason = victoryReached(state);
    if (!reason || state.victory.announced === reason) return;
    state.victory.announced = reason;
    await saveState(state);
    await postCard({
        title: L("Ship.VictoryTitle"),
        icon: "fa-solid fa-flag-checkered",
        variant: "econ",
        body: `<p>${L(`Ship.VictoryReason.${reason}`, { label: escapeHTML(vpLabel(state)) })}</p>${
            state.rewards ? `<p class="sfk-hint">${escapeHTML(state.rewards)}</p>` : ""
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

/** End the current round (persistent damage), then begin the next one (shield regeneration, clear off-guard). */
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
    for (const craft of [state.ship, ...state.threats]) {
        craft.shields.value = regenShields(craft.shields);
        craft.offGuard = false; // "until the end of the round" effects lapse
    }
    await saveState(state);

    const vp =
        state.victory.mode === "vp" || state.victory.mode === "hpOrVp"
            ? `<p>${escapeHTML(vpLabel(state))}: ${state.victory.vp} / ${state.victory.vpTarget}</p>`
            : "";
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
    await announceVictory(state);
}

/** Modifiers applied to every crew check (scene-wide setup bonus/penalty). */
export function sceneModifiers(state) {
    const m = state.sceneMod;
    if (!m?.value) return [];
    try {
        return [new game.pf2e.Modifier({ slug: "sfk-scene", label: m.label || L("Ship.SceneMod"), modifier: Number(m.value), type: m.type || "circumstance" })];
    } catch (err) {
        warn("Scene modifier failed", err);
        return [];
    }
}

export const NPC_CREW = "npc";

/** Roll for the ship's NPC crew member (e.g., a ship VI with a flat skill modifier). */
export async function rollNPC(state, label, dc = null) {
    const npc = state.ship.npcCrew;
    const mod = (Number(npc?.mod) || 0) + (Number(state.sceneMod?.value) || 0);
    const roll = await new Roll(`1d20 + ${mod}`).evaluate();
    const natural = roll.dice[0]?.total ?? null;
    const degree = dc ? degreeOfSuccess(roll.total, Number(dc), natural) : null;
    await roll.toMessage({
        speaker: { alias: npc?.name ?? "NPC" },
        flavor: `<b>${escapeHTML(label)}</b>${dc ? ` (DC ${dc})` : ""}`,
    });
    return { roll, degree };
}

/** Roll initiative for every crewed role using the role's skill, writing into the active encounter. */
export async function rollRoleInitiative() {
    const state = getState();
    const combat = game.combat;
    const results = [];
    for (const role of state.ship.roles) {
        if (role.actorId === NPC_CREW && state.ship.npcCrew) {
            const { roll } = await rollNPC(state, `${role.name}: ${L("Ship.Initiative")}`);
            results.push(`<li>${escapeHTML(state.ship.npcCrew.name)} — ${escapeHTML(role.name)}: <b>${roll.total}</b></li>`);
            continue;
        }
        const actor = game.actors.get(role.actorId);
        if (!actor) continue;
        const stat = actor.getStatistic?.(role.skill);
        if (!stat) {
            results.push(`<li>${escapeHTML(actor.name)}: ${L("Ship.NoSkill", { skill: role.skill })}</li>`);
            continue;
        }
        const roll = await stat.roll({
            skipDialog: true,
            modifiers: sceneModifiers(state),
            extraRollOptions: ["starship-scene", `starship-role:${role.name.slugify()}`],
        });
        if (!roll) continue;
        const combatant = combat?.combatants.find((c) => c.actorId === actor.id);
        if (combatant) await combat.setInitiative(combatant.id, roll.total);
        results.push(`<li>${escapeHTML(actor.name)} — ${escapeHTML(role.name)} (${escapeHTML(stat.label)}): <b>${roll.total}</b></li>`);
    }
    for (const t of state.threats) {
        if (t.init?.mod === undefined || t.init?.mod === null || t.init?.mod === "") continue;
        const roll = await new Roll(`1d20 + ${Number(t.init.mod) || 0}`).evaluate();
        results.push(`<li><i class="fa-solid fa-skull"></i> ${escapeHTML(t.name)} (${escapeHTML(t.init.skill)}): <b>${roll.total}</b></li>`);
    }
    if (results.length) {
        await postCard({ title: L("Ship.Initiative"), icon: "fa-solid fa-list-ol", variant: "ship", body: `<ul>${results.join("")}</ul>` });
    } else {
        ui.notifications.warn(L("Ship.NoCrew"));
    }
}

/** Free-form role check against a DC from the scene stat block. */
export async function roleCheck(roleId, dc) {
    const state = getState();
    const role = state.ship.roles.find((r) => r.id === roleId);
    if (role?.actorId === NPC_CREW && state.ship.npcCrew) return (await rollNPC(state, role.name, dc || null)).roll;
    const actor = game.actors.get(role?.actorId ?? "");
    if (!actor) return ui.notifications.warn(L("Ship.NoCrew"));
    const stat = actor.getStatistic?.(role.skill);
    if (!stat) return ui.notifications.warn(L("Ship.NoSkill", { skill: role.skill }));
    return stat.roll({
        dc: dc ? { value: Number(dc) } : null,
        label: `${role.name}: ${stat.label}`,
        modifiers: sceneModifiers(state),
        extraRollOptions: ["starship-scene", `starship-role:${role.name.slugify()}`],
    });
}

export async function mutate(fn) {
    const state = getState();
    await fn(state);
    return saveState(state);
}

/* ---------------------------------- Presets ---------------------------------- */

const presets = new Map();

/**
 * Register a starship scene preset (called by content modules on the "sfk.registerContent" hook).
 * @param {object} preset { id, name, source?, group?, summary?, setup?: [{label, mod: {label, value, type}}], scene: Partial<State> }
 */
export function registerPreset(preset) {
    if (!preset?.id || !preset.scene) return warn("Invalid starship preset", preset);
    presets.set(preset.id, preset);
}

export function listPresets() {
    return [...presets.values()];
}

/** Replace the current scene with a preset. Crew assignments carry over by role name where possible. */
export async function loadPreset(presetId, { setupIndex = null } = {}) {
    const preset = presets.get(presetId);
    if (!preset) return ui.notifications.warn(L("Ship.PresetMissing"));
    const previous = getState();
    const scene = normalize(foundry.utils.deepClone(preset.scene));
    scene.presetId = preset.id;
    scene.source = preset.source ?? "";
    scene.round = 0;
    scene.active = true;
    for (const role of scene.ship.roles) {
        const prior = previous.ship.roles.find((r) => r.name.toLowerCase() === role.name.toLowerCase() && r.actorId);
        if (prior) role.actorId = prior.actorId;
    }
    const setup = setupIndex !== null ? preset.setup?.[setupIndex] : null;
    if (setup?.mod) scene.sceneMod = { label: setup.mod.label ?? setup.label, value: Number(setup.mod.value) || 0, type: setup.mod.type ?? "circumstance" };
    await saveState(scene);
    await postCard(
        {
            title: scene.name || preset.name,
            icon: "fa-solid fa-shuttle-space",
            variant: "ship",
            body: `${preset.summary ? `<p>${escapeHTML(preset.summary)}</p>` : ""}${
                setup ? `<p class="sfk-hint">${escapeHTML(setup.label)}</p>` : ""
            }<p>${escapeHTML(scene.victory.text)}</p>`,
        },
        { whisper: game.users.filter((u) => u.isGM).map((u) => u.id) },
    );
    return scene;
}

export function exportScene() {
    const state = getState();
    const name = (state.name || "starship-scene").slugify();
    foundry.utils.saveDataToFile(JSON.stringify(state, null, 2), "application/json", `sfk-${name}.json`);
}

export async function importScene(json) {
    let data;
    try {
        data = typeof json === "string" ? JSON.parse(json) : json;
    } catch {
        return ui.notifications.error(L("Ship.ImportBad"));
    }
    if (!data?.ship) return ui.notifications.error(L("Ship.ImportBad"));
    return saveState(normalize(data));
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
    adjustVP: async (delta) => {
        const s = getState();
        s.victory.vp = Math.max(0, s.victory.vp + delta);
        await saveState(s);
        await announceVictory(s);
    },
    toggleOffGuard: (key) =>
        mutate((s) => {
            const c = craftOf(s, key);
            if (c) c.offGuard = !c.offGuard;
        }),
    setActive: (active) => mutate((s) => void (s.active = active)),
    reset: () => saveState(defaultState()),
};
