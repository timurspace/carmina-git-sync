export interface PluginSettings {
  clientId: string;
  githubToken: string;
  githubUsername: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  pullOnOpen: boolean;
  readOnly: boolean;
  excludePatterns: string[];
  syncProfile: "full" | "carmina-mobile";
  lastPullTime: number;
  lastPushTime: number;
  commitMessageTemplate: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  clientId: "",
  githubToken: "",
  githubUsername: "",
  repoOwner: "timurspace",
  repoName: "carmina-et-sententiae",
  branch: "main",
  pullOnOpen: true,
  readOnly: false,
  excludePatterns: [
    ".obsidian/*",
  ],
  syncProfile: "full",
  lastPullTime: 0,
  lastPushTime: 0,
  commitMessageTemplate: "obsidian: {{datetime}}",
};

export interface DeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string;
  email: string;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  private: boolean;
  clone_url: string;
  html_url: string;
}

export type SyncStatus =
  | "idle"
  | "pulling"
  | "pushing"
  | "conflict"
  | "error"
  | "connecting";

export interface ConflictFile {
  path: string;
  ours: string;
  theirs: string;
}

export interface SyncResult {
  success: boolean;
  conflictFiles: ConflictFile[];
  error?: string;
  logs?: string[];
}

export interface GitOperationResult {
  success: boolean;
  changed: boolean;
  message: string;
  error?: string;
  logs: string[];
}
