# Changelog

## 0.2.1 — 2026-10-05

- Fix: Area Fire / Auto-Fire areas could be left on the map with no obvious way to remove them (the system's
  area-attack chat card has no clear button, unlike spell cards). SFK now adds a **Clear area** button to that card
  and to the "Creatures in area" card.
- New setting **Clear Area Fire / Auto-Fire areas** (default: at the end of the attacker's turn).
- New macro **Clear Area Attack Templates** and API `SFK.combat.clearAreas()`.

## 0.2.0 — 2026-10-04

Content-pack support and a scripted starship engine.

- Starship presets: content modules register scenes on the `sfk.registerContent` hook; GM loads them from the
  tracker (with optional setup choices that apply a scene-wide check modifier). Crew assignments carry over by role.
- Scene export/import as JSON.
- Structured starship actions: crew rolls the role's skill vs DC through the system's check pipeline (all modifiers
  apply), then outcomes apply automatically (points, repairs, clearing persistent damage, flags).
- Ship weapons: gunner attack vs threat AC (off-guard and MAP aware), crit doubling, damage applied through shields.
- Threat routines: scripted steps (checks vs ship DCs, strikes, basic-save hazards with "avoided" flags).
- NPC crew member (e.g., a ship VI with a flat skill bonus) can fill roles.
- New victory mode: reduce threats to 0 HP *or* reach a points target; custom points name (e.g., Escape Points);
  automatic victory announcement.
- Comms contacts registry (`/comm <contact-id> | text` resolves names and channels); infosphere headline sets.
- `escapeHTML` no longer depends on the DOM.
- Tests: engine simulation under node:test with Foundry stubs.

## 0.1.0 — 2026-10-02

Initial scaffold targeting Foundry v14 + sf2e 1.5.x.

- Combat: Area Fire / Auto-Fire ammunition expenditure, area targeting and token selection, Suppressing Fire
  application and expiry, Glitching start-of-turn flat check, Untethered drift, low-ammo alerts, Solarian
  attunement lighting and chat flourish.
- Starship: Cinematic Starship Scene tracker (ship, crew roles, threats, shields/regen, persistent damage,
  victory modes, role initiative).
- Immersion: `/comm`, `/ai`, `/alert` transmissions; infosphere headline feed.
- Economy: credits ledger with CSV export; mission payout; faction standing.
- Tooling: eslint, node:test unit tests, fvtt-cli pack build, GitHub release workflow.
