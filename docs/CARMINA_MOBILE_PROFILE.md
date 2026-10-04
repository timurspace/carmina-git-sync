# Carmina Mobile Profile

## Purpose

Carmina Git Sync supports a mobile working profile.

The Android Obsidian vault is not a complete clone of the repository.
The GitHub repository remains the canonical source.

## Canonical repository

The full repository contains:

- corpus;
- indexes;
- project documentation;
- schemas;
- development tools;
- CI configuration.

These layers remain available in GitHub.

## Mobile working copy

The intended mobile profile contains only files required for daily Obsidian usage.

Included:

- `.obsidian/**`
- `01_Карточки/**`
- `90_Индексы/**`
- `99_Служебное/Скрипты/Копировать для цитирования.md`

## Excluded mobile layers

The mobile profile does not require:

- `tools/**`
- `schema/**`
- `.github/**`
- project management documents;
- build and development files.

## Rules

- Excluded files are not deletions.
- Mobile synchronization must not remove excluded files from GitHub.
- Profile selection affects only the local working tree.
- GitHub remains the canonical repository.

## Current implementation

The `carmina-mobile` profile is implemented in the sync core.

Normal status/staging is restricted to profile paths. Push also performs a second, fail-closed safety check against the full Git status matrix immediately before commit. If any staged change exists outside the active profile, Push stops and no commit or push is attempted.

This second check is deliberate defense in depth: a file being absent from the Android working copy must never be sufficient evidence that it should be deleted from the canonical GitHub repository.

## Read-only mode

A device can enable **Read-only mode** under Safety settings.

In read-only mode:

- Pull remains available;
- Push is blocked before synchronization work begins;
- no stage/commit/push operation is performed by the explicit Push command.

Use read-only mode when the device should consume canonical GitHub changes but must not publish local changes.

## Android regression test for v0.2.0-alpha.3

1. Install the prerelease through BRAT.
2. Confirm the Mobile Profile is active.
3. Confirm canonical service/development files such as `.github/**` are absent locally.
4. Modify an in-profile card such as `01_Карточки/058.md`.
5. Run Push.
6. Inspect the resulting GitHub commit.

Expected result:

- the intended card is modified;
- files outside the Mobile Profile are not deleted;
- deleted canonical service files = 0.

If the plugin detects staged changes outside the active profile, Push must stop before commit/push.
