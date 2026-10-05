/**
 * Starship scene engine: executes structured starship actions, ship weapons, and threat routines.
 *
 * Threat routine steps (threat.steps[]):
 *   { kind: "check",     name, mod, vs: "ac"|"fort"|"ref"|"will"|number, target: "ship",
 *                         onSuccess: { offGuard: true, note }, onCriticalSuccess?: {...} }
 *   { kind: "strike",    name, mod, damage: "2d6+3", damageType, target: "ship" }
 *   { kind: "basicSave", name, save: "fort"|"ref"|"will", dc, damage: "1d6", damageType,
 *                         targets: "all"|"ship"|"threats", skipIfFlag?: "avoid-asteroids" }
 *
 * Action effects (action.outcomes[degree]):
 *   { vp: n, heal: "2d8", clearPersistent: true, setFlag: "avoid-asteroids", note: "..." }
 */
import { DEGREES, degreeOfSuccess, basicSaveDamage, strikeDamage, roleMatches, resolveDC } from "../core/logic.mjs";
import { L, escapeHTML } from "../core/foundry.mjs";
import { postCard } from "../core/chat.mjs";
import { getState, saveState, craftOf, damageInState, sceneModifiers, announceVictory, vpLabel, NPC_CREW, rollNPC } from "./state.mjs";

const { DialogV2 } = foundry.applications.api;

const degreeLabel = (d) => `<span class="sfk-degree sfk-${DEGREES[d]}">${L(`Degree.${DEGREES[d]}`)}</span>`;

/* ----------------------------------- Effects ---------------------------------- */

async function applyEffects(state, key, effects, lines) {
    if (!effects) return;
    const craft = craftOf(state, key);
    if (effects.vp) {
        state.victory.vp = Math.max(0, (state.victory.vp ?? 0) + Number(effects.vp));
        lines.push(`${escapeHTML(vpLabel(state))} ${effects.vp > 0 ? "+" : ""}${effects.vp} → <b>${state.victory.vp}</b> / ${state.victory.vpTarget}`);
    }
    if (effects.heal) {
        const roll = await new Roll(String(effects.heal)).evaluate();
        lines.push(damageInState(state, key, -roll.total));
    }
    if (effects.clearPersistent && craft?.persistent?.length) {
        craft.persistent = [];
        lines.push(L("Engine.PersistentCleared"));
    }
    if (effects.setFlag && craft) {
        craft.flags[effects.setFlag] = true;
        lines.push(L("Engine.FlagSet", { flag: escapeHTML(effects.flagLabel ?? effects.setFlag) }));
    }
    if (effects.offGuard && craft) {
        craft.offGuard = true;
        lines.push(L("Engine.OffGuard", { name: escapeHTML(craft.name) }));
    }
    if (effects.note) lines.push(`<em>${escapeHTML(effects.note)}</em>`);
}

/* ---------------------------------- Crew actions ------------------------------- */

/** A crew entry is { role, actor } for a PC, or { role, npc } for the ship's NPC crew member. */
function crewFor(state, role) {
    if (role.actorId === NPC_CREW) return state.ship.npcCrew ? { role, npc: state.ship.npcCrew } : null;
    const actor = game.actors.get(role.actorId);
    return actor ? { role, actor } : null;
}

const crewName = (c) => c.actor?.name ?? c.npc?.name ?? "?";

function eligibleCrew(state, action) {
    return state.ship.roles
        .filter((r) => r.actorId && roleMatches(r.name, action.role))
        .map((r) => crewFor(state, r))
        .filter(Boolean);
}

