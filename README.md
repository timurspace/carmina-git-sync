# Carmina Git Sync

A conservative Obsidian GitHub sync plugin for **Carmina et Sententiae**.

This repository is a fork in the Git Sync / `github-valut-sync` family. It keeps the mobile-safe `isomorphic-git` approach and several fixes from downstream contributors, but changes the synchronization contract deliberately:

> **GitHub is canonical. Obsidian is a working copy.**

## Alpha safety model

Version **0.2.x alpha** does not try to behave like Dropbox.

- connects to an **existing** GitHub repository; it never creates `obsidian-*`;
- repository owner, repository name and branch are explicit settings;
- default target is `timurspace/carmina-et-sententiae`, branch `main`;
- Pull is fetch + **fast-forward only**;
- Push is an explicit user action;
- optional **Read-only mode** blocks Push on a device while keeping Pull available;
- Push always fetches first and refuses when GitHub has moved incompatibly;
- no automatic merge;
- no force-push;
- no push on file save;
- no push on Obsidian close;
- optional Pull on open is enabled by default;
- rename/delete are discovered from the complete Git status at Push time, not from a fragile event queue.

If local and remote histories diverge, the plugin stops and asks the user to choose a recovery path.

## Carmina Mobile Profile

Carmina Git Sync is designed for both a full repository checkout and reduced mobile working copies.

The mobile profile keeps Obsidian configuration and corpus-related files while avoiding unnecessary project development files on Android devices.

The full repository remains the canonical source on GitHub.

The `carmina-mobile` profile is implemented in the synchronization core. It materializes only the configured mobile paths and filters normal status/staging to those paths. In addition, Push now performs a fail-closed check against the full Git status matrix before commit: if any staged path exists outside the active profile, Push stops and nothing is committed or pushed. Tracked files omitted from the Android working copy must never be converted into canonical GitHub deletions.

## Migration from an older Git Sync vault

An older plugin may have left a local `.git` history pointing at a different repository. The alpha will not merge that history automatically.

The settings include **Adopt GitHub as canonical**. This is deliberately destructive: after explicit confirmation it repoints the configured local branch to the current GitHub branch and checks out GitHub's tracked files.

Back up the vault before using this migration action.

## Install for testing

The intended alpha channel is **BRAT**, not the Obsidian Community Plugins directory.

1. Install BRAT from Obsidian Community Plugins.
2. Add this repository as a beta plugin:
   `https://github.com/timurspace/carmina-git-sync`
3. Enable **Carmina Git Sync** in Community Plugins.

BRAT installation is easiest after this repository has a GitHub prerelease containing:
- `main.js`
- `manifest.json`
- `versions.json`

To create a test prerelease without a local development environment:

1. open **Actions → Release Obsidian Plugin** in this repository;
2. choose **Run workflow**;
3. enter the prerelease tag, for example `0.2.1-alpha.1`;
4. wait for the workflow to finish.

The workflow typechecks and builds the plugin, verifies that the release tag exactly matches `manifest.json` version, then creates a GitHub prerelease with the three BRAT assets. Each prerelease must use a version greater than the previously installed version; do not publish a prerelease such as `0.2.0-alpha.N` after clients have installed `0.2.0`.

## GitHub OAuth setup

Authentication uses GitHub OAuth Device Flow. Each tester supplies their own OAuth App Client ID; no client secret is embedded in the plugin.

Create a GitHub OAuth App once:

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Choose any suitable application name.
3. Homepage URL: this repository URL or `https://obsidian.md`.
4. Callback URL can be `https://obsidian.md` because Device Flow does not use the callback.
5. Enable **Device Flow**.
6. Copy the Client ID into **Settings → Carmina Git Sync → OAuth Client ID**.

The plugin currently requests the `repo` OAuth scope because the canonical Carmina repository is private.

## First connection

In Obsidian:

1. enter the OAuth Client ID;
2. connect GitHub and approve the device code;
3. confirm:
   - owner: `timurspace`
   - repository: `carmina-et-sententiae`
   - branch: `main`
4. press **Apply / connect**.

If the local Git history is unrelated to the canonical repository, normal attachment stops. Only then consider **Adopt GitHub as canonical**, after a backup.

## Daily use

**Pull from GitHub** is the normal operation, especially after editing cards directly on GitHub.

**Push local changes** is deliberate. It:
1. stops immediately when **Read-only mode** is enabled;
2. fetches current GitHub state;
3. refuses to continue if GitHub moved incompatibly;
4. stages only allowed profile/non-excluded local changes;
5. checks the full staging matrix and aborts if any staged path exists outside the active sync profile;
6. creates one commit if needed;
7. pushes without force.

The status-bar item triggers Pull, not Push.

## Development

```bash
npm ci
npm run typecheck
npm run build
```

The production build writes `main.js`.

A GitHub Actions workflow runs typecheck + build for pull requests and alpha/main pushes. Tagged builds create prereleases suitable for BRAT testing.

## Upstream and license

Based on **Git Sync** by Livan Kumar (`livan116/github-valut-sync`) under the MIT License, with inherited fixes from the fork lineage including JiaPeng1234's mobile/sync work.

The original MIT license is preserved in `LICENSE`.

This fork is currently project-specific experimental software; it is **not** submitted to the official Obsidian Community Plugins directory.

## 0.2.1-alpha.1 validation

This prerelease is intended to validate the Mobile Profile deletion fix on Android.

Recommended order:

1. install `0.2.1-alpha.1` through BRAT;
2. enable **Read-only mode** first and confirm that Pull works while Push is blocked;
3. disable Read-only mode only for the regression test;
4. modify one in-profile card such as `01_Карточки/058.md`;
5. run Push;
6. verify the resulting GitHub commit changes the intended card and reports **zero deletions** for files omitted by the Mobile Profile.

If Push detects any staged path outside the active sync profile, it must stop before commit/push.
