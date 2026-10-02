import { TEMPLATE_ROOT } from "../core/constants.mjs";
import { L, partyCharacters } from "../core/foundry.mjs";
import { applyForm, damage, getState, nextRound, ops, roleCheck, rollRoleInitiative, saveState } from "./state.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class StarshipSceneApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sfk-starship-scene",
        tag: "form",
        classes: ["sfk", "sfk-app", "sfk-starship"],
        window: { title: "SFK.Ship.AppTitle", icon: "fa-solid fa-shuttle-space", resizable: true },
        position: { width: 820, height: 860 },
        form: { handler: StarshipSceneApp.#onSubmit, submitOnChange: true, closeOnSubmit: false },
        actions: {
            damage: StarshipSceneApp.#onDamage,
            heal: StarshipSceneApp.#onHeal,
            nextRound: () => nextRound(),
            initiative: () => rollRoleInitiative(),
            roleCheck: StarshipSceneApp.#onRoleCheck,
            addThreat: () => ops.addThreat(),
            removeThreat: (_e, t) => ops.removeThreat(t.dataset.key),
            addRole: () => ops.addRole(),
            removeRole: (_e, t) => ops.removeRole(t.dataset.role),
            addPersistent: (_e, t) => ops.addPersistent(t.dataset.key),
            removePersistent: (_e, t) => ops.removePersistent(t.dataset.key, t.dataset.pid),
            vpUp: () => ops.adjustVP(1),
            vpDown: () => ops.adjustVP(-1),
            toggleActive: StarshipSceneApp.#onToggleActive,
            reset: StarshipSceneApp.#onReset,
        },
    };

    static PARTS = {
        body: { template: `${TEMPLATE_ROOT}/apps/starship-scene.hbs`, scrollable: [".sfk-scroll"] },
    };

    static #instance = null;

    static open() {
        this.#instance ??= new StarshipSceneApp();
        this.#instance.render({ force: true });
        return this.#instance;
    }

    static refresh() {
        if (this.#instance?.rendered) this.#instance.render();
    }

    async _prepareContext() {
        const state = getState();
        const skills = [
            { value: "perception", label: game.i18n.localize("PF2E.PerceptionLabel") },
            ...Object.entries(CONFIG.PF2E?.skills ?? {}).map(([value, s]) => ({ value, label: game.i18n.localize(s.label ?? s) })),
        ].sort((a, b) => a.label.localeCompare(b.label));
        const crew = [{ value: "", label: "—" }, ...partyCharacters().map((a) => ({ value: a.id, label: a.name }))];
        const pct = (c) => (c.hp.max ? Math.round((100 * c.hp.value) / c.hp.max) : 0);
        const shp = (c) => (c.shields.max ? Math.round((100 * c.shields.value) / c.shields.max) : 0);
        return {
            state,
            isGM: game.user.isGM,
            ro: !game.user.isGM,
            skills,
            crew,
            victoryModes: { hp: L("Ship.VictoryHP"), vp: L("Ship.VictoryVP"), rounds: L("Ship.VictoryRounds") },
            ship: { ...state.ship, hpPct: pct(state.ship), shPct: shp(state.ship) },
            threats: state.threats.map((t, index) => ({ ...t, index, hpPct: pct(t), shPct: shp(t) })),
        };
    }

    static async #onSubmit(_event, _form, formData) {
        if (!game.user.isGM) return;
        const data = foundry.utils.expandObject(formData.object);
        await saveState(applyForm(getState(), data));
    }

    static async #onDamage(_event, target) {
        const input = this.element.querySelector(`input[data-dmg="${target.dataset.key}"]`);
        const n = Number(input?.value) || 0;
        if (n > 0) await damage(target.dataset.key, n);
    }

    static async #onHeal(_event, target) {
        const input = this.element.querySelector(`input[data-dmg="${target.dataset.key}"]`);
        const n = Number(input?.value) || 0;
        if (n > 0) await damage(target.dataset.key, -n);
    }

    static async #onRoleCheck(_event, target) {
        const dcInput = this.element.querySelector(`input[data-role-dc="${target.dataset.role}"]`);
        await roleCheck(target.dataset.role, dcInput?.value);
    }

    static async #onToggleActive() {
        await ops.setActive(!getState().active);
    }

    static async #onReset() {
        const ok = await DialogV2.confirm({
            window: { title: L("Ship.ResetTitle") },
            content: `<p>${L("Ship.ResetBody")}</p>`,
        });
        if (ok) await ops.reset();
    }
}

