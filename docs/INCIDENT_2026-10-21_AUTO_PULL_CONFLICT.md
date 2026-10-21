# Incident: automatic Pull advanced past unresolved same-file edits (October 2026)

## Observed symptom

On Android a user observed a first Pull reporting changes without an updated
file; pressing Pull again showed **Use GitHub**. The observation is consistent
with the previous background `Pull on open` path, but device logs for the exact
reported sequence were not retained. The source-code failure modes were
independently reproduced in offline tests against the actual GitSync class.

## Root causes and risk

1. The automatic `triggerPull(false)` invoked
   `pullCanonical("keep-local")`. That policy is suitable for a user's
   **explicit** Keep local choice, but in an unattended run it could fast-forward
   local HEAD while preserving the previous working file on a path changed
   both locally and on GitHub. A later Push could treat that leftover file as
   a new local modification and recommit it, unintentionally reverting GitHub.
2. During fast-forward, the code called `git.checkout({ filepaths, force })`
   without a `ref`. The branch ref was intentionally updated *after*
   materializing files, so checkout used the **old HEAD** rather than the
   newly fetched commit. A clean remote UPDATE could therefore appear in
   logs but restore the old content. **Use GitHub** could also restore the
   old version. This was confirmed by failing offline regressions before
   the explicit-ref fix.
3. The local-change check only considered differences between HEAD and the
   working tree, not staged-only index differences, which could be replaced.

## Safety changes in 0.2.1-alpha.9

- Distinct `auto-keep-local` mode for unattended Pull and `keep-local` for
  manual, explicit conflict resolution.
- Automatic same-path conflicts stop **before any index, branch, or working
  tree update** and return a saved conflict list and explanatory log. The
  local branch stays behind, and the existing Push ancestry gate blocks
  upload until manual Pull resolves it.
- Manual Pull offers the conflict choice immediately. `Use GitHub` replaces
  the conflicted phone file. `Keep local` explicitly preserves the phone file
  and advances Git history so a later deliberate Push can publish it. Cancel
  leaves the files and refs unchanged.
- Checkout during normal fast-forward and conflict resolution uses the
  **explicit remote commit ref**, not the old HEAD. Rollback checkout uses the
  original local commit ref.
- Treat staged-only profile changes as dirty when computing conflicts.
- Background conflict state remains visible as `Needs attention`, rather than
  being misreported as a successfully completed Pull.

## Offline acceptance checks

The existing `tests/push-regression.test.cjs` builds and runs the actual
`src/sync/git-sync.ts` implementation with real Git objects, while disabling
all GitHub network operations. New tests cover:

- simultaneous edit on GitHub and Android: automatic Pull defers, HEAD and
  working file unchanged, subsequent Push blocked;
- first **manual** Pull detects that conflict and offers a decision;
- **Use GitHub** restores the actual remote blob;
- explicit **Keep local** preserves phone contents and permits a later
  deliberate Push; unrelated out-of-profile files and modes remain unchanged;
- unrelated GitHub changes still fast-forward and materialize correctly while
  retaining local edits to different paths;
- clean remote edits materialize on the **first** Pull;
- staged-only same-path edits also block automatic Pull and Push;
- manual conflict cancellation leaves local refs and files intact.

Unverified: an end-to-end Android UI acceptance test of the new version,
network interruption mid-apply, concurrent remote updates during the decision
dialog, and more complex renames. Do not infer those from offline tests.

## User guidance

Before installing alpha.9, disabling **Pull on open** is a reasonable
mitigation. Never use **Adopt GitHub as canonical** merely to solve a
conflict. If the same file differs between GitHub and Android, first review
both copies, then choose **Use GitHub** or **Keep local** deliberately.
