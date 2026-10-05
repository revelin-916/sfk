/**
 * Infosphere feed: as in-world time passes, the active GM periodically broadcasts a headline from an editable list.
 * Headlines are original flavor text; replace them freely in module settings.
 */
import { MODULE_ID } from "../core/constants.mjs";
import { nextTick } from "../core/logic.mjs";
import { L, escapeHTML, isPrimaryGM, setting, setSetting } from "../core/foundry.mjs";

const { DialogV2 } = foundry.applications.api;

export const DEFAULT_HEADLINES = [
    "Absalom Station port authority reports record Drift traffic; berth wait times up 40%.",
    "Stewards issue advisory: unregistered salvage beacons detected near the Diaspora.",
    "Infosphere outage on Akiton blamed on 'solar weather'; locals blame the mining guilds.",
    "Starfinder Society recruitment drive concludes; Lodge cites 'unprecedented' applicant numbers.",
    "Market watch: credstick fraud ring dismantled after six-month investigation.",
    "Drift beacon maintenance scheduled; expect delays on secondary trade lanes.",
    "Weather control fault turns Verces terminator zone into a 'light show' for three hours.",
    "Corporate merger rumors send shipyard stocks soaring — analysts urge caution.",
    "Unidentified vessel hails Pact Worlds traffic control, then vanishes from sensors.",
    "Medical alert: new strain of data-borne malware spreading through augmentation firmware.",
    "Archaeologists announce new pre-Gap site; access restricted pending survey.",
    "Mercenary company accused of breaching contract terms during frontier escort.",
    "Orbital elevator inspection finds 'minor' structural concerns; public tours suspended.",
    "Pirate activity reported along the Vast edge; insurers raise premiums on cargo runs.",
    "Local band's hologram tour sells out across three stations in under an hour.",
    "Freighter crew rescued after 19 days adrift; captain credits 'very stubborn engineer.'",
];

const sets = new Map();

/** Content modules register themed headline sets; the GM picks the active one. */
export function registerHeadlineSet(id, { label, lines }) {
    if (!id || !Array.isArray(lines)) return;
    sets.set(id, { id, label: label ?? id, lines });
}

export function headlines() {
    const active = sets.get(setting("infosphereSet"));
    if (active?.lines?.length) return active.lines;
    const list = setting("infosphereHeadlines");
    return Array.isArray(list) && list.length ? list : DEFAULT_HEADLINES;
}

export async function chooseSet() {
    if (!game.user.isGM) return;
    const current = setting("infosphereSet");
    const opts = [`<option value="">${L("Info.CustomSet")}</option>`]
        .concat([...sets.values()].map((s) => `<option value="${escapeHTML(s.id)}" ${s.id === current ? "selected" : ""}>${escapeHTML(s.label)} (${s.lines.length})</option>`))
        .join("");
    const result = await DialogV2.input({
        window: { title: L("Info.ChooseSet"), icon: "fa-solid fa-newspaper" },
        content: `<div class="form-group"><label>${L("Info.Set")}</label><select name="set">${opts}</select></div>`,
    });
    if (!result) return;
    await setSetting("infosphereSet", result.set ?? "");
    ui.notifications.info(L("Info.SetChosen", { label: sets.get(result.set)?.label ?? L("Info.CustomSet") }));
}

export async function broadcast(text) {
    const pool = headlines();
    const line = text ?? pool[Math.floor(Math.random() * pool.length)];
    return ChatMessage.create({
        speaker: { alias: L("Info.Feed") },
        content: `<div class="sfk-card sfk-info sfk-infosphere"><header class="sfk-card-header"><i class="fa-solid fa-newspaper"></i><span>${L(
            "Info.Feed",
        )}</span></header><div class="sfk-card-body"><p class="sfk-ticker">${escapeHTML(line)}</p></div></div>`,
        flags: { [MODULE_ID]: { infosphere: true } },
    });
}

export async function editHeadlines() {
    const current = headlines().join("\n");
    const result = await DialogV2.input({
        window: { title: L("Info.EditTitle"), icon: "fa-solid fa-newspaper" },
        position: { width: 640 },
        content: `<p>${L("Info.EditHint")}</p><textarea name="lines" rows="16" style="width:100%">${escapeHTML(current)}</textarea>`,
        ok: { label: L("Common.Save"), icon: "fa-solid fa-floppy-disk" },
    });
    if (!result?.lines) return;
    const lines = result.lines
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    await setSetting("infosphereHeadlines", lines);
    ui.notifications.info(L("Info.Saved", { n: lines.length }));
}

export function initInfosphere() {
    Hooks.on("updateWorldTime", async (worldTime) => {
        if (!isPrimaryGM() || !setting("infosphereEnabled")) return;
        const last = Number(setting("infosphereLast")) || 0;
        if (last === 0 || worldTime < last) {
            await setSetting("infosphereLast", worldTime); // anchor, or rewind after a time reset
            return;
        }
        if (worldTime < nextTick(last, setting("infosphereInterval"))) return;
        await setSetting("infosphereLast", worldTime);
        await broadcast();
    });
}
