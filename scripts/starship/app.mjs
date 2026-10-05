import { TEMPLATE_ROOT } from "../core/constants.mjs";
import { L, escapeHTML, partyCharacters } from "../core/foundry.mjs";
import {
    applyForm,
    damage,
    exportScene,
    getState,
    importScene,
    listPresets,
    loadPreset,
    nextRound,
    ops,
    roleCheck,
    rollRoleInitiative,
    saveState,
    vpLabel,
    NPC_CREW,
} from "./state.mjs";
import { fireWeapon, runAction, runRoutine } from "./engine.mjs";

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
            runAction: (_e, t) => runAction(t.dataset.id),
            fireWeapon: (_e, t) => fireWeapon(t.dataset.id),
            runRoutine: (_e, t) => runRoutine(t.dataset.key),
            runStep: (_e, t) => runRoutine(t.dataset.key, t.dataset.step),
            toggleOffGuard: (_e, t) => ops.toggleOffGuard(t.dataset.key),
            loadPreset: () => StarshipSceneApp.presetDialog(),
            exportScene: () => exportScene(),
            importScene: StarshipSceneApp.#onImport,
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
        if (state.ship.npcCrew?.name) crew.push({ value: NPC_CREW, label: `${state.ship.npcCrew.name} (+${state.ship.npcCrew.mod})` });
        const pct = (c) => (c.hp.max ? Math.round((100 * c.hp.value) / c.hp.max) : 0);
        const shp = (c) => (c.shields.max ? Math.round((100 * c.shields.value) / c.shields.max) : 0);
        return {
            state,
            isGM: game.user.isGM,
            ro: !game.user.isGM,
            skills,
            crew,
            victoryModes: {
                hp: L("Ship.VictoryHP"),
                vp: L("Ship.VictoryVP"),
                hpOrVp: L("Ship.VictoryHPOrVP"),
                rounds: L("Ship.VictoryRounds"),
            },
            showVP: ["vp", "hpOrVp"].includes(state.victory.mode),
            vpLabel: vpLabel(state),
            modTypes: { circumstance: "Circumstance", item: "Item", status: "Status", untyped: "Untyped" },
            hasPresets: listPresets().length > 0,
            ship: {
                ...state.ship,
                hpPct: pct(state.ship),
                shPct: shp(state.ship),
                actions: state.ship.actions.map((x) => ({ ...x, roleLabel: [x.role].flat().filter(Boolean).join(" / ") })),
            },
            threats: state.threats.map((t, index) => ({ ...t, index, hpPct: pct(t), shPct: shp(t), hasHP: t.hp.max > 0 })),
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

    /** Choose a registered preset (and its setup option, if any) and load it. */
    static async presetDialog() {
        const presets = listPresets();
        if (!presets.length) return ui.notifications.warn(L("Ship.NoPresets"));
        const groups = Object.groupBy(presets, (p) => p.group ?? p.source ?? "");
        const options = Object.entries(groups)
            .map(
                ([g, list]) =>
                    `<optgroup label="${escapeHTML(g)}">${list.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join("")}</optgroup>`,
            )
            .join("");
        const picked = await DialogV2.input({
            window: { title: L("Ship.LoadPreset"), icon: "fa-solid fa-folder-open" },
            content: `<div class="form-group"><label>${L("Ship.Preset")}</label><select name="preset">${options}</select></div>
<p class="sfk-hint">${L("Ship.PresetHint")}</p>`,
            ok: { label: L("Ship.Load"), icon: "fa-solid fa-check" },
        });
        if (!picked?.preset) return;
        const preset = presets.find((p) => p.id === picked.preset);
        let setupIndex = null;
        if (preset?.setup?.length) {
            const radios = preset.setup
                .map((o, i) => `<label class="sfk-check"><input type="radio" name="setup" value="${i}" ${i === 0 ? "checked" : ""}> ${escapeHTML(o.label)}</label>`)
                .join("<br>");
            const s = await DialogV2.input({
                window: { title: preset.setupTitle ?? L("Ship.Setup") },
                content: `<p>${escapeHTML(preset.setupPrompt ?? "")}</p>${radios}`,
                ok: { label: L("Ship.Load"), icon: "fa-solid fa-check" },
            });
            if (!s) return;
            setupIndex = Number(s.setup) || 0;
        }
        await loadPreset(preset.id, { setupIndex });
    }

    static async #onImport() {
        const result = await DialogV2.input({
            window: { title: L("Ship.Import"), icon: "fa-solid fa-file-import" },
            content: `<p>${L("Ship.ImportHint")}</p><input type="file" name="file" accept=".json,application/json">`,
            ok: {
                label: L("Ship.Import"),
                callback: async (_event, button) => {
                    const file = button.form.elements.file?.files?.[0];
                    return file ? file.text() : null;
                },
            },
        });
        if (typeof result === "string") await importScene(result);
    }

    static async #onReset() {
        const ok = await DialogV2.confirm({
            window: { title: L("Ship.ResetTitle") },
            content: `<p>${L("Ship.ResetBody")}</p>`,
        });
        if (ok) await ops.reset();
    }
}

