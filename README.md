# SFK — Starfinder Foundry Kit

Automation and immersion layer for the **Starfinder Second Edition** system (`sf2e`) on **Foundry VTT v14**.

SFK complements the system rather than replacing it. Each feature targets a gap in sf2e 1.5.1 that was confirmed by reading the system source, so it shouldn't duplicate anything the system already automates.

| Requirement | Version |
|---|---|
| Foundry VTT | v14 (developed against 14.368) |
| Game system | Starfinder Second Edition (`sf2e`) ≥ 1.5.0 |

> **Status: v0.2.0, untested in a live world.** The code is linted and the rules math is unit-tested, but nothing has been run inside Foundry yet. Test it in a copy of your world first, and report anything that throws to the browser console (F12) with the `SFK |` prefix.

---

## Features

### Combat

| Feature | What the system does | What SFK adds |
|---|---|---|
| **Area Fire ammo** | Creates the Area Fire card. It doesn't spend ammo. | Spends the weapon's listed **expend**. Can be set to auto, prompt, or off. |
| **Auto-Fire ammo** | Creates the Auto-Fire card and cone. It doesn't spend ammo. | When you place the cone, SFK counts the creatures inside it and spends **2 × targets**. |
| **Area targeting** | Places the area. The save button rolls for whichever tokens are *selected*. | Lists the creatures caught in the area and targets them. A GM button selects them all so the system's **Roll saves** works in one click. |
| **Suppressing Fire** (Soldier) | Adds a roll note only. | Applies **Suppressed** to enemies who fail their Reflex save against the soldier's area attack. Removes it at the start of the soldier's next turn. |
| **Glitching** | Shows the condition and its toggleable penalty. | Rolls the start-of-turn **DC 5 + value** flat check and applies the result: critical success lowers the value, failure turns the penalty on, critical failure also adds Stunned 1. |
| **Untethered** | Shows the condition. | Tracks each token's last movement direction. At end of turn the GM gets a one-click **5-ft drift** in that direction. |
| **Low ammo / dead battery** | — | Whispers the owner when a magazine or battery falls below a set % or runs empty. Can play an optional sound. |
| **Solarian attunement** | Provides the `stellar-attunement` roll-option toggle. | Changes the token's light when the solarian attunes (photon = flare, graviton = violet vortex) and restores the original when they unattune. Posts an optional narrative card. |

### Starship Scenes (GM Core: Cinematic Starship Scenes)

The sf2e system has no starship support. SFK adds a **Starship Scene** tracker modeled on the GM Core scene stat-block format:

- **Party ship:** AC, Fort/Ref/Will, HP, and Shields with a per-round regen value. A bonuses / starship-actions text block.
- **Crew roles:** each role has a skill and an assigned PC.
  - **Roll Role Initiative** rolls each crewed role's skill and writes the result into the active encounter.
  - **Role check** rolls the role's skill against a DC you type in.
- **Threats:** full stats, an initiative skill and modifier, and a routine text block. Players see only HP and Shield bars.
- **Damage:** shields absorb damage first, then HP. Repair heals HP only.
- **Next Round:** resolves persistent damage, each with its own flat check (DC 15, or DC 10 with Assisted Recovery). Then shields regenerate and the round advances.
- **Victory tracking:** reduce threats to 0 HP, collect Victory Points, or survive N rounds.

**Scripted scenes (v0.2):** presets from content packs come with structured data:
- **Starship actions** roll the assigned crew member's skill against the DC through the system's check pipeline, then apply the outcome: points, repairs, clearing persistent damage, or flags such as "asteroids avoided".
- **Ship weapons** roll the gunner's attack against the threat's AC, accounting for off-guard and MAP. Critical hits double damage, and damage goes through shields first.
- **Threat routines** run with one click: scans against the ship's DCs, strikes, and basic-save hazards.
- **An NPC crew member** (such as a ship VI with a flat bonus) can fill a role.
- **Export and import** save any scene as a JSON file.

Default roles are Captain, Engineer, Gunner, Magic Officer, Pilot, and Science Officer. **The default skills on those roles are placeholders**, so set each role's skill from your scene's stat block.

### Immersion

- **Comms** chat commands:
  - `/comm Sender | message` sends an incoming transmission.
  - `/ai Name | message` speaks as the ship VI.
  - `/alert message` sends a GM-only priority alert.

  Transmissions get a typewriter reveal and scanlines. Alert and comms sounds are optional.
