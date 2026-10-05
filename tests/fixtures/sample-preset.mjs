// Generic test fixture (original content) shaped like a cinematic starship scene preset.
export const samplePreset = {
    id: "test-chase",
    name: "Test Chase",
    group: "Tests",
    setup: [
        { label: "Prepared", mod: { label: "Prepared", value: 1, type: "item" } },
        { label: "Damaged", mod: { label: "Damaged", value: -1, type: "circumstance" } },
    ],
    scene: {
        name: "Test Chase",
        level: 2,
        victory: { mode: "hpOrVp", vp: 0, vpTarget: 5, vpLabel: "Escape Points", text: "Escape or destroy the pursuer." },
        ship: {
            name: "Test Explorer",
            ac: 15, fort: 10, ref: 6, will: 4,
            hp: { value: 26, max: 26 },
            shields: { value: 5, max: 5, regen: 3 },
            npcCrew: { name: "Ship VI", mod: 7 },
            roles: [
                { name: "Engineer", skill: "crafting" },
                { name: "Gunner 1", skill: "perception" },
                { name: "Pilot", skill: "piloting" },
            ],
            weapons: [{ name: "Laser", role: "gunner", damage: "1d6+3", damageType: "fire" }],
            actions: [
                { name: "Dodge Debris", role: "pilot", checks: [{ skill: "piloting", dc: 15 }], outcomes: { success: { setFlag: "dodge" }, criticalSuccess: { setFlag: "dodge" } } },
                { name: "Repair", role: "engineer", checks: [{ skill: "crafting", dc: 15 }, { skill: "athletics", dc: 18 }], outcomes: { criticalSuccess: { heal: "2d8", clearPersistent: true }, success: { heal: "2d8" } } },
                { name: "Evade", role: "pilot", checks: [{ skill: "piloting", dc: 15 }, { skill: "perception", dc: 18 }], outcomes: { criticalSuccess: { vp: 2 }, success: { vp: 1 }, criticalFailure: { vp: -1 } } },
            ],
        },
        threats: [
            {
                name: "Pursuer", ac: 18, fort: 12, ref: 6, will: 0,
                hp: { value: 50, max: 50 }, shields: { value: 5, max: 5, regen: 5 }, init: { skill: "Arcana", mod: 14 },
                steps: [
                    { name: "Scan", kind: "check", mod: 14, vs: "will", target: "ship", onSuccess: { offGuard: true } },
                    { name: "Beam", kind: "strike", mod: 9, damage: "2d6+3", damageType: "void", target: "ship" },
                ],
            },
            {
                name: "Debris", ac: 0, fort: 0, ref: 0, will: 0, hp: { value: 0, max: 0 }, shields: { value: 0, max: 0, regen: 0 }, init: { skill: "Stealth", mod: 5 },
                steps: [{ name: "Debris", kind: "basicSave", save: "ref", dc: 15, damage: "1d6", targets: "all", skipIfFlag: "dodge" }],
            },
        ],
    },
};
