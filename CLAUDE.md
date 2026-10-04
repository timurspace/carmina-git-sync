# CLAUDE.md

This file documents the current architecture and safety rules for **Carmina Git Sync**.

## What this is

Carmina Git Sync is an Obsidian plugin for the **Carmina et Sententiae** project.

Core contract:

> **GitHub is canonical. Obsidian is a working copy.**

The plugin runs on desktop and mobile, so Git and HTTP operations must remain compatible with Obsidian mobile.

## Commands

```bash
npm ci
npm run typecheck
npm run build
```

- `npm run typecheck` runs `tsc --noEmit`.
- `npm run build` creates the production `main.js` bundle.
- GitHub Actions runs typecheck + build on pull requests and relevant pushes.
- The release workflow can be triggered manually to create a BRAT prerelease.

## Current synchronization model

The current alpha is intentionally conservative:

- connects only to an **existing** GitHub repository;
- repository owner, name and branch are explicit settings;
- default target is `timurspace/carmina-et-sententiae`, branch `main`;
- Pull is fetch + **fast-forward only**;
- Push is an explicit user action;
- Push fetches first and refuses unsafe ancestry;
- no automatic merge;
- no force-push;
- no push-on-save event queue;
- optional Pull on open is enabled by default;
- rename/delete are discovered from Git status at Push time;
- **Adopt GitHub as canonical** is an explicit destructive recovery action.

Do not reintroduce the upstream Dropbox-like automatic-sync model without an explicit architectural decision.

## Mobile profile

A `syncProfile` setting exists with:

- `full`
- `carmina-mobile`

The settings UI exposes the selector.

The `carmina-mobile` profile is implemented in `GitSync`. The intended mobile paths are defined in `src/sync/profiles.ts` and documented in `docs/CARMINA_MOBILE_PROFILE.md`.

Critical invariant for the current implementation:

> Paths excluded by the mobile working profile are absent locally, not deleted canonically.

A mobile Push must therefore never stage profile-excluded tracked paths as deletions.

## Architecture

- **`src/main.ts`** — plugin lifecycle, settings orchestration, commands, pull-on-open, operation notices/log modal.
- **`src/sync/git-sync.ts`** — conservative Git operations using isomorphic-git: attach existing remote, Pull, explicit Push, adopt remote canonical.
- **`src/sync/fs-adapter.ts`** — Obsidian `DataAdapter` bridge for isomorphic-git.
- **`src/sync/profiles.ts`** — working-copy profile definitions.
- **`src/auth/github-device.ts`** — GitHub OAuth Device Flow.
- **`src/github/api.ts`** — GitHub REST helpers.
- **`src/ui/settings-tab.ts`** — settings UI.
- **`src/ui/status-bar.ts`** — status bar; click triggers Pull.

Legacy conflict/queue modules may remain in the repository lineage, but they are not the active synchronization contract of the current alpha unless referenced by current code.

## Git safety invariants

### Pull

Pull must:

1. fetch GitHub;
2. fast-forward only; never create an automatic merge commit;
3. compare local working-tree changes with paths changed between local HEAD and remote HEAD;
4. automatically materialize remote changes for paths without local edits;
5. preserve local-only edits while applying unrelated GitHub changes;
6. require an explicit choice before overwriting a path changed both locally and on GitHub during manual Pull;
7. use the safe keep-local policy for same-path conflicts during automatic Pull on open.

If histories diverge, stop and report it.

### Push

Push must:

1. stop before sync work if device Read-only mode is enabled;
2. fetch GitHub first;
3. refuse if the remote is ahead/diverged;
4. stage only allowed profile/non-excluded local changes;
5. inspect the full Git status matrix before commit and abort if any staged path exists outside the active sync profile;
6. create a commit only if needed;
7. verify local history is safely ahead;
8. push with `force: false`.

Never silently resolve divergence.

### Adopt GitHub as canonical

This action is intentionally destructive and must remain explicit. It repoints the configured local branch to the fetched GitHub branch and checks out canonical tracked content.

Do not weaken its confirmation UX.

## Hard mobile constraints

