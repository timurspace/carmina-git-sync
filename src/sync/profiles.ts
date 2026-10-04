export type SyncProfile = "full" | "carmina-mobile";

export const CARMINA_MOBILE_PATHS = [
  ".obsidian/**",
  "01_Карточки/**",
  "90_Индексы/**",
  "99_Служебное/Скрипты/Копировать для цитирования.md",
];

export interface SyncProfileDefinition {
  id: SyncProfile;
  name: string;
  description: string;
  includePaths: string[];
}

export const SYNC_PROFILES: SyncProfileDefinition[] = [
  {
    id: "full",
    name: "Full repository",
    description: "Complete GitHub working copy.",
    includePaths: ["**/*"],
  },
  {
    id: "carmina-mobile",
    name: "Carmina Mobile",
    description: "Reduced Obsidian working copy for Android.",
    includePaths: CARMINA_MOBILE_PATHS,
  },
];

export function pathMatchesProfile(path: string, profile: SyncProfile): boolean {
  if (profile === "full") return true;

  return CARMINA_MOBILE_PATHS.some((pattern) => {
    const prefix = pattern.replace("/**", "");
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}