- **Infosphere feed:** broadcasts a random headline every N in-world hours. The 16 default headlines are original flavor text, and you can edit the list.

### Economy

- **Credits ledger:** logs every change to party characters' credits and UPB, with a reason, timestamp, and in-world time. Exports to CSV. Players see only their own characters' entries.
- **Mission Payout:** splits a credit reward evenly across the PCs you choose, logs it in the ledger with a reason, and reports any remainder.
- **Faction standing:** party-wide reputation with tiers you can edit, chat announcements, and factions you can hide from players.

---

## Content packs

Adventure-specific content ships as separate modules that register with SFK when the world loads:

```js
Hooks.once("sfk.registerContent", (sfk) => {
    sfk.starship.registerPreset({ id, name, group, setup: [...], scene: { ship, threats, victory, ... } });
    sfk.comms.registerContacts([{ id: "vi", name: "Ship VI", channel: "ai", group: "Crew" }]);
    sfk.infosphere.registerHeadlineSet("my-set", { label: "My Feed", lines: [...] });
});
```

See `tests/fixtures/sample-preset.mjs` for the full preset shape. A pack that copies stats from a published adventure is for **personal use only** and must stay out of public repositories.

## Install (development)

1. Copy this folder to `<FoundryData>/Data/modules/sfk` (the folder name must be `sfk`).
2. Restart Foundry, open your sf2e world, and enable **SFK — Starfinder Foundry Kit**.
3. Open **Compendium → SFK Macros** and drag the macros you want onto your hotbar.

## Install (manifest)

After you publish a GitHub release (see below), install from this manifest URL:
`https://github.com/revelin-916/sfk/releases/latest/download/module.json`

## Macros (compendium: SFK Macros)

Starship Scene · Starship: Next Round · Starship: Roll Role Initiative · Comms Transmission · Infosphere: Broadcast Headline · Infosphere: Edit Headlines · Mission Payout · Credits Ledger · Faction Standing · Glitching: Roll for Selected

## API

Everything is available at `game.modules.get("sfk").api`, also exposed as `globalThis.SFK`:

```js
SFK.starship.open(); SFK.starship.damage("ship", 12); SFK.starship.nextRound();
SFK.comms.send({ channel: "ai", from: "VESK-7", text: "Shields failing." });
SFK.economy.payout({ total: 1200, actorIds: [...], reason: "Salvage claim" });
SFK.combat.rollGlitching(actor);
```

## Development

```bash
npm install
npm run lint          # eslint
npm test              # node:test unit tests for rules math (tests/)
npm run build:packs   # compile packs-src/ JSON -> packs/ LevelDB
npm run package       # build packs + dist/sfk.zip
```

**Releasing:**
1. Replace `revelin-916` in `module.json`.
2. Push the repo.
3. Publish a GitHub release tagged `vX.Y.Z`.

The workflow stamps the version and URLs into the manifest, then attaches `module.json` and `sfk.zip` to the release.

### Layout

```
scripts/
  core/       constants, pure rules math (logic.mjs), settings, chat-card framework
  combat/     volley (area/auto-fire), suppression, conditions (glitching/untethered), ammo-watch, attunement
  starship/   scene state + operations, ApplicationV2 tracker
  immersion/  comms, infosphere
  economy/    ledger, payout, factions
templates/    Handlebars for the apps
packs-src/    macro compendium source (JSON)
tests/        unit tests for logic.mjs
```

## Known limits / judgment calls

- **Primary Target** (Soldier) isn't automated.
- **Suppression from two soldiers:** the condition records only the most recent soldier who suppressed the target, so it expires at the start of that soldier's next turn.
- **Persistent damage on starships** goes through shields first, the same as normal damage. GM Core doesn't say whether shields block persistent damage. Remove the persistent entry if your table rules otherwise.
- **Faction tiers** are a house default (Hostile → Allied) and aren't an official SF2e subsystem.
- **Area targeting** uses the system's own square-coverage test (`TokenDocument#testInsideRegion`), so walls and highlighted squares match what the system shows.

## License

MIT for the code. Starfinder is a trademark of Paizo Inc. This module contains no Paizo rules text. Mechanics are implemented by reference, and all flavor text is original.