- All HTTP goes through Obsidian `requestUrl`, not browser `fetch`/axios.
- All filesystem access goes through Obsidian `DataAdapter`; do not use Node `fs` in runtime code.
- `buffer` is bundled for mobile compatibility.
- Keep Node-only modules out of the runtime bundle.
- Mobile-only failures should be diagnosable through the in-app operation log/modal rather than relying on a desktop console.

## Authentication

OAuth uses GitHub Device Flow.

The OAuth Client ID is a **runtime user setting**. Do not introduce a client secret or CI/build-time OAuth secret.

The current scope is `repo` because the canonical Carmina repository is private.

## Exclusions

`excludePatterns` are independent from working-copy profiles.

The default is:

```text
.obsidian/*
```

These patterns prevent paths from being staged/pushed by normal synchronization.

Do not confuse this mechanism with the Carmina Mobile profile. A profile controls which canonical paths are materialized in a device working copy; an exclusion controls paths ignored by Git operations.

## Naming and release files

Current plugin identity:

- manifest id: `carmina-git-sync`
- user-facing name: **Carmina Git Sync**
- manifest version: `0.2.1-alpha.2`

BRAT prereleases contain:

- `main.js`
- `manifest.json`
- `versions.json`

Release invariant:

- the release tag must exactly equal `manifest.json.version`;
- `versions.json` must contain the released version;
- a prerelease must compare newer than the version already installed by testers.

The release workflow enforces tag/manifest equality. This was added after `v0.2.0-alpha.3` was published while the bundled manifest still reported `0.2.0`, so BRAT did not offer the fixed build as an update. The current Android validation release is `0.2.1-alpha.1`.

The npm package name is inherited and is not the plugin identity.

## Before changing sync behavior

For any behavioral change:

1. read `README.md`;
2. read `docs/CARMINA_MOBILE_PROFILE.md` when profiles are involved;
3. inspect current `src/main.ts` and `src/sync/git-sync.ts`;
4. keep changes narrow and atomic;
5. run `npm run typecheck`;
6. run `npm run build`;
7. do not mix unrelated reformatting into functional changes.

For sparse/mobile work specifically, test the deletion invariant before merging: excluded canonical files must not appear as local deletions during Push.

## 2026-10-04 mobile sparse Push incident

The alpha.2 Android test exposed a critical sparse-working-copy bug: an intended edit to card 058 was committed together with deletions of canonical files that were merely absent from the Mobile Profile working copy.

Corpus incident/recovery:

- `8a7c5f0c` — faulty Push commit;
- `054f0dfa` — revert restoring canonical files.

Runtime hardening in PR #7 added:

1. an out-of-profile sparse-deletion guard;
2. a full Git status-matrix check that fails closed if any out-of-profile path is staged;
3. persistent Read-only mode blocking explicit Push before sync work.

Important implementation detail: `statusRows()` is already profile-filtered. Therefore the full-matrix pre-commit check is the defense-in-depth control that catches unsafe staged state outside the profile.

Current Android validation with `0.2.1-alpha.1`:

- Read-only Push block confirmed;
- Pull with a local edit to card 058 fetches `054f0dfa` and stops with `blocked by local changes`;
- with Read-only disabled, Push fetches `054f0dfa` and stops at `pre-push relation=behind`;
- no automatic merge or force-push is attempted.

The alpha.1 test also exposed an overly broad Pull guard: one local edit blocked unrelated GitHub updates from being materialized. Version `0.2.1-alpha.2` replaces that global block with path-aware Pull while retaining fast-forward-only history and explicit same-file conflict handling.

The final clean-state sparse-deletion regression test has **not yet passed**. Do not record the incident as fully closed until a clean synchronized Mobile Profile Push changes the intended in-profile file and produces zero out-of-profile deletions.

Full record: `docs/INCIDENT_2026-10-04_MOBILE_SPARSE_PUSH.md`.
## Read-only safety mode

The persistent `readOnly` setting is a device-level write guard. When enabled, the explicit Push command must return before invoking the sync engine. Pull remains allowed.

This is a safety feature, not a substitute for sparse-profile invariants. Even with read-only disabled, Mobile Profile Push must still fail closed if staging contains any out-of-profile path.
