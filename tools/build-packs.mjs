import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { rm } from "node:fs/promises";

for (const name of ["sfk-macros"]) {
    await rm(`packs/${name}`, { recursive: true, force: true });
    await compilePack(`packs-src/${name}`, `packs/${name}`, { log: true });
}
