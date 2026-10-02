import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("module.json", "utf8"));
const files = ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "scripts", "styles", "templates", "lang", "packs"];
execSync(`rm -f dist/sfk.zip && mkdir -p dist && zip -r dist/sfk.zip ${files.join(" ")} -x "packs/**/LOCK" "packs/**/LOG*"`, {
    stdio: "inherit",
});
console.log(`Packaged sfk v${version} -> dist/sfk.zip`);
