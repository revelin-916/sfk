// Minimal Foundry/sf2e stubs for exercising SFK modules under node:test.
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(a, b) { const o = structuredClone(a); for (const [k, v] of Object.entries(b ?? {})) o[k] = isObj(v) && isObj(o[k]) ? merge(o[k], v) : structuredClone(v); return o; }
let rid = 0;
const store = new Map();
const chat = [];
String.prototype.slugify = function () { return this.toLowerCase().replace(/[^a-z0-9]+/g, "-"); };
class Roll {
  constructor(f) { this.formula = f; }
  async evaluate() {
    let total = 0; this.dice = [];
    const f = this.formula.replace(/\s+/g, "");
    for (const m of f.matchAll(/([+-]?)(\d+)d(\d+)|([+-]?)(\d+)/g)) {
      if (m[2]) { let t = 0; for (let i = 0; i < +m[2]; i++) t += 1 + Math.floor(Math.random() * +m[3]); this.dice.push({ total: t }); total += (m[1] === "-" ? -t : t); }
      else total += (m[4] === "-" ? -1 : 1) * +m[5];
    }
    this.total = total; return this;
  }
  async toMessage(d) { chat.push(`[roll ${this.formula}=${this.total}] ${d.flavor ?? ""}`); }
}
globalThis.Roll = Roll;
const dialogAnswers = [];
globalThis.foundry = {
  utils: { mergeObject: (a, b, o = {}) => { const r = merge(a, b); if (o.inplace === false) return r; Object.assign(a, r); return a; }, deepClone: structuredClone, randomID: () => `id${++rid}`, saveDataToFile: () => {}, expandObject: (x) => x, setProperty() {} },
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (B) => B, DialogV2: { input: async () => dialogAnswers.shift() ?? null, confirm: async () => true } }, handlebars: { loadTemplates() {} } },
};
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
globalThis.ui = { notifications: { warn: (m) => chat.push(`WARN ${m}`), info() {}, error: (m) => chat.push(`ERR ${m}`) } };
globalThis.ChatMessage = { create: async (d) => { chat.push(d.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); } };
globalThis.CONFIG = { PF2E: { skills: {} } };
globalThis.game = {
  user: { isGM: true }, users: { filter: () => [] , activeGM: { isSelf: true } },
  settings: { get: (m, k) => store.get(k), set: async (m, k, v) => store.set(k, structuredClone(v)) },
  i18n: { localize: (k) => k, format: (k, d) => `${k} ${JSON.stringify(d)}` },
  actors: { get: () => null }, combat: null, pf2e: { Modifier: class { constructor(o) { Object.assign(this, o); } } },
};

export { chat, dialogAnswers, store };
