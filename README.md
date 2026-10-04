# Carmina Git Sync

A conservative Obsidian GitHub sync plugin for **Carmina et Sententiae**.

This repository is a fork in the Git Sync / `github-valut-sync` family. It keeps the mobile-safe `isomorphic-git` approach and several fixes from downstream contributors, but changes the synchronization contract deliberately:

> **GitHub is canonical. Obsidian is a working copy.**

## Alpha safety model

Version **0.2.x alpha** does not try to behave like Dropbox.

- connects to an **existing** GitHub repository; it never creates `obsidian-*`;
- repository owner, repository name and branch are explicit settings;
- default target is `timurspace/carmina-et-sententiae`, branch `main`;
- Pull is fetch + **fast-forward only**, with path-aware working-copy updates;
- Push is an explicit user action;
- optional **Read-only mode** blocks Push on a device while keeping Pull available;
- Push always fetches first and refuses when GitHub has moved incompatibly;
- no automatic merge;
- no force-push;
- no push on file save;
- no push on Obsidian close;
- optional Pull on open is enabled by default;
- rename/delete are discovered from the complete Git status at Push time, not from a fragile event queue.

If local and remote histories diverge, the plugin stops and asks the user to choose a recovery path. Local working-tree edits no longer block unrelated GitHub updates: Pull updates non-conflicting paths, preserves local-only edits, and asks before replacing a file changed both locally and on GitHub.

## Carmina Mobile Profile

Carmina Git Sync is designed for both a full repository checkout and reduced mobile working copies.

The mobile profile keeps Obsidian configuration and corpus-related files while avoiding unnecessary project development files on Android devices.

The full repository remains the canonical source on GitHub.

The `carmina-mobile` profile is implemented in the synchronization core. It materializes only the configured mobile paths and filters normal status/staging to those paths. In addition, Push performs a fail-closed check against the full Git status matrix before commit: if any staged path exists outside the active profile, Push stops and nothing is committed or pushed. Tracked files omitted from the Android working copy must never be converted into canonical GitHub deletions.

The alpha.2 sparse-deletion incident, root cause, fixes, release-versioning issue and current Android validation state are recorded in [`docs/INCIDENT_2026-10-04_MOBILE_SPARSE_PUSH.md`](docs/INCIDENT_2026-10-04_MOBILE_SPARSE_PUSH.md).

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

**Pull from GitHub** is the normal operation, especially after editing cards directly on GitHub. If a local file is unchanged, a newer GitHub version replaces it automatically. If a different file has a local edit, that local edit is preserved while GitHub changes are pulled. If the same path changed both locally and on GitHub, manual Pull asks whether to **Use GitHub**, **Keep local**, or cancel.

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

## Android validation history and 0.2.1-alpha.2 target

The current Android test build is `0.2.1-alpha.1`.

Confirmed on-device:

- BRAT installed the new build and the **Read-only mode** setting is present;
- with Read-only enabled, Push is blocked;
- Pull fetches the canonical remote but refuses to overwrite a locally modified card;
- with Read-only disabled, Push fetches first and refuses to proceed when the local branch is `behind`.

Observed Pull log with a local edit to card 058:

```text
fetched 054f0dfa
blocked by local changes: 01_Карточки/А. Ф. Лосев; А. А. Тахо-Годи/058 — Платон. Аристотель — краткая версия фрагмента.md
```

Observed Push log after disabling Read-only:

```text
fetched 054f0dfa
pre-push relation=behind
```

These are expected fail-safe stops. The Android vault currently has both a local modification to card 058 and a local branch behind canonical GitHub, so the plugin intentionally refuses to auto-merge or choose a winner.

The original sparse-deletion regression test is therefore **not yet complete**. It still requires a clean synchronized state followed by one controlled in-profile edit and a Push whose GitHub commit contains **zero out-of-profile deletions**.

Do not add card 058 to **Excluded patterns** to bypass this state. Exclusions are not a conflict-resolution mechanism.

See the full incident and validation record in [`docs/INCIDENT_2026-10-04_MOBILE_SPARSE_PUSH.md`](docs/INCIDENT_2026-10-04_MOBILE_SPARSE_PUSH.md).


### 0.2.1-alpha.2 / alpha.3 path-aware Pull validation

Release target: `0.2.1-alpha.2`.

This build changes the overly conservative alpha.1 Pull behavior. Validation must cover:

1. local card 058 modified; a different existing card such as 217 updated on GitHub → Pull updates 217 and preserves 058;
2. the same card modified both locally and on GitHub → manual Pull shows an explicit choice;
3. **Use GitHub** replaces the local conflicting file with the canonical GitHub version;
4. **Keep local** preserves the phone copy while still pulling unrelated GitHub changes;
5. a newly added in-profile card on GitHub appears locally;
6. no merge commit or force-push is created.


### 0.2.1-alpha.3 Android Pull performance fix

Alpha.2 introduced the correct path-aware Pull policy but its remote-change detection was too expensive on Android: it listed the entire repository and read blobs path-by-path to discover which paths changed. On the Carmina corpus this could leave Pull apparently spinning indefinitely.

Alpha.3 replaces that scan with an isomorphic-git tree walk comparing the two commit trees directly. It also handles remote add/remove transitions explicitly, which matters for the 217 → U217 replacement observed in the corpus.

During Pull the status bar now reports phases such as:

- Preparing repository
- Fetching GitHub
- Checking local changes
- Comparing GitHub changes
- Applying N GitHub change(s)

The functional policy from alpha.2 is unchanged: unrelated GitHub updates should apply while local-only edits are preserved, and same-path conflicts still require a choice during manual Pull.


### 0.2.1-alpha.4 working-copy reconciliation

Alpha.3 can complete a path-aware Pull, but an earlier interrupted/partial Pull may already have advanced the local Git branch while leaving stale files in the Android working copy. In that state a later Pull sees `local HEAD == GitHub` and, without an extra check, can incorrectly report that everything is current.

Alpha.4 treats the working copy as a separate state that must also match canonical GitHub:

- when HEAD equals GitHub and the mobile working copy is clean, Pull reports up to date;
- when HEAD equals GitHub but local profile paths differ, manual Pull asks whether to **Use GitHub** or **Keep local**;
- **Use GitHub** restores missing/stale files from canonical HEAD and removes stale local files that no longer exist in GitHub;
- **Keep local** preserves the phone copy.

This recovery path is intended to repair partial alpha.2/alpha.3 states without using the destructive **Adopt GitHub as canonical** command.
