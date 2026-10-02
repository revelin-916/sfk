/**
 * Comms transmissions: stylised chat cards for hails, ship-AI voice, and priority alerts.
 *
 * Chat commands (GM or any player):
 *   /comm Sender | message       — incoming transmission
 *   /ai Name | message           — ship AI / VI voice
 *   /alert message               — red priority alert (GM only)
 * API: SFK.comms.send({ channel: "comm"|"ai"|"alert", from, text, whisper })
 */
import { MODULE_ID } from "../core/constants.mjs";
import { L, escapeHTML, playSound, setting } from "../core/foundry.mjs";
import { parseCommsCommand } from "../core/logic.mjs";

const { DialogV2 } = foundry.applications.api;

const CHANNELS = {
    comm: { icon: "fa-solid fa-tower-broadcast", variant: "comm", label: "Comms.Incoming" },
    ai: { icon: "fa-solid fa-robot", variant: "ai", label: "Comms.AI" },
    alert: { icon: "fa-solid fa-triangle-exclamation", variant: "alert", label: "Comms.Alert" },
};

export async function send({ channel = "comm", from = "", text = "", whisper = [] } = {}) {
    const ch = CHANNELS[channel] ?? CHANNELS.comm;
    const safe = escapeHTML(text).replace(/\n/g, "<br>");
    const sender = escapeHTML(from || L(ch.label));
    const stamp = new Date().toISOString().slice(11, 19);
    const content = `<div class="sfk-card sfk-${ch.variant} sfk-transmission">
  <header class="sfk-card-header"><i class="${ch.icon}"></i><span>${sender}</span><span class="sfk-stamp">${stamp}</span></header>
  <div class="sfk-card-body"><p class="sfk-typewriter">${safe}</p></div>
</div>`;
    const sound = setting(channel === "alert" ? "alertSound" : "commsSound");
    if (sound) playSound(sound, 0.5);
    return ChatMessage.create({
        content,
        speaker: { alias: from || L(ch.label) },
        whisper: whisper.length ? whisper : undefined,
        flags: { [MODULE_ID]: { comms: channel } },
    });
}

/** Dialog for macros. */
export async function prompt() {
    const options = Object.keys(CHANNELS)
        .map((k) => `<option value="${k}">${L(CHANNELS[k].label)}</option>`)
        .join("");
    const result = await DialogV2.input({
        window: { title: L("Comms.DialogTitle"), icon: "fa-solid fa-tower-broadcast" },
        content: `<div class="form-group"><label>${L("Comms.Channel")}</label><select name="channel">${options}</select></div>
<div class="form-group"><label>${L("Comms.From")}</label><input type="text" name="from"></div>
<div class="form-group stacked"><label>${L("Comms.Message")}</label><textarea name="text" rows="5"></textarea></div>`,
        ok: { label: L("Comms.Send"), icon: "fa-solid fa-paper-plane" },
    });
    if (!result || typeof result !== "object" || !result.text) return null;
    return send(result);
}

export function initComms() {
    Hooks.on("chatMessage", (_log, text) => {
        const parsed = parseCommsCommand(text ?? "");
        if (!parsed) return true;
        if (parsed.channel === "alert" && !game.user.isGM) {
            ui.notifications.warn(L("Comms.GMOnly"));
            return false;
        }
        send(parsed);
        return false;
    });
}

