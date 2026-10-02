/**
 * Mission Payout: split a credit reward among selected party members, log the reason, and announce it.
 */
import { splitCredits } from "../core/logic.mjs";
import { L, escapeHTML, partyCharacters } from "../core/foundry.mjs";
import { postCard } from "../core/chat.mjs";
import { noteReason } from "./ledger.mjs";

const { DialogV2 } = foundry.applications.api;

export async function payout({ total, actorIds, reason = "" } = {}) {
    if (!game.user.isGM) return ui.notifications.warn(L("Notify.GMOnly"));
    const actors = actorIds.map((id) => game.actors.get(id)).filter(Boolean);
    const { share, remainder } = splitCredits(total, actors.length);
    if (!share) return ui.notifications.warn(L("Payout.Nothing"));
    for (const actor of actors) {
        noteReason(actor.id, reason || L("Payout.DefaultReason"));
        await actor.inventory.addCurrency({ credits: share });
    }
    const names = actors.map((a) => `<li>${escapeHTML(a.name)}: <b>${share}</b> cr</li>`).join("");
    await postCard({
        title: L("Payout.Title"),
        icon: "fa-solid fa-sack-dollar",
        variant: "econ",
        body: `${reason ? `<p><em>${escapeHTML(reason)}</em></p>` : ""}<ul>${names}</ul>${
            remainder ? `<p class="sfk-hint">${L("Payout.Remainder", { n: remainder })}</p>` : ""
        }`,
    });
}

export async function payoutDialog() {
    if (!game.user.isGM) return ui.notifications.warn(L("Notify.GMOnly"));
    const pcs = partyCharacters();
    const boxes = pcs
        .map((a) => `<label class="sfk-check"><input type="checkbox" name="pc.${a.id}" checked> ${escapeHTML(a.name)}</label>`)
        .join("");
    const result = await DialogV2.input({
        window: { title: L("Payout.Title"), icon: "fa-solid fa-sack-dollar" },
        content: `<div class="form-group"><label>${L("Payout.Total")}</label><input type="number" name="total" min="0" step="1" autofocus></div>
<div class="form-group"><label>${L("Payout.Reason")}</label><input type="text" name="reason" placeholder="${L("Payout.ReasonPlaceholder")}"></div>
<fieldset><legend>${L("Payout.Recipients")}</legend><div class="sfk-checklist">${boxes}</div></fieldset>`,
        ok: { label: L("Payout.Pay"), icon: "fa-solid fa-coins" },
    });
    if (!result) return;
    const data = foundry.utils.expandObject(result);
    const actorIds = Object.entries(data.pc ?? {})
        .filter(([, on]) => on)
        .map(([id]) => id);
    await payout({ total: Number(data.total) || 0, actorIds, reason: data.reason ?? "" });
}