/** Ask which crew member and which check option to use. */
async function chooseCrewAndCheck(state, action) {
    let crew = eligibleCrew(state, action);
    const fallback = crew.length === 0;
    if (fallback) {
        crew = state.ship.roles
            .filter((r) => r.actorId)
            .map((r) => crewFor(state, r))
            .filter(Boolean);
    }
    if (!crew.length) {
        ui.notifications.warn(L("Ship.NoCrew"));
        return null;
    }
    const checks = action.checks?.length ? action.checks : [{ skill: "perception", dc: null }];
    if (crew.length === 1 && checks.length === 1) return { ...crew[0], check: checks[0] };

    const crewOpts = crew
        .map((c, i) => `<option value="${i}">${escapeHTML(crewName(c))} — ${escapeHTML(c.role.name)}</option>`)
        .join("");
    const checkOpts = checks
        .map((c, i) => {
            const label = game.i18n.localize(CONFIG.PF2E?.skills?.[c.skill]?.label ?? c.skill);
            return `<option value="${i}">${escapeHTML(label)}${c.dc ? ` (DC ${c.dc})` : ""}</option>`;
        })
        .join("");
    const result = await DialogV2.input({
        window: { title: action.name, icon: "fa-solid fa-user-astronaut" },
        content: `${fallback ? `<p class="sfk-hint">${L("Engine.NoRoleMatch", { role: escapeHTML([action.role].flat().join(" / ")) })}</p>` : ""}
<div class="form-group"><label>${L("Ship.Crew")}</label><select name="crew">${crewOpts}</select></div>
<div class="form-group"><label>${L("Ship.Skill")}</label><select name="check">${checkOpts}</select></div>`,
        ok: { label: L("Engine.Attempt"), icon: "fa-solid fa-dice-d20" },
    });
    if (!result) return null;
    return { ...crew[Number(result.crew) || 0], check: checks[Number(result.check) || 0] };
}

/** Perform a structured starship action from the party ship. */
export async function runAction(actionId) {
    const state = getState();
    const action = state.ship.actions.find((a) => a.id === actionId);
    if (!action) return;
    const pick = await chooseCrewAndCheck(state, action);
    if (!pick) return;
    if (pick.npc) {
        const { roll, degree } = await rollNPC(state, `${action.name} (${pick.role.name})`, pick.check.dc);
        if (degree === null) return;
        return resolveAction(action, crewName(pick), roll.total, pick.check.dc, degree);
    }
    const stat = pick.actor.getStatistic?.(pick.check.skill);
    if (!stat) return ui.notifications.warn(L("Ship.NoSkill", { skill: pick.check.skill }));

    const roll = await stat.roll({
        dc: pick.check.dc ? { value: Number(pick.check.dc) } : null,
        label: `${action.name} (${pick.role.name})`,
        modifiers: sceneModifiers(state),
        extraRollOptions: ["starship-scene", `starship-action:${action.name.slugify()}`, `starship-role:${pick.role.name.slugify()}`],
    });
    if (!roll) return;
    if (!pick.check.dc) return; // no DC: the GM adjudicates from the roll card

    const natural = roll.dice?.[0]?.total ?? null;
    const degree = typeof roll.degreeOfSuccess === "number" ? roll.degreeOfSuccess : degreeOfSuccess(roll.total, Number(pick.check.dc), natural);
    return resolveAction(action, pick.actor.name, roll.total, pick.check.dc, degree);
}

async function resolveAction(action, who, total, dc, degree) {
    const fresh = getState(); // re-read: the roll dialog may have been open a while
    const lines = [];
    await applyEffects(fresh, "ship", action.outcomes?.[DEGREES[degree]], lines);
    await saveState(fresh);
    await postCard({
        title: `${action.name} — ${who}`,
        icon: "fa-solid fa-gauge-high",
        variant: "ship",
        body: `<p>${degreeLabel(degree)} (${total} vs DC ${dc})</p>${lines.length ? `<p>${lines.join("<br>")}</p>` : ""}`,
    });
    await announceVictory(fresh);
}

/* ---------------------------------- Ship weapons ------------------------------- */

