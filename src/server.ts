/**
 * tinfoil-bolt ⚡
 * A lightning-fast, zero-dependency Tinfoil server for Switch.
 */

const PORT = parseInt(process.env.PORT || "3000");
const RAW_DIRS = process.env.GAMES_DIRS || "/data/games";
const BASE_DIRS = RAW_DIRS.split(/[,;]/).map(d => d.trim()).filter(d => d.length > 0);
const GLOB_PATTERN = "**/*.{nsp,nsz,xci,xciz}";
const INDEX_HTML = Bun.file(new URL("./index.html", import.meta.url));

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
      url: `../files/${encodePath(virtualPath)}`,
      size: Bun.file(absPath).size,
    })),
    directories: Array.from(directories).map((d) => `../files/${encodePath(d)}`),
    success: `tinfoil-bolt: ${fileEntries.length} games found.`,
  };
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0", // Bind to all interfaces (required for WSL/Docker)
  async fetch(req) {
    const url = new URL(req.url);
    const decodedPath = decodeURIComponent(url.pathname);
    const userAgent = req.headers.get("user-agent") || "unknown";
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] ${req.method} ${url.pathname}`);
    console.log(`  User-Agent: ${userAgent}`);

    // 1. Tinfoil Index Endpoint (lists shop.json and shop.tfl)
    if (url.pathname === "/" || url.pathname === "/tinfoil") {
      const accept = req.headers.get("accept") || "";
      const isBrowser = accept.includes("text/html");
      
      if (isBrowser) {
        console.log(`  → Serving HTML index page`);
        if (!(await INDEX_HTML.exists())) {
          console.error("  ✗ index.html not found on disk");
          return new Response("Index page missing", { status: 500 });
        }

        return new Response(INDEX_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      
      console.log(`  → Serving JSON index (Tinfoil client)`);
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
        console.log(`  → Building shop data...`);
        const startTime = Date.now();
        const shopData = await buildShopData();
        const elapsed = Date.now() - startTime;
        
        console.log(`  → Found ${shopData.files.length} files in ${shopData.directories.length} directories (${elapsed}ms)`);
        
        const contentType = url.pathname.endsWith(".tfl") 
          ? "application/octet-stream" 
          : "application/json";
        
        console.log(`  → Serving as ${contentType}`);
        
        return new Response(JSON.stringify(shopData), {
          headers: { "Content-Type": contentType },
        });
      } catch (err) {
        console.error(`  ✗ Error building shop data:`, err);
        return new Response("Error scanning libraries", { status: 500 });
      }
    }

    // 3. File Download Endpoint
    if (url.pathname.startsWith("/files/")) {
      const virtualPath = decodedPath.replace("/files/", "");
      console.log(`  → Resolving file: ${virtualPath}`);
      
      const resolved = await resolveVirtualPath(virtualPath);

      if (!resolved) {
        console.log(`  ✗ File not found: ${virtualPath}`);
        return new Response("File not found", { status: 404 });
      }

      const fileSize = resolved.file.size;
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      console.log(`  ✓ Serving file: ${resolved.absPath} (${sizeMB} MB)`);

      return new Response(resolved.file);
    }

    // 4. Health/Status
    console.log(`  → Serving health check`);
    return new Response(`⚡ tinfoil-bolt is active.\nIndex: / or /tinfoil\nShop: /shop.tfl`, { status: 200 });
  },
});

console.log(`\n🚀 Server ready at http://0.0.0.0:${PORT}`);
console.log(`📡 Access from network: http://<YOUR_IP>:${PORT}`);
console.log(`📋 Endpoints:`);
console.log(`   GET /          - Index listing`);
console.log(`   GET /shop.tfl  - Game library (Tinfoil format)`);
console.log(`   GET /files/*   - File downloads`);