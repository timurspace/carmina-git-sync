# Incident report: Android Mobile Profile sparse Push deletion

Date: **2026-10-04**

Status: **runtime fix released; Android regression validation still in progress**

Affected test channel:

- `v0.2.0-alpha.2` — incident reproduced;
- `v0.2.0-alpha.3` — runtime fix released, but BRAT did not offer it as an update because its bundled `manifest.json` still reported `0.2.0`;
- `0.2.1-alpha.1` — first Android validation build with corrected BRAT-visible versioning;
- `0.2.1-alpha.2` — path-aware Pull follow-up: unrelated GitHub changes can update while local-only edits are preserved.

## Summary

The Android `carmina-mobile` working profile intentionally omits repository paths that are not needed in the mobile Obsidian vault.

During a Push from the alpha.2 build, files that were **absent from the mobile working copy** were interpreted as deletions and included in the GitHub commit together with the intended card edit.

That behavior violated the central invariant of the mobile profile:

> A path absent from the mobile working copy is not evidence that the canonical GitHub file should be deleted.

The accidental canonical deletions were reverted immediately. The plugin was then hardened in several layers before Android testing resumed.

## Incident

The test scenario was:

1. use the Android Mobile Profile;
2. edit the in-profile card
   `01_Карточки/А. Ф. Лосев; А. А. Тахо-Годи/058 — Платон. Аристотель — краткая версия фрагмента.md`;
3. run Push.

The resulting corpus commit was:

- `8a7c5f0c` — intended card change plus unintended deletions of files omitted from the mobile profile.

The corpus repository was restored by:

- `054f0dfa` — revert of the accidental sparse-mobile Push commit.

The plugin was disabled while the failure mode was investigated.

## Root cause

The failure was in the Push staging path in `src/sync/git-sync.ts`.

A tracked path with `workdir === 0` could be passed to `git.remove(...)`. In a reduced working copy, however, `workdir === 0` is not by itself sufficient evidence of a user deletion: the path may simply be outside the active mobile profile and therefore intentionally absent locally.

The first proposed sparse-deletion guard was:

```ts
if (workdir === 0) {
  if (!this.isProfilePath(filepath)) {
    log(`skipped sparse deletion: ${filepath}`);
    continue;
  }

  await git.remove({ fs: this.fs, dir: this.dir, filepath });
}
```

During review, another important detail was found: normal `statusRows()` are already filtered to active profile paths. That means this guard is useful as a local invariant, but by itself it is not sufficient defense against an already-staged out-of-profile change.

The fix therefore became deliberately fail-closed and layered.

## Runtime fixes

### 1. Sparse-deletion guard

Push refuses to treat an out-of-profile missing path as a deletion.

This protects the direct deletion-staging path and documents the intended invariant in code.

### 2. Full staging-matrix fail-closed check

Immediately before commit, Push now inspects the **full** Git status matrix, not only profile-filtered rows.

If any staged path outside the active sync profile differs from HEAD, Push stops before commit/push:

```ts
const fullMatrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });
const unsafeStagedPaths = fullMatrix
  .filter(([filepath, head, , stage]) => !this.isProfilePath(filepath) && stage !== head)
  .map(([filepath]) => filepath);
```

If `unsafeStagedPaths` is non-empty:

- no commit is created;
- no Push is attempted;
- the operation reports the out-of-profile staged paths.

This is the primary defense-in-depth control for the original incident class.

### 3. Read-only mode

A persistent **Read-only mode** was added under Safety settings.

When enabled:

- Pull remains available;
- explicit Push returns before entering the sync engine;
- no fetch/stage/commit/push sequence is started by the Push command.

Read-only mode is a device-level operational guard. It is not a replacement for the sparse-profile invariants.

### 4. Existing ancestry protections retained

Push still:

1. fetches GitHub first;
2. computes the local/remote relation;
3. stops on `behind` or `diverged`;
4. never auto-merges;
5. never force-pushes.

Pull remains fast-forward only. Starting with `0.2.1-alpha.2`, unrelated local changes no longer block the entire Pull: remote-only paths update automatically, local-only edits are preserved, and a same-path local/remote change requires an explicit decision before overwrite during manual Pull.

## Release/versioning problem discovered during the fix

The first repaired release was published as `v0.2.0-alpha.3`, but its bundled `manifest.json` still reported version `0.2.0`.

That caused two problems:

1. BRAT did not see alpha.3 as newer than an installed plugin reporting `0.2.0`;
2. under SemVer, `0.2.0-alpha.3` is also lower than the final-looking `0.2.0`.

The release/version contract was therefore corrected:

