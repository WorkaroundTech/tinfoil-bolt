import { BASES } from "../config";

export function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function hasPathTraversal(parts: string[]): boolean {
  return parts.some((p) => p === ".." || p === "." || p.trim().length === 0);
}

export type BunFile = ReturnType<typeof Bun.file>;

export async function resolveVirtualPath(virtualPath: string): Promise<{ file: BunFile; absPath: string } | null> {
  const parts = virtualPath.split("/").filter(Boolean);

  if (parts.length === 0 || hasPathTraversal(parts)) return null;

  const [alias, ...rest] = parts;
  const base = BASES.find((b) => b.alias === alias);
  if (!base) return null;

  const absPath = `${base.path}/${rest.join("/")}`;
  const file = Bun.file(absPath);
  if (await file.exists()) return { file, absPath };

  return null;
}
