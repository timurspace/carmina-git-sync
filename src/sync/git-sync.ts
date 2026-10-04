import * as git from "isomorphic-git";
import { requestUrl, DataAdapter } from "obsidian";
import { createFsAdapter } from "./fs-adapter";
import { GIT_AUTHOR_EMAIL, GIT_AUTHOR_NAME } from "../constants";
import { GitOperationResult } from "../types";
import { pathMatchesProfile, SyncProfile } from "./profiles";

type Relation = "equal" | "behind" | "ahead" | "diverged";

const gitHttp = {
  async request({ url, method, headers, body }: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: AsyncIterableIterator<Uint8Array>;
  }) {
    let bodyBuffer: ArrayBuffer | undefined;
    if (body) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of body) chunks.push(chunk);
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      bodyBuffer = merged.buffer;
    }

    const response = await requestUrl({
      url,
      method,
      headers,
      body: bodyBuffer,
      throw: false,
    });

    async function* responseBody() {
      yield new Uint8Array(response.arrayBuffer);
    }

    return {
      url,
      method,
      statusCode: response.status,
      statusMessage: String(response.status),
      body: responseBody(),
      headers: response.headers as Record<string, string>,
    };
  },
};

export class GitSync {
  private fs: ReturnType<typeof createFsAdapter>;
  private dir: string;
  private token: string;
  private authUsername: string;
  private repoOwner: string;
  private repoName: string;
  private branch: string;
  private remoteUrl: string;
  private isExcluded: (filepath: string) => boolean;
  private syncProfile: SyncProfile;

  constructor(
    adapter: DataAdapter,
    vaultPath: string,
    token: string,
    authUsername: string,
    repoOwner: string,
    repoName: string,
    branch: string,
    isExcluded: (filepath: string) => boolean = () => false,
    syncProfile: SyncProfile = "full"
  ) {
    this.fs = createFsAdapter(adapter, vaultPath);
    this.dir = vaultPath;
    this.token = token;
    this.authUsername = authUsername;
    this.repoOwner = repoOwner;
    this.repoName = repoName;
    this.branch = branch;
    this.remoteUrl = `https://github.com/${repoOwner}/${repoName}.git`;
    this.isExcluded = isExcluded;
    this.syncProfile = syncProfile;
  }

  private gitOpts() {
    return {
      fs: this.fs,
      http: gitHttp,
      dir: this.dir,
      author: { name: GIT_AUTHOR_NAME, email: GIT_AUTHOR_EMAIL },
    };
  }

  private netOpts() {
    const token = this.token;
    const username = this.authUsername;
    return {
      ...this.gitOpts(),
      url: this.remoteUrl,
      onAuth: () => ({ username, password: token }),
      onAuthFailure: () => {
        throw new Error(
          "GitHub authentication failed. Reconnect the account in Carmina Git Sync settings."
        );
      },
    };
  }

  private result(
    success: boolean,
    changed: boolean,
    message: string,
    logs: string[],
    error?: string
  ): GitOperationResult {
    return { success, changed, message, logs, error };
  }

  async isInitialized(): Promise<boolean> {
    try {
      await git.resolveRef({ fs: this.fs, dir: this.dir, ref: "HEAD" });
      return true;
    } catch {
      return false;
    }
  }

