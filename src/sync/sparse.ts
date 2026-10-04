export type SyncProfile = "full" | "carmina-mobile";

const CARMINA_MOBILE_PATHS = [
  ".obsidian/**",
  "01_Карточки/**",
  "90_Индексы/**",
  "99_Служебное/Скрипты/Копировать для цитирования.md",
];

export function isPathAllowedByProfile(
  filepath: string,
  profile: SyncProfile
): boolean {
  if (profile === "full") return true;

  return CARMINA_MOBILE_PATHS.some((pattern) => {
    if (pattern.endsWith("/**")) {
      return filepath.startsWith(pattern.slice(0, -3));
    }
    return filepath === pattern;
  });
}
