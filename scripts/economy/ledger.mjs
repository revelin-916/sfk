/**
 * Credits ledger. The active GM watches every party character's credits/UPB and logs each change with an
 * optional reason (set by SFK tools such as Mission Payout, or typed in afterwards from the ledger window).
 */
import { TEMPLATE_ROOT } from "../core/constants.mjs";
import { L, escapeHTML, isPrimaryGM, keyedDebounce, setting, setSetting, partyCharacters } from "../core/foundry.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const MAX_ENTRIES = 500;
const balances = new Map(); // actorId -> {credits, upb}
const pendingReasons = new Map(); // actorId -> reason (consumed by next logged change)

/**
 * Credits and UPBs on hand. Credsticks may persist their value as silver-equivalent, so credits are derived from the
 * total currency value (1 credit = 10 cp in the system's rates) minus UPBs (also 10 cp each).
 */
export function wallet(actor) {
    const currency = actor?.inventory?.currency;
    if (!currency) return { credits: 0, upb: 0 };
    const upb = (actor.itemTypes?.treasure ?? [])
        .filter((i) => i.unit === "upb")
        .reduce((n, i) => n + (Number(i.quantity) || 0), 0);
    const total = Math.round((Number(currency.copperValue) || 0) / 10);
    return { credits: Math.max(0, total - upb), upb };
}

/** Attach a reason to the next credit change recorded for this actor. */
export function noteReason(actorId, reason) {
    pendingReasons.set(actorId, reason);
}

export function entries() {
    const list = setting("ledger");
    return Array.isArray(list) ? list : [];
}

async function record(actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const now = wallet(actor);
    const prev = balances.get(actorId);
    balances.set(actorId, now);
    if (!prev) return;
    const dc = now.credits - prev.credits;
    const du = now.upb - prev.upb;
    if (!dc && !du) return;
    const reason = pendingReasons.get(actorId) ?? "";
    pendingReasons.delete(actorId);
    const list = entries().slice(-(MAX_ENTRIES - 1));
    list.push({
        id: foundry.utils.randomID(8),
        ts: Date.now(),
        worldTime: game.time.worldTime,
        actorId,
        actorName: actor.name,
        credits: dc,
        upb: du,
        balance: now.credits,
        reason,
    });
    await setSetting("ledger", list);
}

const queue = keyedDebounce((id) => record(id), 400);

function watch(actor) {
    if (!actor || actor.type !== "character" || !isPrimaryGM() || !setting("ledgerEnabled")) return;
    queue(actor.id);
}

export function initLedger() {
    Hooks.once("ready", () => {
        if (!isPrimaryGM()) return;
        for (const a of game.actors.filter((x) => x.type === "character")) balances.set(a.id, wallet(a));
    });
    for (const hook of ["createItem", "updateItem", "deleteItem"]) {
        Hooks.on(hook, (item) => {
            if (item.type === "treasure") watch(item.actor);
        });
    }
}

export class LedgerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sfk-ledger",
        classes: ["sfk", "sfk-app", "sfk-ledger"],
        window: { title: "SFK.Ledger.Title", icon: "fa-solid fa-book", resizable: true },
        position: { width: 720, height: 600 },
        actions: {
            editReason: LedgerApp.#onEditReason,
            clear: LedgerApp.#onClear,
            exportCsv: LedgerApp.#onExport,
        },
    };

    static PARTS = { body: { template: `${TEMPLATE_ROOT}/apps/ledger.hbs`, scrollable: [".sfk-scroll"] } };

    static #instance = null;
    static open() {
        this.#instance ??= new LedgerApp();
        return this.#instance.render({ force: true });
    }
    static refresh() {
        if (this.#instance?.rendered) this.#instance.render();
    }

    async _prepareContext() {
        const all = entries();
        const visible = game.user.isGM ? all : all.filter((e) => game.actors.get(e.actorId)?.isOwner);
        const totals = partyCharacters().map((a) => ({ name: a.name, ...wallet(a) }));
        return {
            isGM: game.user.isGM,
            totals,
            rows: visible
                .slice()
                .reverse()
                .map((e) => ({
                    ...e,
                    when: new Date(e.ts).toLocaleString(),
                    cls: e.credits >= 0 ? "sfk-pos" : "sfk-neg",
                    signed: (e.credits > 0 ? "+" : "") + e.credits,
                })),
        };
    }

    static async #onEditReason(_e, target) {
        if (!game.user.isGM) return;
        const list = entries();
        const entry = list.find((e) => e.id === target.dataset.id);
        if (!entry) return;
        const result = await DialogV2.input({
            window: { title: L("Ledger.Reason") },
            content: `<input type="text" name="reason" value="${escapeHTML(entry.reason)}" style="width:100%" autofocus>`,
        });
        if (result?.reason === undefined) return;
        entry.reason = result.reason;
        await setSetting("ledger", list);
    }

    static async #onClear() {
        const ok = await DialogV2.confirm({ window: { title: L("Ledger.Clear") }, content: `<p>${L("Ledger.ClearConfirm")}</p>` });
        if (ok) await setSetting("ledger", []);
    }

    static #onExport() {
        const rows = [["timestamp", "worldTime", "character", "credits", "upb", "balance", "reason"]];
        for (const e of entries()) rows.push([new Date(e.ts).toISOString(), e.worldTime, e.actorName, e.credits, e.upb, e.balance, e.reason]);
        const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        foundry.utils.saveDataToFile(csv, "text/csv", "sfk-credits-ledger.csv");
    }
}

