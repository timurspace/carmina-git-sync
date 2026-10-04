import { Modal, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, GitOperationResult, PluginSettings, SyncStatus } from "./types";
import { MultiSyncSettingsTab } from "./ui/settings-tab";
import { StatusBarItem } from "./ui/status-bar";
import { GitSync } from "./sync/git-sync";
import { repoExists } from "./github/api";

export default class CarminaGitSyncPlugin extends Plugin {
  settings!: PluginSettings;
  private statusBar!: StatusBarItem;
  private gitSync: GitSync | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.statusBar = new StatusBarItem(this);
    this.statusBar.onClick(() => void this.triggerPull());

    this.addSettingTab(new MultiSyncSettingsTab(this.app, this));

    this.addCommand({
      id: "pull-from-github",
      name: "Pull canonical state from GitHub",
      callback: () => void this.triggerPull(),
    });

    this.addCommand({
      id: "push-local-changes",
      name: "Push local changes to GitHub",
      callback: () => void this.triggerPush(),
    });

    this.addCommand({
      id: "adopt-github-canonical",
      name: "Adopt GitHub as canonical (destructive)",
      callback: () => void this.adoptGithubAsCanonical(),
    });

    if (this.isConfigured()) {
      await this.bootSyncEngine();
    }

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.pullOnOpen && this.gitSync) {
        void this.triggerPull(false);
      }
    });
  }

  private isConfigured(): boolean {
    return Boolean(
      this.settings.githubToken &&
      this.settings.githubUsername &&
      this.settings.repoOwner &&
      this.settings.repoName &&
      this.settings.branch
    );
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

    // Migration from upstream settings: preserve an explicitly selected repo when
    // possible, but never restore upstream auto-push behavior.
    if (!this.settings.repoOwner) {
      this.settings.repoOwner =
        (loaded as { githubUsername?: string }).githubUsername ||
        DEFAULT_SETTINGS.repoOwner;
    }
    if (!this.settings.branch) this.settings.branch = "main";
    this.settings.pullOnOpen = this.settings.pullOnOpen !== false;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  setStatus(status: SyncStatus, detail?: string): void {
    this.statusBar.set(status, detail);
  }

  async connectConfiguredRepo(): Promise<GitOperationResult> {
    if (!this.settings.githubToken || !this.settings.githubUsername) {
      return {
        success: false,
        changed: false,
        message: "GitHub account is not connected.",
        error: "Connect GitHub first.",
        logs: [],
      };
    }

    const exists = await repoExists(
      this.settings.githubToken,
      this.settings.repoOwner,
      this.settings.repoName
    );
    if (!exists) {
      return {
        success: false,
        changed: false,
        message: "Configured repository was not found or is not accessible.",
        error: `${this.settings.repoOwner}/${this.settings.repoName}`,
        logs: [],
      };
    }

    await this.bootSyncEngine();
    return this.gitSync!.attachExistingRemote();
  }

  async bootSyncEngine(): Promise<void> {
    const {
      githubToken,
      githubUsername,
      repoOwner,
      repoName,
      branch,
      syncProfile,
    } = this.settings;

    if (!githubToken || !githubUsername || !repoOwner || !repoName || !branch) {
      this.gitSync = null;
      return;
    }

    const adapter = this.app.vault.adapter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaultPath: string = (adapter as any).basePath ?? "";

    this.gitSync = new GitSync(
      adapter,
      vaultPath,
      githubToken,
      githubUsername,
      repoOwner,
      repoName,
      branch,
      (path) => this.isExcluded(path),
      syncProfile
    );
  }

  async triggerPull(showSuccessNotice = true): Promise<void> {
    if (!this.gitSync) {
      new Notice("Carmina Git Sync: connect and apply repository settings first.");
      return;
    }

    this.setStatus("pulling");
    let result = await this.gitSync.pullCanonical(
      showSuccessNotice ? "prompt" : "keep-local",
      (detail) => this.setStatus("pulling", detail)
    );

    if (showSuccessNotice && result.conflictPaths?.length) {
      this.setStatus("conflict", `${result.conflictPaths.length} same-file conflict(s)`);
      const choice = await choosePullConflictResolution(this.app, result.conflictPaths);

      if (choice === "cancel") {
        this.setStatus("idle");
        new Notice("Pull canceled. No local file was overwritten.");
        return;
      }

      this.setStatus("pulling");
      result = await this.gitSync.pullCanonical(
        choice,
        (detail) => this.setStatus("pulling", detail)
      );
    }

    await this.finishOperation("pull", result, showSuccessNotice);
  }

  async triggerPush(): Promise<void> {
    if (this.settings.readOnly) {
      new Notice("Carmina Git Sync: read-only mode is enabled. Push is blocked.");
      return;
    }

    if (!this.gitSync) {
      new Notice("Carmina Git Sync: connect and apply repository settings first.");
      return;
    }

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const message = this.settings.commitMessageTemplate.split("{{datetime}}").join(now);

    this.setStatus("pushing");
    const result = await this.gitSync.pushLocalChanges(message);
    await this.finishOperation("push", result, true);
  }

  async adoptGithubAsCanonical(): Promise<void> {
    if (!this.gitSync) {
      new Notice("Carmina Git Sync: connect and apply repository settings first.");
      return;
    }

    const confirmed = window.confirm(
      "Adopt GitHub as canonical?\n\n" +
      "This rewrites the local configured branch to the current GitHub branch and " +
      "checks out GitHub's tracked files. Local tracked changes can be overwritten. " +
      "Use this only when GitHub is definitely the source of truth."
    );
    if (!confirmed) return;

    this.setStatus("pulling");
    const result = await this.gitSync.adoptRemoteAsCanonical();
    await this.finishOperation("pull", result, true);
  }

  async applyRepositorySettings(): Promise<void> {
    try {
      this.setStatus("connecting");
      const result = await this.connectConfiguredRepo();
      if (result.success) {
        await this.saveSettings();
      }
      await this.finishOperation("pull", result, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus("error", message);
      new Notice(`Repository connection failed: ${message}`);
    }
  }

  private async finishOperation(
    kind: "pull" | "push",
    result: GitOperationResult,
    showSuccessNotice: boolean
  ): Promise<void> {
    if (result.success) {
      if (kind === "pull") this.settings.lastPullTime = Date.now();
      if (kind === "push" && result.changed) this.settings.lastPushTime = Date.now();
      await this.saveSettings();
      this.setStatus("idle");
      if (showSuccessNotice) new Notice(result.message);
      return;
    }

    this.setStatus("error", result.error ?? result.message);
    new Notice(`${result.message} ${result.error ?? ""}`.trim());
    showLogModal(this.app, "Carmina Git Sync", result.logs);
  }

  private isExcluded(filepath: string): boolean {
    return this.settings.excludePatterns.some((pattern) => {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const regexStr = escaped.replace(/\*/g, ".*");
      return new RegExp(`^${regexStr}$`).test(filepath);
    });
  }
}

function showLogModal(
  app: import("obsidian").App,
  header: string,
  logs: string[]
): void {
  if (logs.length === 0) return;

  const modal = new Modal(app);
  modal.titleEl.setText(header);

  const body = logs.join("\n");
  const pre = modal.contentEl.createEl("pre");
  pre.style.cssText =
    "white-space:pre-wrap;word-break:break-word;font-family:monospace;" +
    "font-size:12px;max-height:60vh;overflow:auto;user-select:text;" +
    "background:var(--background-secondary);padding:8px;border-radius:6px;";
  pre.setText(body);

  const button = modal.contentEl.createEl("button", { text: "Copy log" });
  button.style.marginTop = "8px";
  button.onclick = () => {
    void navigator.clipboard?.writeText(body);
    new Notice("Sync log copied.");
  };

  modal.open();
}


type PullConflictChoice = "use-github" | "keep-local" | "cancel";

function choosePullConflictResolution(
  app: import("obsidian").App,
  paths: string[]
): Promise<PullConflictChoice> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    let settled = false;

    const finish = (choice: PullConflictChoice) => {
      if (settled) return;
      settled = true;
      resolve(choice);
      modal.close();
    };

    modal.titleEl.setText("Local files differ from GitHub");
    modal.contentEl.createEl("p", {
      text:
        "GitHub is canonical, but these local paths differ from the canonical state. " +
        "This can be a phone edit, a stale file, or a file left behind by an interrupted Pull. " +
        "Choose whether to restore the GitHub version or keep the local version. " +
        "Other non-conflicting GitHub changes will still be pulled.",
    });

    const list = modal.contentEl.createEl("ul");
    for (const path of paths.slice(0, 10)) {
      list.createEl("li", { text: path });
    }
    if (paths.length > 10) {
      list.createEl("li", { text: `…and ${paths.length - 10} more` });
    }

    const actions = modal.contentEl.createDiv();
    actions.style.cssText =
      "display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;justify-content:flex-end;";

    const keepLocal = actions.createEl("button", { text: "Keep local" });
    keepLocal.onclick = () => finish("keep-local");

    const useGithub = actions.createEl("button", { text: "Use GitHub" });
    useGithub.addClass("mod-cta");
    useGithub.onclick = () => finish("use-github");

    const cancel = actions.createEl("button", { text: "Cancel Pull" });
    cancel.onclick = () => finish("cancel");

    modal.onClose = () => {
      if (!settled) {
        settled = true;
        resolve("cancel");
      }
    };

    modal.open();
  });
}
