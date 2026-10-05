# Putting SFK on GitHub (Windows)

## 0. One-time tools
- Install **Git for Windows**: https://git-scm.com/download/win (accept the defaults).
- Optional: install the **GitHub CLI** with `winget install GitHub.cli`, then sign in with `gh auth login`.

## 1. Create the empty repo
1. On GitHub, click **+** → **New repository**.
2. Name it `sfk` and make it **Public**. This lets Foundry download releases without logging in.
3. **Don't** add a README, .gitignore, or license; the repo already has them.
4. Click **Create repository**.

## 2. Put the code where Foundry loads it
Unzip `sfk-v0.2.0-repo.zip` into your Foundry data folder so the result is:
```
<FoundryData>\Data\modules\sfk\module.json
```
To find FoundryData, go to Foundry's **Setup → Configuration → User Data Path**. The zip already contains the git history (`.git`), so the folder is a ready-made repo. Foundry ignores the extra dev files.

## 3. Point the manifest at your account
Already done: `module.json` points at `github.com/revelin-916/sfk`. Skip this step.

## 4. Push
Open a terminal in that folder (in Explorer, Shift+right-click → *Open in Terminal*):
```powershell
git add module.json
git commit -m "Set GitHub URLs"
git remote add origin https://github.com/revelin-916/sfk.git
git push -u origin main
```
The first push opens a browser window to sign you in.

## 5. Allow the release workflow to upload files
Go to the repo's **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**, then Save.

## 6. Publish a release
1. Go to the repo's **Releases** → **Draft a new release**.
2. Under **Choose a tag**, type `v0.2.0` and choose *Create new tag*.
3. Give it the title `v0.2.0`, paste in the CHANGELOG entry, and click **Publish release**.

Publishing starts the GitHub Action. Watch it in the **Actions** tab; it takes about a minute. It runs lint and tests, stamps the version and URLs into `module.json`, builds the compendium, and attaches `module.json` and `sfk.zip` to the release.

## 7. Install from the manifest (other worlds, other people)
In Foundry, go to **Add-on Modules → Install Module** and paste this into Manifest URL:
```
https://github.com/revelin-916/sfk/releases/latest/download/module.json
```
You don't need this on the machine where you develop, because the folder from step 2 is already installed.

## Day-to-day after that
```powershell
git add -A
git commit -m "What changed"
git push
```
To ship a version:
1. Bump `"version"` in `module.json` and `package.json`.
2. Add a CHANGELOG entry.
3. Commit and push.
4. Publish a release tagged `vX.Y.Z`.

Foundry will then offer the update to every world that installed from the manifest.

If `git status` shows changes under `packs/`, those are from Foundry compacting the compendium database while it was open. They're harmless; discard them with `git checkout packs`. CI rebuilds the packs from `packs-src/` for every release anyway.

## The private GGW pack (`sfk-ggw`)
**Never push it to a public repo.** It contains stats from a paid adventure.
- **To install:** unzip it to `<FoundryData>\Data\modules\sfk-ggw` and enable it after SFK.
- **For a backup:** create a **Private** GitHub repo named `sfk-ggw` and push it the same way as step 4.
- **Don't** add a manifest or release for it. Foundry can't download from private repos without authentication, so copy the folder by hand to update it.
