/**
 * Faction reputation tracker (party-wide). Tier thresholds are a house-rule default and fully editable.
 */
import { TEMPLATE_ROOT } from "../core/constants.mjs";
import { factionTier } from "../core/logic.mjs";
import { L, escapeHTML, setting, setSetting } from "../core/foundry.mjs";
import { postCard } from "../core/chat.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export const DEFAULT_TIERS = [
    { min: -999, label: "Hostile" },
    { min: -10, label: "Unfriendly" },
    { min: -4, label: "Neutral" },
    { min: 5, label: "Friendly" },
    { min: 10, label: "Trusted" },
    { min: 15, label: "Allied" },
];

export function getFactions() {
    const data = setting("factions");
    return {
        tiers: Array.isArray(data?.tiers) && data.tiers.length ? data.tiers : DEFAULT_TIERS,
        list: Array.isArray(data?.list) ? data.list : [],
    };
}

async function save(data) {
    await setSetting("factions", data);
}

export async function adjust(factionId, delta, note = "") {
    if (!game.user.isGM) return ui.notifications.warn(L("Notify.GMOnly"));
    const data = getFactions();
    const f = data.list.find((x) => x.id === factionId);
    if (!f) return;
    const before = factionTier(f.value, data.tiers);
    f.value += delta;
    const after = factionTier(f.value, data.tiers);
    await save(data);
    if (!f.secret) {
        await postCard({
            title: f.name,
            icon: delta >= 0 ? "fa-solid fa-handshake" : "fa-solid fa-handshake-slash",
            variant: "econ",
            body: `<p>${L(delta >= 0 ? "Faction.Up" : "Faction.Down", { n: Math.abs(delta) })}${
                note ? ` — <em>${escapeHTML(note)}</em>` : ""
            }</p>${before !== after ? `<p class="sfk-emph">${L("Faction.TierChange", { tier: escapeHTML(after) })}</p>` : ""}`,
        });
    }
}

export class FactionsApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sfk-factions",
        tag: "form",
        classes: ["sfk", "sfk-app", "sfk-factions"],
        window: { title: "SFK.Faction.Title", icon: "fa-solid fa-flag", resizable: true },
        position: { width: 560, height: 560 },
        form: { handler: FactionsApp.#onSubmit, submitOnChange: true, closeOnSubmit: false },
        actions: {
            add: FactionsApp.#onAdd,
            remove: FactionsApp.#onRemove,
            up: (_e, t) => adjust(t.dataset.id, 1),
            down: (_e, t) => adjust(t.dataset.id, -1),
            tiers: FactionsApp.#onTiers,
        },
    };

    static PARTS = { body: { template: `${TEMPLATE_ROOT}/apps/factions.hbs`, scrollable: [".sfk-scroll"] } };

    static #instance = null;
    static open() {
        this.#instance ??= new FactionsApp();
        return this.#instance.render({ force: true });
    }
    static refresh() {
        if (this.#instance?.rendered) this.#instance.render();
    }

    async _prepareContext() {
        const data = getFactions();
        const isGM = game.user.isGM;
        return {
            isGM,
            ro: !isGM,
            factions: data.list
                .map((f, index) => ({ ...f, index, tier: factionTier(f.value, data.tiers) }))
                .filter((f) => isGM || !f.secret),
        };
    }

    static async #onSubmit(_e, _f, formData) {
        if (!game.user.isGM) return;
        const patch = foundry.utils.expandObject(formData.object).list ?? {};
        const data = getFactions();
        data.list = data.list.map((f, i) => ({ ...f, ...(patch[i] ?? {}) }));
        await save(data);
    }

    static async #onAdd() {
        const data = getFactions();
        data.list.push({ id: foundry.utils.randomID(8), name: L("Faction.New"), value: 0, secret: false, notes: "" });
        await save(data);
    }

    static async #onRemove(_e, target) {
        const data = getFactions();
        data.list = data.list.filter((f) => f.id !== target.dataset.id);
        await save(data);
    }

    static async #onTiers() {
        const data = getFactions();
        const text = data.tiers.map((t) => `${t.min} = ${t.label}`).join("\n");
        const result = await DialogV2.input({
            window: { title: L("Faction.TiersTitle") },
            content: `<p>${L("Faction.TiersHint")}</p><textarea name="tiers" rows="8" style="width:100%">${escapeHTML(text)}</textarea>`,
        });
        if (!result?.tiers) return;
        const tiers = result.tiers
            .split("\n")
            .map((line) => line.match(/^\s*(-?\d+)\s*=\s*(.+?)\s*$/))
            .filter(Boolean)
            .map((m) => ({ min: Number(m[1]), label: m[2] }));
        if (tiers.length) {
            data.tiers = tiers;
            await save(data);
        }
    }
}
