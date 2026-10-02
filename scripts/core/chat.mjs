import { MODULE_ID } from "./constants.mjs";
import { escapeHTML, warn } from "./foundry.mjs";

/**
 * Chat cards with clickable buttons. Buttons carry data-sfk-action; handlers are registered by feature modules.
 * Handler signature: (message, button, event) => void
 */
const actions = new Map();

export function registerCardAction(name, fn) {
    actions.set(name, fn);
}

export function initChat() {
    Hooks.on("renderChatMessageHTML", (message, html) => {
        const card = html.querySelector(".sfk-card");
        if (!card) return;
        for (const button of card.querySelectorAll("button[data-sfk-action]")) {
            // Owner/GM-gated buttons are hidden for everyone else
            const gate = button.dataset.gate;
            if (gate === "gm" && !game.user.isGM) button.hidden = true;
            if (gate === "owner" && !(message.isAuthor || game.user.isGM)) button.hidden = true;
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const fn = actions.get(button.dataset.sfkAction);
                if (!fn) return warn("No card action", button.dataset.sfkAction);
                button.disabled = true;
                try {
                    await fn(message, button, event);
                } finally {
                    button.disabled = false;
                }
            });
        }
    });
}

/**
 * Build card HTML.
 * @param {object} p
 * @param {string} p.title
 * @param {string} [p.icon] font-awesome class
 * @param {string} [p.variant] css modifier: info | warn | alert | comm | ai | ship | econ
 * @param {string} [p.body] trusted HTML
 * @param {{action:string,label:string,icon?:string,gate?:string,data?:object}[]} [p.buttons]
 */
export function cardHTML({ title, icon = "fa-solid fa-satellite-dish", variant = "info", body = "", buttons = [] }) {
    const btns = buttons
        .map((b) => {
            const data = Object.entries(b.data ?? {})
                .map(([k, v]) => `data-${k}="${escapeHTML(v)}"`)
                .join(" ");
            const ico = b.icon ? `<i class="${b.icon}"></i> ` : "";
            return `<button type="button" data-sfk-action="${b.action}" data-gate="${b.gate ?? ""}" ${data}>${ico}${escapeHTML(b.label)}</button>`;
        })
        .join("");
    return `<div class="sfk-card sfk-${variant}">
  <header class="sfk-card-header"><i class="${icon}"></i><span>${escapeHTML(title)}</span></header>
  <div class="sfk-card-body">${body}</div>
  ${btns ? `<footer class="sfk-card-buttons">${btns}</footer>` : ""}
</div>`;
}

/** Create a chat card message. */
export async function postCard(card, { speaker, whisper, flags = {}, sound } = {}) {
    const data = {
        content: cardHTML(card),
        speaker: speaker ?? { alias: "SFK" },
        flags: { [MODULE_ID]: { card: true, ...flags } },
    };
    if (whisper?.length) data.whisper = whisper;
    if (sound) data.sound = sound;
    return ChatMessage.create(data);
}