  async hasLocalBranch(): Promise<boolean> {
    try {
      await git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref: this.branch,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureRepository(): Promise<void> {
    if (!(await this.isInitialized())) {
      await git.init({
        fs: this.fs,
        dir: this.dir,
        defaultBranch: this.branch,
      });
    }

    try {
      await git.deleteRemote({
        fs: this.fs,
        dir: this.dir,
        remote: "origin",
      });
    } catch {
      // origin did not exist
    }

    await git.addRemote({
      fs: this.fs,
      dir: this.dir,
      remote: "origin",
      url: this.remoteUrl,
    });
  }

  private async fetchRemote(log: (line: string) => void): Promise<string> {
    const response = await git.fetch({
      ...this.netOpts(),
      ref: this.branch,
      singleBranch: true,
    });

    if (response.fetchHead) {
      log(`fetched ${response.fetchHead.slice(0, 8)}`);
      return response.fetchHead;
    }

    const remoteHead = await git.resolveRef({
      fs: this.fs,
      dir: this.dir,
      ref: `refs/remotes/origin/${this.branch}`,
    });
    log(`fetched ${remoteHead.slice(0, 8)} via remote-tracking ref`);
    return remoteHead;
  }

  private async relation(localHead: string, remoteHead: string): Promise<Relation> {
    if (localHead === remoteHead) return "equal";

    try {
      if (
        await git.isDescendent({
          fs: this.fs,
          dir: this.dir,
          oid: remoteHead,
          ancestor: localHead,
        })
      ) {
        return "behind";
      }

      if (
        await git.isDescendent({
          fs: this.fs,
          dir: this.dir,
          oid: localHead,
          ancestor: remoteHead,
        })
      ) {
        return "ahead";
      }
    } catch {
      // A shallow or unrelated history can make ancestry unavailable.
    }

    return "diverged";
  }

  private isProfilePath(filepath: string): boolean {
    return pathMatchesProfile(filepath, this.syncProfile);
  }

  private async statusRows(): Promise<Array<[string, number, number, number]>> {
    const matrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });
    return matrix.filter(
      ([filepath]) => this.isProfilePath(filepath) && !this.isExcluded(filepath)
    ) as Array<[string, number, number, number]>;
  }

