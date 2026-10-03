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
