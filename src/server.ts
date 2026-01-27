/**
 * tinfoil-bolt ⚡
 * A lightning-fast, zero-dependency Tinfoil server for Switch.
 */

const PORT = parseInt(process.env.PORT || "3000");
const RAW_DIRS = process.env.GAMES_DIRS || "/data/games";
const BASE_DIRS = RAW_DIRS.split(/[,;]/).map(d => d.trim()).filter(d => d.length > 0);
const GLOB_PATTERN = "**/*.{nsp,nsz,xci,xciz}";

type BaseDir = { path: string; alias: string };

function buildBaseAliases(dirs: string[]): BaseDir[] {
  const nameCounts = new Map<string, number>();

  return dirs.map((dir) => {
    const baseName = dir.split("/").filter(Boolean).pop() || "games";
    const count = nameCounts.get(baseName) ?? 0;
    nameCounts.set(baseName, count + 1);

    const alias = count === 0 ? baseName : `${baseName}-${count + 1}`;
    return { path: dir, alias };
  });
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function hasPathTraversal(parts: string[]): boolean {
  return parts.some((p) => p === ".." || p === "." || p.trim().length === 0);
}

const BASES = buildBaseAliases(BASE_DIRS);

console.log(`⚡ tinfoil-bolt server running!`);
console.log(`📂 Scanning directories:`, BASES.map((b) => `${b.alias} -> ${b.path}`));

async function resolveVirtualPath(virtualPath: string): Promise<{ file: ReturnType<typeof Bun.file>; absPath: string } | null> {
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

async function buildShopData() {
  const fileEntries: { virtualPath: string; absPath: string }[] = [];
  const directories = new Set<string>();

  // Scan ALL directories
  await Promise.all(BASES.map(async ({ path: dir, alias }) => {
    const glob = new Bun.Glob(GLOB_PATTERN);
    for await (const file of glob.scan({ cwd: dir, onlyFiles: true })) {
      const virtualPath = `${alias}/${file}`;
      fileEntries.push({ virtualPath, absPath: `${dir}/${file}` });

      const dirName = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : "";
      if (dirName.length > 0) {
        directories.add(`${alias}/${dirName}`);
      } else {
        directories.add(alias);
      }
    }
  }));

  return {
    files: fileEntries.map(({ virtualPath, absPath }) => ({
      url: `./files/${encodePath(virtualPath)}`,
      size: Bun.file(absPath).size,
    })),
    directories: Array.from(directories).map((d) => `./files/${encodePath(d)}`),
    success: `tinfoil-bolt: ${fileEntries.length} games found.`,
  };
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const decodedPath = decodeURIComponent(url.pathname);

    // 1. Tinfoil Index Endpoint (lists shop.json and shop.tfl)
    if (url.pathname === "/" || url.pathname === "/tinfoil") {
      const indexPayload = {
        files: [
          { url: "shop.json", size: 0 },
          { url: "shop.tfl", size: 0 },
        ],
        directories: [],
        success: "tinfoil-bolt index",
      };
      return Response.json(indexPayload);
    }

    // 2. Shop Data Endpoints (actual game listing)
    if (url.pathname === "/shop.json" || url.pathname === "/shop.tfl") {
      try {
        const shopData = await buildShopData();
        const contentType = url.pathname.endsWith(".tfl") 
          ? "application/octet-stream" 
          : "application/json";
        
        return new Response(JSON.stringify(shopData), {
          headers: { "Content-Type": contentType },
        });
      } catch (err) {
        console.error(err);
        return new Response("Error scanning libraries", { status: 500 });
      }
    }

    // 3. File Download Endpoint
    if (url.pathname.startsWith("/files/")) {
      const virtualPath = decodedPath.replace("/files/", "");
      const resolved = await resolveVirtualPath(virtualPath);

      if (!resolved) {
        return new Response("File not found", { status: 404 });
      }

      return new Response(resolved.file);
    }

    // 4. Health/Status
    return new Response(`⚡ tinfoil-bolt is active.\nIndex: / or /tinfoil\nShop: /shop.tfl`, { status: 200 });
  },
});