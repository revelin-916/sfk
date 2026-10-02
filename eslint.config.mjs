import globals from "globals";

const foundryGlobals = Object.fromEntries(
    ["foundry", "game", "canvas", "ui", "CONFIG", "CONST", "Hooks", "ChatMessage", "Actor", "Roll", "fromUuid", "fromUuidSync"].map((g) => [g, "readonly"]),
);

export default [
    {
        files: ["scripts/**/*.mjs"],
        languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.browser, ...foundryGlobals } },
        rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }], "no-undef": "error", "prefer-const": "error", eqeqeq: ["error", "smart"] },
    },
    {
        files: ["tests/**/*.mjs", "tools/**/*.mjs"],
        languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node },
    },
];
