import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import type CarminaGitSyncPlugin from "../main";
import { requestDeviceCode, pollForToken } from "../auth/github-device";
import { getAuthenticatedUser } from "../github/api";

export class MultiSyncSettingsTab extends PluginSettingTab {
  plugin: CarminaGitSyncPlugin;

  constructor(app: App, plugin: CarminaGitSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Carmina Git Sync" });
    containerEl.createEl("p", {
      text:
        "GitHub is canonical. Pull is safe and fast-forward-only; Push is always explicit. " +
        "This alpha never auto-merges and never force-pushes.",
      cls: "setting-item-description",
    });

    containerEl.createEl("h3", { text: "Repository" });

    new Setting(containerEl)
      .setName("Repository owner")
      .setDesc("GitHub owner of the canonical repository.")
      .addText((text) =>
        text
          .setPlaceholder("timurspace")
          .setValue(settings.repoOwner)
          .onChange(async (value) => {
            settings.repoOwner = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Repository name")
      .setDesc("Existing repository only. The plugin never creates a repository.")
      .addText((text) =>
        text
          .setPlaceholder("carmina-et-sententiae")
          .setValue(settings.repoName)
          .onChange(async (value) => {
            settings.repoName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Branch")
      .setDesc("Canonical branch. Default: main.")
      .addText((text) =>
        text
          .setPlaceholder("main")
          .setValue(settings.branch)
          .onChange(async (value) => {
            settings.branch = value.trim() || "main";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync profile")
      .setDesc("Choose the working-copy profile for this device. Profile behavior is implemented separately.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("full", "Full repository")
          .addOption("carmina-mobile", "Carmina Mobile")
          .setValue(settings.syncProfile)
          .onChange(async (value) => {
            settings.syncProfile = value as typeof settings.syncProfile;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Apply repository settings")
      .setDesc("Verify the existing repository and attach this vault without creating or merging anything.")
      .addButton((button) =>
        button.setButtonText("Apply / connect").setCta().onClick(async () => {
          await this.plugin.applyRepositorySettings();
          this.display();
        })
      );

    containerEl.createEl("h3", { text: "GitHub account" });

    new Setting(containerEl)
      .setName("OAuth Client ID")
      .setDesc("Your GitHub OAuth App Client ID. Device Flow must be enabled.")
      .addText((text) =>
        text
          .setPlaceholder("Ov23li…")
          .setValue(settings.clientId)
          .onChange(async (value) => {
            settings.clientId = value.trim();
            await this.plugin.saveSettings();
          })
      );

    if (settings.githubToken && settings.githubUsername) {
      new Setting(containerEl)
        .setName("Connected account")
        .setDesc(`Signed in as @${settings.githubUsername}`)
        .addButton((button) =>
          button
            .setButtonText("Disconnect")
            .setWarning()
            .onClick(async () => {
              settings.githubToken = "";
              settings.githubUsername = "";
              await this.plugin.saveSettings();
              await this.plugin.bootSyncEngine();
              this.display();
              new Notice("Disconnected from GitHub.");
            })
        );
    } else {
      new Setting(containerEl)
        .setName("Connect GitHub")
        .setDesc("Authorize access to the existing private canonical repository.")
        .addButton((button) =>
          button.setButtonText("Connect GitHub").setCta().onClick(async () => {
            await this.startDeviceFlow(button);
          })
        );
    }

    containerEl.createEl("h3", { text: "Safety" });

    new Setting(containerEl)
      .setName("Read-only mode")
      .setDesc("Allow Pull, but block Push so this device cannot write changes to GitHub.")
      .addToggle((toggle) =>
        toggle.setValue(settings.readOnly).onChange(async (value) => {
          settings.readOnly = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Pull on open")
      .setDesc("Fetch and fast-forward from GitHub when Obsidian opens. Stops if local changes exist.")
      .addToggle((toggle) =>
        toggle.setValue(settings.pullOnOpen).onChange(async (value) => {
          settings.pullOnOpen = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Excluded patterns")
      .setDesc("One simple * pattern per line. Excluded paths are never committed by Push.")
      .addTextArea((area) =>
        area
          .setValue(settings.excludePatterns.join("\n"))
          .onChange(async (value) => {
            settings.excludePatterns = value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Commit message")
      .setDesc("Used by explicit Push. {{datetime}} is replaced automatically.")
      .addText((text) =>
        text
          .setValue(settings.commitMessageTemplate)
          .onChange(async (value) => {
            settings.commitMessageTemplate = value || "obsidian: {{datetime}}";
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Manual operations" });

    new Setting(containerEl)
      .setName("Pull from GitHub")
      .setDesc("Fetch and fast-forward only. Never creates a merge commit.")
      .addButton((button) =>
        button.setButtonText("Pull").onClick(async () => {
          await this.plugin.triggerPull();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Push local changes")
      .setDesc("Fetch first; push only when remote ancestry is safe. Never force-pushes.")
      .addButton((button) =>
        button.setButtonText("Push").onClick(async () => {
          await this.plugin.triggerPush();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Adopt GitHub as canonical")
      .setDesc(
        "Destructive recovery/migration action. Repoints the local configured branch to GitHub and checks out GitHub's tracked files."
      )
      .addButton((button) =>
        button.setButtonText("Adopt GitHub").setWarning().onClick(async () => {
          await this.plugin.adoptGithubAsCanonical();
          this.display();
        })
      );

    const fmt = (value: number) =>
      value > 0 ? new Date(value).toLocaleString() : "never";
    containerEl.createEl("p", {
      text: `Last pull: ${fmt(settings.lastPullTime)} · Last push: ${fmt(settings.lastPushTime)}`,
      cls: "setting-item-description",
    });
  }

  private async startDeviceFlow(button: ButtonComponent): Promise<void> {
    const clientId = this.plugin.settings.clientId;
    if (!clientId) {
      new Notice("Enter your GitHub OAuth App Client ID first.");
      return;
    }

    button.setButtonText("Connecting…").setDisabled(true);

    try {
      const deviceFlow = await requestDeviceCode(clientId);
      const panel = this.containerEl.createDiv({ cls: "carmina-sync-device-flow" });
      panel.style.cssText =
        "background:var(--background-secondary);border-radius:8px;padding:16px;" +
        "margin-top:12px;text-align:center;";

      panel.createEl("p", {
        text: "Open the GitHub device page and enter this code:",
      });
      const link = panel.createEl("a", {
        text: deviceFlow.verification_uri,
        href: deviceFlow.verification_uri,
      });
      link.style.display = "block";

      const code = panel.createEl("h1", { text: deviceFlow.user_code });
      code.style.cssText =
        "font-size:2rem;letter-spacing:0.25em;font-weight:700;" +
        "color:var(--text-normal);background:var(--background-primary);" +
        "border:2px solid var(--interactive-accent);border-radius:6px;" +
        "padding:8px 24px;display:inline-block;margin:12px auto;font-family:monospace;";

      window.open(deviceFlow.verification_uri, "_blank");

      const token = await pollForToken(
        clientId,
        deviceFlow.device_code,
        deviceFlow.interval,
        deviceFlow.expires_in
      );

      panel.remove();
      const user = await getAuthenticatedUser(token);
      this.plugin.settings.githubToken = token;
      this.plugin.settings.githubUsername = user.login;
      await this.plugin.saveSettings();
      await this.plugin.bootSyncEngine();

      new Notice(`Connected as @${user.login}. Now apply repository settings.`);
      this.display();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.containerEl.querySelector(".carmina-sync-device-flow")?.remove();
      new Notice(`GitHub connection failed: ${message}`);
      button.setButtonText("Connect GitHub").setDisabled(false);
    }
  }
}
