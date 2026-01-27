export type BaseDir = { path: string; alias: string };

export const PORT = parseInt(process.env.PORT || "3000");
export const RAW_DIRS = process.env.GAMES_DIRS || "/data/games";
export const BASE_DIRS = RAW_DIRS.split(/[,;]/).map(d => d.trim()).filter(d => d.length > 0);
export const GLOB_PATTERN = "**/*.{nsp,nsz,xci,xciz}";

export function buildBaseAliases(dirs: string[]): BaseDir[] {
  const nameCounts = new Map<string, number>();

  return dirs.map((dir) => {
    const baseName = dir.split("/").filter(Boolean).pop() || "games";
    const count = nameCounts.get(baseName) ?? 0;
    nameCounts.set(baseName, count + 1);

    const alias = count === 0 ? baseName : `${baseName}-${count + 1}`;
    return { path: dir, alias };
  });
}

export const BASES = buildBaseAliases(BASE_DIRS);