/** Fire a party-ship weapon at a threat. Gunner attack bonus is entered by the GM (cinematic scenes use the PC's own attack). */
export async function fireWeapon(weaponId) {
    const state = getState();
    const weapon = state.ship.weapons.find((w) => w.id === weaponId);
    if (!weapon) return;
    const targets = state.threats.filter((t) => (t.hp?.max ?? 0) > 0 && t.hp.value > 0);
    if (!targets.length) return ui.notifications.warn(L("Engine.NoTargets"));
    const gunners = state.ship.roles.filter((r) => r.actorId && roleMatches(r.name, weapon.role ?? "gunner"));
    const gunnerOpts = gunners
        .map((r) => crewFor(state, r))
        .filter(Boolean)
        .map((c) => `<option value="${escapeHTML(crewName(c))}">${escapeHTML(crewName(c))} — ${escapeHTML(c.role.name)}</option>`)
        .join("");
    const targetOpts = targets.map((t) => `<option value="${t.id}">${escapeHTML(t.name)} (AC ${t.ac}${t.offGuard ? ", off-guard" : ""})</option>`).join("");
    const result = await DialogV2.input({
        window: { title: weapon.name, icon: "fa-solid fa-crosshairs" },
        content: `<p class="sfk-hint">${escapeHTML(weapon.traits ?? "")} · ${escapeHTML(weapon.damage)} ${escapeHTML(weapon.damageType ?? "")}</p>
${gunners.length ? `<div class="form-group"><label>${L("Engine.Gunner")}</label><select name="gunner">${gunnerOpts}</select></div>` : ""}
<div class="form-group"><label>${L("Engine.Target")}</label><select name="target">${targetOpts}</select></div>
<div class="form-group"><label>${L("Engine.AttackBonus")}</label><input type="number" name="bonus" value="${Number(weapon.lastBonus ?? 7)}"></div>
<div class="form-group"><label>${L("Engine.MAP")}</label><select name="map"><option value="0">0</option><option value="-5">−5</option><option value="-10">−10</option></select></div>`,
        ok: { label: L("Engine.Fire"), icon: "fa-solid fa-burst" },
    });
    if (!result) return;
    const target = state.threats.find((t) => t.id === result.target);
    const bonus = Number(result.bonus) || 0;
    const ac = Number(target.ac) - (target.offGuard ? 2 : 0);
    const attack = await new Roll(`1d20 + ${bonus} + ${Number(result.map) || 0}`).evaluate();
    const degree = degreeOfSuccess(attack.total, ac, attack.dice[0].total);
    const lines = [`${degreeLabel(degree)} (${attack.total} vs AC ${ac})`];
    const fresh = getState();
    fresh.ship.weapons.find((w) => w.id === weaponId).lastBonus = bonus;
    if (degree >= 2) {
        const dmg = await new Roll(String(weapon.damage)).evaluate();
        const total = strikeDamage(dmg.total, degree);
        lines.push(`${L("Ship.Damage")}: <b>${total}</b> ${escapeHTML(weapon.damageType ?? "")}${degree === 3 ? ` (${L("Engine.Doubled")})` : ""}`);
        lines.push(damageInState(fresh, target.id, total));
    }
    await saveState(fresh);
    const gunnerName = result.gunner ?? "";
    await postCard({
        title: `${weapon.name} → ${target.name}`,
        icon: "fa-solid fa-crosshairs",
        variant: "ship",
        body: `${gunnerName ? `<p class="sfk-hint">${escapeHTML(gunnerName)}</p>` : ""}<p>${lines.join("<br>")}</p>`,
    });
    await announceVictory(fresh);
}

/* --------------------------------- Threat routines ------------------------------ */

