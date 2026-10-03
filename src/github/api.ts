import { requestUrl } from "obsidian";
import { GITHUB_API_BASE } from "../constants";
import { GitHubUser } from "../types";

async function ghFetch<T>(
  path: string,
  token: string,
  options: { method?: string; body?: object } = {}
): Promise<T> {
  const response = await requestUrl({
    url: `${GITHUB_API_BASE}${path}`,
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    throw: false,
  });

  if (response.status >= 400) {
    const err = response.json as { message?: string };
    throw new Error(
      `GitHub API error ${response.status}: ${err.message ?? "unknown"}`
    );
  }

  return response.json as T;
}

export async function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  return ghFetch<GitHubUser>("/user", token);
}

export async function repoExists(
  token: string,
  owner: string,
  repoName: string
): Promise<boolean> {
  const response = await requestUrl({
    url: `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    throw: false,
  });

  if (response.status === 200) return true;
  if (response.status === 404) return false;

  const err = response.json as { message?: string };
  throw new Error(
    `GitHub API error ${response.status}: ${err.message ?? "unknown"}`
  );
}
