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

## 2026-10-04 sparse Push incident

In the alpha.2 Android test, an intended edit to card 058 was pushed together with unintended deletions of canonical files that were absent from the reduced mobile working copy.

Corpus incident commit:

- `8a7c5f0c` — intended card edit plus unintended sparse-profile deletions.

Corpus recovery commit:

- `054f0dfa` — revert restoring the canonical files.

The root error was treating a missing working-copy path as sufficient evidence of deletion. In a reduced profile, absence can instead mean “not materialized on this device”.

The runtime fix adds two layers:

1. a direct guard against staging deletion for an out-of-profile path;
2. a fail-closed scan of the full Git status matrix before commit, blocking Push if any staged out-of-profile path differs from HEAD.

The detailed incident report is [`INCIDENT_2026-10-04_MOBILE_SPARSE_PUSH.md`](INCIDENT_2026-10-04_MOBILE_SPARSE_PUSH.md).

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

## Android validation for 0.2.1-alpha.1

### Confirmed

The current build has been installed through BRAT and exposes the new Read-only setting.

With Read-only enabled, Push is blocked.

With a local edit to card 058, Pull reports:

```text
fetched 054f0dfa
blocked by local changes: 01_Карточки/А. Ф. Лосев; А. А. Тахо-Годи/058 — Платон. Аристотель — краткая версия фрагмента.md
```

This confirms that Pull does not overwrite the local edit.

With Read-only disabled, Push reports:

```text
fetched 054f0dfa
pre-push relation=behind
```

This confirms that Push refuses to write when the local canonical branch is behind GitHub.

### Current state

The device has both:

- a local working-tree modification to card 058;
- a local canonical branch behind GitHub.

Pull therefore refuses to overwrite the card, while Push refuses to write over newer canonical history. This safety deadlock must be resolved explicitly; the plugin must not auto-merge it.

### Still required

The original deletion regression test remains pending:

1. preserve the local text of card 058;
2. deliberately resolve the local-change/behind state;
3. reach a clean local branch equal to GitHub;
4. confirm Mobile Profile is active;
5. make one controlled in-profile edit;
6. run Push with Read-only disabled;
7. inspect the GitHub commit.

Pass criteria:

- intended in-profile change only;
- no deletion of paths omitted by Mobile Profile;
- deleted out-of-profile canonical files = **0**.

If the plugin detects staged changes outside the active profile, Push must stop before commit/push.

Do not use **Excluded patterns** to hide card 058 as a way around the conflict. Exclusions and working-copy profiles have different responsibilities.
