# Carmina Git Sync

A conservative Obsidian GitHub sync plugin for **Carmina et Sententiae**.

This repository is a fork in the Git Sync / `github-valut-sync` family. It keeps the mobile-safe `isomorphic-git` approach and several fixes from downstream contributors, but changes the synchronization contract deliberately:

> **GitHub is canonical. Obsidian is a working copy.**

## Alpha safety model

Version **0.2.0 alpha** does not try to behave like Dropbox.

- connects to an **existing** GitHub repository; it never creates `obsidian-*`;
- repository owner, repository name and branch are explicit settings;
- default target is `timurspace/carmina-et-sententiae`, branch `main`;
- Pull is fetch + **fast-forward only**;
- Push is an explicit user action;
- Push always fetches first and refuses when GitHub has moved incompatibly;
- no automatic merge;
- no force-push;
- no push on file save;
- no push on Obsidian close;
- optional Pull on open is enabled by default;
- rename/delete are discovered from the complete Git status at Push time, not from a fragile event queue.

If local and remote histories diverge, the plugin stops and asks the user to choose a recovery path.

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
1. fetches current GitHub state;
2. refuses to continue if GitHub moved incompatibly;
3. stages all non-excluded local changes, including rename/delete;
4. creates one commit if needed;
5. pushes without force.

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