- current test version: `0.2.1-alpha.1`;
- `manifest.json` reports `0.2.1-alpha.1`;
- `versions.json` contains the same version;
- the release tag must exactly match `manifest.json.version`;
- the release workflow fails if they differ.

This prevents future BRAT prereleases from being published with a tag/version mismatch.

## Pull request and release history

Runtime hardening:

- PR #7 — **Harden mobile push safety and add read-only mode**
- merged commit: `c55eebd0490930814615d2d13dac78b3362fff4d`

Documentation alignment:

- PR #8 — **Document alpha.3 mobile safety and read-only mode**
- merged commit: `c813b4c3fd565f3659d046c259b7b22247ad526f`

BRAT versioning correction:

- PR #9 — **Fix BRAT prerelease versioning**
- merged commit: `af1eeaf357afa9de6d21f78b2eab4010d42d42b0`

Current Android test release:

- `0.2.1-alpha.1`

## Android validation performed so far

The current `0.2.1-alpha.1` build has been installed through BRAT on the Android device.

### Confirmed: new build is installed

The settings UI shows **Read-only mode**, which was introduced by the runtime hardening change. This confirms the Android device is no longer running the old alpha.2 build.

### Confirmed: Read-only blocks Push

With Read-only mode enabled, Push is blocked as designed.

No GitHub write should be attempted from this command path.

### Confirmed: Pull does not overwrite a local card edit

The Android vault currently has a local edit to:

`01_Карточки/А. Ф. Лосев; А. А. Тахо-Годи/058 — Платон. Аристотель — краткая версия фрагмента.md`

Pull logs:

```text
fetched 054f0dfa
blocked by local changes: 01_Карточки/А. Ф. Лосев; А. А. Тахо-Годи/058 — Платон. Аристотель — краткая версия фрагмента.md
```

This is expected fail-safe behavior. Pull fetched the canonical remote state but did not fast-forward or overwrite the locally modified card.

### Confirmed: Push refuses when the local branch is behind GitHub

After Read-only mode was disabled, Push logged:

```text
fetched 054f0dfa
pre-push relation=behind
```

Push stopped before staging/commit/push because the canonical GitHub branch contains commits not yet incorporated into the local branch.

This is also expected fail-safe behavior.

### Current device state

The Android device is therefore in this state:

- GitHub/canonical branch is ahead of the local branch;
- card 058 has a local working-tree modification;
- Pull cannot fast-forward because it refuses to overwrite that local change;
- Push cannot proceed because the local branch is behind GitHub.

This is an intentional safety deadlock. The plugin does not auto-merge or choose which copy of card 058 should win.

## What has NOT yet been validated

The original regression test is **not yet complete**.

Still required:

1. preserve the current local text of card 058 outside the destructive recovery path;
2. resolve the local-change/behind state deliberately;
3. obtain a clean local branch equal to canonical GitHub;
4. confirm Mobile Profile is active;
5. make one controlled in-profile edit;
6. run Push with Read-only disabled;
7. inspect the resulting GitHub commit.

Pass criteria:

- the intended in-profile card change is present;
- no out-of-profile canonical file is deleted;
- in particular, omitted service/development paths such as `.github/**`, documentation, schema/tooling and other non-mobile files remain untouched;
- deleted out-of-profile files = **0**.

Until that exact test passes, the sparse deletion incident should be considered **fixed in code and partially validated, not fully closed**.

## Excluded patterns are not a conflict-resolution mechanism

Do **not** add card 058 to `Excluded patterns` merely to make Pull proceed.

`excludePatterns` and `syncProfile` solve different problems:

- the sync profile defines which canonical paths belong in the working copy;
- excluded patterns define paths ignored by normal staging/synchronization.

Excluding a locally modified corpus card would not resolve the local-vs-remote history state correctly and could hide a real unpublished edit.

## Safety invariants going forward

Any future change to mobile synchronization must preserve all of the following:

1. missing from Mobile Profile != deleted in GitHub;
2. Push must fetch first;
3. Push must stop on `behind` or `diverged`;
4. out-of-profile staged changes must block commit/push;
5. no force-push;
6. no automatic merge;
7. Pull must not overwrite a same-path local change without explicit user choice;
8. Read-only must remain an explicit device-level Push guard;
9. prerelease tag, `manifest.json.version` and `versions.json` must stay consistent.

## Related files

- `src/sync/git-sync.ts`
- `src/main.ts`
- `src/types.ts`
- `src/ui/settings-tab.ts`
- `src/sync/profiles.ts`
- `docs/CARMINA_MOBILE_PROFILE.md`
- `.github/workflows/release.yml`
- `manifest.json`
- `versions.json`


## Follow-up: path-aware Pull in 0.2.1-alpha.2

