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

  if (parts.length === 0 || hasPathTraversal(parts)) {
    console.error("[PATH] Invalid path - empty or traversal:", { virtualPath, parts });
    return null;
  }

  const [alias, ...rest] = parts;
  const base = BASES.find((b) => b.alias === alias);
  if (!base) {
    console.error("[PATH] Alias not found:", { alias, availableAliases: BASES.map(b => b.alias) });
    return null;
  }

  const absPath = `${base.path}/${rest.join("/")}`;
  const file = Bun.file(absPath);
  const exists = await file.exists();
  
  if (!exists) {
    console.error("[PATH] File not found:", { absPath, virtualPath, base: base.path });
  }
  
  if (exists) return { file, absPath };

  return null;
}
