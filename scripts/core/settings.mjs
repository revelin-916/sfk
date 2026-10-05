import { MODULE_ID } from "./constants.mjs";

/**
 * @param {object} apps  { StarshipSceneApp, FactionsApp, LedgerApp } for refresh-on-change and settings menus
 */
export function registerSettings(apps) {
    const reg = (key, data) => game.settings.register(MODULE_ID, key, { name: `SFK.Settings.${key}.Name`, hint: `SFK.Settings.${key}.Hint`, ...data });
    const hidden = (key, type, def, onChange) =>
        game.settings.register(MODULE_ID, key, { scope: "world", config: false, type, default: def, onChange });

    /* Combat */
    reg("volleyAmmo", {
        scope: "world",
        config: true,
        type: String,
        default: "prompt",
        choices: { auto: "SFK.Settings.Choice.Auto", prompt: "SFK.Settings.Choice.Prompt", off: "SFK.Settings.Choice.Off" },
    });
    reg("volleyAutoTarget", { scope: "client", config: true, type: Boolean, default: true });
    reg("suppressionAuto", { scope: "world", config: true, type: Boolean, default: true });
    reg("glitchingAuto", {
        scope: "world",
        config: true,
        type: String,
        default: "auto",
        choices: { auto: "SFK.Settings.Choice.Auto", prompt: "SFK.Settings.Choice.Prompt", off: "SFK.Settings.Choice.Off" },
    });
    reg("untetheredDrift", {
        scope: "world",
        config: true,
        type: String,
        default: "prompt",
        choices: { prompt: "SFK.Settings.Choice.Prompt", off: "SFK.Settings.Choice.Off" },
    });
    reg("ammoWarnPct", { scope: "world", config: true, type: Number, default: 25, range: { min: 0, max: 75, step: 5 } });
    reg("ammoWarnSound", { scope: "client", config: true, type: String, default: "", filePicker: "audio" });

    /* Solarian */
    reg("attunementLight", { scope: "world", config: true, type: Boolean, default: true });
    reg("attunementChat", { scope: "world", config: true, type: Boolean, default: true });

    /* Immersion */
    reg("commsSound", { scope: "world", config: true, type: String, default: "", filePicker: "audio" });
    reg("alertSound", { scope: "world", config: true, type: String, default: "", filePicker: "audio" });
    reg("infosphereEnabled", { scope: "world", config: true, type: Boolean, default: false });
    reg("infosphereInterval", { scope: "world", config: true, type: Number, default: 8, range: { min: 1, max: 72, step: 1 } });

    /* Economy */
    reg("ledgerEnabled", { scope: "world", config: true, type: Boolean, default: true });

    /* Data stores */
    hidden("starshipScene", Object, {}, () => apps.StarshipSceneApp.refresh());
    hidden("factions", Object, {}, () => apps.FactionsApp.refresh());
    hidden("ledger", Array, [], () => apps.LedgerApp.refresh());
    hidden("infosphereHeadlines", Array, []);
    hidden("infosphereLast", Number, 0);
    hidden("infosphereSet", String, "");

    /* Menus */
    game.settings.registerMenu(MODULE_ID, "starshipMenu", {
        name: "SFK.Ship.AppTitle",
        label: "SFK.Menu.Open",
        icon: "fa-solid fa-shuttle-space",
        type: apps.StarshipSceneApp,
        restricted: false,
    });
    game.settings.registerMenu(MODULE_ID, "factionsMenu", {
        name: "SFK.Faction.Title",
        label: "SFK.Menu.Open",
        icon: "fa-solid fa-flag",
        type: apps.FactionsApp,
        restricted: false,
    });
    game.settings.registerMenu(MODULE_ID, "ledgerMenu", {
        name: "SFK.Ledger.Title",
        label: "SFK.Menu.Open",
        icon: "fa-solid fa-book",
        type: apps.LedgerApp,
        restricted: false,
    });
}
