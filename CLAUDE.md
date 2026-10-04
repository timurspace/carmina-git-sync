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

At this stage the selector is **configuration/UI foundation only**. Sparse working-tree behavior is not yet implemented in `GitSync`. The intended mobile paths are defined in `src/sync/profiles.ts` and documented in `docs/CARMINA_MOBILE_PROFILE.md`.

Critical invariant for the future implementation:

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
2. stop if local working-tree changes would make the operation unsafe;
3. fast-forward only;
4. never create an automatic merge commit.

If histories diverge, stop and report it.

### Push

Push must:

1. fetch GitHub first;
2. refuse if the remote is ahead/diverged;
3. stage non-excluded local changes, including deletions;
4. create a commit only if needed;
5. verify local history is safely ahead;
6. push with `force: false`.

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

Do not confuse this mechanism with the future Carmina Mobile profile. A profile controls which canonical paths should be materialized in a device working copy; an exclusion controls paths ignored by Git operations.

## Naming and release files

Current plugin identity:

- manifest id: `carmina-git-sync`
- user-facing name: **Carmina Git Sync**
- manifest version: `0.2.0`

BRAT prereleases contain:

- `main.js`
- `manifest.json`
- `versions.json`

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