The first Android validation exposed a separate usability problem after the deletion incident was fixed.

Observed state:

- card 058 had a local phone edit;
- GitHub was ahead;
- another existing card, 217, had a newer canonical GitHub version;
- Pull fetched GitHub but stopped globally because 058 was dirty;
- therefore the unrelated newer 217 was not materialized locally.

This behavior was safe but too conservative for the canonical-GitHub workflow.

The 0.2.1-alpha.2 patch changes Pull from a vault-wide dirty check to a path-aware fast-forward:

- unchanged local path + changed GitHub path → GitHub version is materialized automatically;
- local-only changed path + unrelated GitHub changes → local edit is preserved and unrelated GitHub changes are materialized;
- same path changed locally and on GitHub → manual Pull asks whether to **Use GitHub** or **Keep local**; no content merge is attempted;
- automatic Pull on open uses **Keep local** for same-path conflicts and continues with unrelated changes.

The implementation updates the Git index to the fetched fast-forward target, materializes only allowed profile paths, and preserves local working-tree content for chosen local paths. The branch ref moves only after the working-copy/index update succeeds; failure attempts rollback to the previous local HEAD.

Validation target for alpha.2:

1. local 058 edited; GitHub 217 newer → 217 updates, 058 remains local;
2. same card changed on both sides → explicit conflict choice appears;
3. **Use GitHub** overwrites only the chosen conflicting local file;
4. **Keep local** preserves the local file while other GitHub changes still arrive;
5. newly added in-profile GitHub cards appear locally;
6. Push safety invariants from the original incident remain unchanged.


## Follow-up: alpha.2 Pull hang on Android

After releasing `0.2.1-alpha.2`, manual Pull on Android could remain in the pulling state without completing.

The repository connection itself was healthy: **Apply / connect** succeeded. The stall was therefore isolated to the new path-aware Pull processing after fetch.

The alpha.2 implementation discovered remote changes by:

1. listing every path in both commit trees;
2. taking the union of all repository paths;
3. reading the blob at both commits for each path sequentially.

For a repository with hundreds of corpus files on an Obsidian Android DataAdapter, that produced excessive Git object reads and could look like an indefinite hang even when only a small number of paths changed.

The real corpus state also included a remove/add transition for Mamardashvili 217, so alpha.3 additionally makes remote deletions explicit instead of relying on resetting an index path that no longer exists in the target tree.

### Alpha.3 correction

`0.2.1-alpha.3`:

- replaces blob-by-blob repository scanning with `git.walk` over `git.TREE(localHead)` and `git.TREE(remoteHead)`;
- returns only paths whose tree entries differ;
- updates removed paths by removing them from the index and, when not locally preserved, from the working copy;
- updates added/modified paths from the remote tree;
- keeps the alpha.2 same-path conflict policy unchanged;
- exposes Pull phases in the status bar for diagnosis.

The Android regression now includes the actual state that triggered the problem: local 058 edit plus GitHub-side 217/U217 changes and additional new corpus cards.


## Follow-up: stale working copy after HEAD already matched GitHub

After alpha.3 completed Pull, the Android vault still showed an obsolete Mamardashvili file named `217 — …`. The current canonical repository no longer contains that path; it contains `U217 — Лекция 1.md`.

The obsolete file itself already had frontmatter `id: U217` in the earlier canonical history, so the filename/frontmatter mismatch was a corpus defect that has since been corrected upstream. Its continued presence on Android therefore proved that the mobile working copy had not been fully reconciled.

A second state-model issue was identified: an earlier automatic or interrupted path-aware Pull can advance local Git HEAD to the canonical GitHub commit while preserving or leaving stale working-tree files. A later Pull then sees `HEAD == GitHub` and can incorrectly stop without repairing the working copy.

### Alpha.4 correction

`0.2.1-alpha.4` separates Git ancestry from working-copy state:

- Pull still fetches and checks ancestry;
- when local HEAD equals GitHub, it also checks profile-path working-tree differences;
- manual Pull prompts before replacing local differences;
- **Use GitHub** restores canonical files and removes stale local paths absent from HEAD;
- **Keep local** preserves local content.

This also provides a non-destructive recovery route for devices left in a partially materialized state by previous alpha builds.


## Follow-up: operation observability in alpha.5

During Android validation, Pull sometimes completed only after repeated user taps, and successful operations did not expose which files were actually materialized or removed.

`0.2.1-alpha.5` adds a persistent last-operation audit log with explicit file actions (`ADD`, `UPDATE`, `DELETE`, `RESTORE`, `KEEP LOCAL`) and blocks overlapping Pull/Push requests.

This does not change the canonical-state rules; it makes their actual effects visible and easier to verify.