async function runStep(state, threat, step, lines) {
    switch (step.kind) {
        case "check": {
            const target = craftOf(state, step.target ?? "ship");
            const dc = resolveDC(step.vs ?? "will", target);
            const roll = await new Roll(`1d20 + ${Number(step.mod) || 0}`).evaluate();
            const degree = degreeOfSuccess(roll.total, dc, roll.dice[0].total);
            lines.push(`<b>${escapeHTML(step.name)}</b>: ${degreeLabel(degree)} (${roll.total} vs DC ${dc})`);
            const effects = degree === 3 ? (step.onCriticalSuccess ?? step.onSuccess) : degree === 2 ? step.onSuccess : degree === 0 ? step.onCriticalFailure : step.onFailure;
            const sub = [];
            await applyEffects(state, step.target ?? "ship", effects, sub);
            if (sub.length) lines.push(`&nbsp;&nbsp;${sub.join("<br>&nbsp;&nbsp;")}`);
            return;
        }
        case "strike": {
            const target = craftOf(state, step.target ?? "ship");
            const ac = (Number(target.ac) || 10) - (target.offGuard ? 2 : 0);
            const roll = await new Roll(`1d20 + ${Number(step.mod) || 0}`).evaluate();
            const degree = degreeOfSuccess(roll.total, ac, roll.dice[0].total);
            lines.push(`<b>${escapeHTML(step.name)}</b>: ${degreeLabel(degree)} (${roll.total} vs AC ${ac}${target.offGuard ? `, ${L("Engine.OffGuardShort")}` : ""})`);
            if (degree >= 2) {
                const dmg = await new Roll(String(step.damage)).evaluate();
                const total = strikeDamage(dmg.total, degree);
                lines.push(`&nbsp;&nbsp;${total} ${escapeHTML(step.damageType ?? "")} → ${damageInState(state, step.target ?? "ship", total)}`);
            }
            return;
        }
        case "basicSave": {
            const keys =
                step.targets === "ship" ? ["ship"] : step.targets === "threats" ? state.threats.map((t) => t.id) : ["ship", ...state.threats.map((t) => t.id)];
            const dmg = await new Roll(String(step.damage)).evaluate();
            lines.push(`<b>${escapeHTML(step.name)}</b>: ${dmg.total} ${escapeHTML(step.damageType ?? "")} (DC ${step.dc} ${L("Engine.BasicSave", { save: step.save })})`);
            for (const key of keys) {
                const craft = craftOf(state, key);
                if (!craft || craft.id === threat.id || !(craft.hp?.max > 0) || craft.hp.value <= 0) continue;
                if (step.skipIfFlag && craft.flags?.[step.skipIfFlag]) {
                    delete craft.flags[step.skipIfFlag];
                    lines.push(`&nbsp;&nbsp;${escapeHTML(craft.name)}: ${L("Engine.Avoided")}`);
                    continue;
                }
                const save = await new Roll(`1d20 + ${Number(craft[step.save]) || 0}`).evaluate();
                const degree = degreeOfSuccess(save.total, Number(step.dc), save.dice[0].total);
                const total = basicSaveDamage(dmg.total, degree);
                lines.push(`&nbsp;&nbsp;${escapeHTML(craft.name)}: ${degreeLabel(degree)} (${save.total}) → ${total ? damageInState(state, key, total) : L("Engine.NoDamage")}`);
            }
            return;
        }
        default:
            lines.push(`<em>${escapeHTML(step.name ?? step.kind)}</em>`);
    }
}

/** Run a threat's whole routine (or one step) and post the result. */
export async function runRoutine(threatId, stepId = null) {
    const state = getState();
    const threat = state.threats.find((t) => t.id === threatId);
    if (!threat?.steps?.length) return ui.notifications.warn(L("Engine.NoRoutine"));
    const steps = stepId ? threat.steps.filter((s) => s.id === stepId) : threat.steps;
    const lines = [];
    for (const step of steps) await runStep(state, threat, step, lines);
    await saveState(state);
    await postCard({
        title: L("Engine.RoutineTitle", { name: threat.name }),
        icon: "fa-solid fa-skull",
        variant: "alert",
        body: `<p>${lines.join("<br>")}</p>`,
    });
    await announceVictory(state);
}