  private async changedPaths(): Promise<string[]> {
    const rows = await this.statusRows();
    return rows
      .filter(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1))
      .map(([filepath]) => filepath);
  }

  private async checkoutBranch(
    beforeHead: string | null,
    log: (line: string) => void
  ): Promise<void> {
    const afterHead = await git.resolveRef({
      fs: this.fs,
      dir: this.dir,
      ref: this.branch,
    });

    if (!beforeHead) {
      const tracked = await git.listFiles({ fs: this.fs, dir: this.dir, ref: afterHead });
      const materialized = tracked.filter((filepath) => this.isProfilePath(filepath));
      if (materialized.length > 0) {
        await git.checkout({
          fs: this.fs,
          dir: this.dir,
          ref: this.branch,
          force: true,
          filepaths: materialized,
        });
      }
      log(`checked out canonical branch; materialized ${materialized.length} profile path(s)`);
      return;
    }

    if (beforeHead === afterHead) return;

    const [before, after] = await Promise.all([
      git.listFiles({ fs: this.fs, dir: this.dir, ref: beforeHead }),
      git.listFiles({ fs: this.fs, dir: this.dir, ref: afterHead }),
    ]);

    const changed: string[] = [];
    for (const filepath of new Set([...before, ...after])) {
      if (!this.isProfilePath(filepath) || this.isExcluded(filepath)) continue;
      const [a, b] = await Promise.all([
        this.blobOidAt(beforeHead, filepath),
        this.blobOidAt(afterHead, filepath),
      ]);
      if (a !== b) changed.push(filepath);
    }

    if (changed.length > 0) {
      await git.checkout({
        fs: this.fs,
        dir: this.dir,
        ref: this.branch,
        force: true,
        filepaths: changed,
      });
    }
    log(`materialized ${changed.length} changed path(s)`);
  }

  private async fastForward(
    localHead: string,
    remoteHead: string,
    log: (line: string) => void
  ): Promise<void> {
    await git.merge({
      ...this.gitOpts(),
      ours: this.branch,
      theirs: remoteHead,
      fastForwardOnly: true,
      message: "pull: fast-forward canonical GitHub",
    });
    await this.checkoutBranch(localHead, log);
  }

  async attachExistingRemote(): Promise<GitOperationResult> {
    const logs: string[] = [];
    const log = (line: string) => logs.push(line);

    try {
      log(`repository=${this.repoOwner}/${this.repoName} branch=${this.branch}`);
      await this.ensureRepository();
      const remoteHead = await this.fetchRemote(log);

      if (!(await this.hasLocalBranch())) {
        await git.writeRef({
          fs: this.fs,
          dir: this.dir,
          ref: `refs/heads/${this.branch}`,
          value: remoteHead,
          force: true,
        });
        await this.checkoutBranch(null, log);
        return this.result(
          true,
          true,
          "Connected to the existing GitHub repository and checked out its canonical branch.",
          logs
        );
      }

      const localHead = await git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref: this.branch,
      });
      const dirty = await this.changedPaths();
      const relation = await this.relation(localHead, remoteHead);
      log(`relation=${relation} localChanges=${dirty.length}`);

      if (relation === "equal") {
        return this.result(true, false, "Connected. Local branch already matches GitHub.", logs);
      }

      if (relation === "behind" && dirty.length === 0) {
        await this.fastForward(localHead, remoteHead, log);
        return this.result(true, true, "Connected and fast-forwarded to GitHub.", logs);
      }

      if (relation === "ahead") {
        return this.result(
          true,
          false,
          "Connected, but the local branch has unpublished commits. Use Push local changes.",
          logs
        );
      }

      return this.result(
        false,
        false,
        "Local Git history is not safely fast-forwardable to the configured GitHub repository.",
        logs,
        "Use “Adopt GitHub as canonical” only after confirming that GitHub is the source of truth."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`attach failed: ${message}`);
      return this.result(false, false, "Could not attach the vault to GitHub.", logs, message);
    }
  }

  async pullCanonical(): Promise<GitOperationResult> {
    const logs: string[] = [];
    const log = (line: string) => logs.push(line);

    try {
      await this.ensureRepository();
      const remoteHead = await this.fetchRemote(log);

      if (!(await this.hasLocalBranch())) {
        await git.writeRef({
          fs: this.fs,
          dir: this.dir,
          ref: `refs/heads/${this.branch}`,
          value: remoteHead,
          force: true,
        });
        await this.checkoutBranch(null, log);
        return this.result(true, true, "Pulled canonical GitHub state.", logs);
      }

      const dirty = await this.changedPaths();
      if (dirty.length > 0) {
        log(`blocked by local changes: ${dirty.join(", ")}`);
        return this.result(
          false,
          false,
          "Pull stopped because the vault has local changes.",
          logs,
          "Push or otherwise resolve the local changes before pulling. No merge was attempted."
        );
      }

      const localHead = await git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref: this.branch,
      });
      const relation = await this.relation(localHead, remoteHead);
      log(`relation=${relation}`);

      if (relation === "equal") {
        return this.result(true, false, "Already up to date with GitHub.", logs);
      }
      if (relation === "behind") {
        await this.fastForward(localHead, remoteHead, log);
        return this.result(true, true, "Pulled latest canonical changes from GitHub.", logs);
      }
      if (relation === "ahead") {
        return this.result(
          true,
          false,
          "Local branch is ahead of GitHub; nothing was pulled.",
          logs
        );
      }

      return this.result(
        false,
        false,
        "Pull stopped because local and remote histories diverged.",
        logs,
        "This alpha never auto-merges. Decide which side is canonical before continuing."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`pull failed: ${message}`);
      return this.result(false, false, "Pull failed.", logs, message);
    }
  }

  async pushLocalChanges(commitMessage: string): Promise<GitOperationResult> {
    const logs: string[] = [];
    const log = (line: string) => logs.push(line);

    try {
      await this.ensureRepository();
      const remoteHead = await this.fetchRemote(log);

      if (!(await this.hasLocalBranch())) {
        return this.result(
          false,
          false,
          "Push stopped: there is no local canonical branch yet.",
          logs,
          "Run Pull from GitHub first."
        );
      }

      let localHead = await git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref: this.branch,
      });
      const beforeRelation = await this.relation(localHead, remoteHead);
      log(`pre-push relation=${beforeRelation}`);

      if (beforeRelation === "behind" || beforeRelation === "diverged") {
        return this.result(
          false,
          false,
          "Push stopped because GitHub changed since this vault was last synchronized.",
          logs,
          "Pull the canonical GitHub state first. No merge and no force-push were attempted."
        );
      }

      const rows = await this.statusRows();
      const dirtyRows = rows.filter(
        ([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1)
      );

      for (const [filepath, , workdir] of dirtyRows) {
        try {
          if (workdir === 0) {
            await git.remove({ fs: this.fs, dir: this.dir, filepath });
          } else {
            await git.add({ fs: this.fs, dir: this.dir, filepath });
          }
        } catch (error) {
          throw new Error(
            `Could not stage ${filepath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      const afterStage = await this.statusRows();
      const stagedChange = afterStage.some(([, head, , stage]) => stage !== head);
      log(`workingChanges=${dirtyRows.length} stagedChange=${stagedChange}`);

      if (stagedChange) {
        const oid = await git.commit({
          ...this.gitOpts(),
          message: commitMessage,
        });
        localHead = oid;
        log(`committed ${oid.slice(0, 8)}`);
      }

      const relationAfterCommit = await this.relation(localHead, remoteHead);
      if (relationAfterCommit === "equal") {
        return this.result(true, false, "Nothing to push.", logs);
      }
      if (relationAfterCommit !== "ahead") {
        return this.result(
          false,
          stagedChange,
          "Push stopped because ancestry could not be verified safely.",
          logs,
          "No force-push was attempted."
        );
      }

      await git.push({
        ...this.netOpts(),
        ref: this.branch,
        force: false,
      });
      log(`pushed ${localHead.slice(0, 8)}`);

      return this.result(
        true,
        true,
        stagedChange ? "Local changes committed and pushed to GitHub." : "Local commits pushed to GitHub.",
        logs
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`push failed: ${message}`);
      return this.result(false, false, "Push failed.", logs, message);
    }
  }

  async adoptRemoteAsCanonical(): Promise<GitOperationResult> {
    const logs: string[] = [];
    const log = (line: string) => logs.push(line);

    try {
      await this.ensureRepository();
      const remoteHead = await this.fetchRemote(log);

      let previousHead: string | null = null;
      try {
        previousHead = await git.resolveRef({
          fs: this.fs,
          dir: this.dir,
          ref: this.branch,
        });
      } catch {
        // no prior configured branch
      }

      await git.writeRef({
        fs: this.fs,
        dir: this.dir,
        ref: `refs/heads/${this.branch}`,
        value: remoteHead,
        force: true,
      });

      const tracked = await git.listFiles({ fs: this.fs, dir: this.dir, ref: remoteHead });
      const materialized = tracked.filter((filepath) => this.isProfilePath(filepath));
      if (materialized.length > 0) {
        await git.checkout({
          fs: this.fs,
          dir: this.dir,
          ref: this.branch,
          force: true,
          filepaths: materialized,
        });
      }

      log(`materialized ${materialized.length} profile path(s)`);
      log(
        `adopted remote=${remoteHead.slice(0, 8)} previous=${
          previousHead ? previousHead.slice(0, 8) : "none"
        }`
      );

      return this.result(
        true,
        true,
        "GitHub branch adopted as canonical local branch.",
        logs
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`adopt failed: ${message}`);
      return this.result(false, false, "Could not adopt GitHub as canonical.", logs, message);
    }
  }

  private async blobOidAt(oid: string, filepath: string): Promise<string | null> {
    try {
      const { oid: blobOid } = await git.readBlob({
        fs: this.fs,
        dir: this.dir,
        oid,
        filepath,
      });
      return blobOid;
    } catch {
      return null;
    }
  }
}
