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

## Future implementation

The mobile profile should be implemented through a controlled working-tree mechanism (such as sparse checkout), not by deleting files manually.
