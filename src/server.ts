/**
 * tinfoil-bolt ⚡
 * A lightning-fast, zero-dependency Tinfoil server for Switch.
 */

import { PORT, BASES, GLOB_PATTERN, getAuthPair } from "./config";
import { encodePath, resolveVirtualPath } from "./lib/paths";
import { isAuthorized, respondUnauthorized } from "./lib/auth";
const INDEX_HTML = Bun.file(new URL("./index.html", import.meta.url));

// helpers moved to src/config.ts and src/lib/paths.ts

console.log(`⚡ tinfoil-bolt server running!`);
console.log(`📂 Scanning directories:`, BASES.map((b) => `${b.alias} -> ${b.path}`));

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
    // success: `tinfoil-bolt: ${fileEntries.length} games found.`,
  };
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0", // Bind to all interfaces (required for WSL/Docker)
  async fetch(req) {
    const authPair = getAuthPair();
    const url = new URL(req.url);
    const decodedPath = decodeURIComponent(url.pathname);
    const userAgent = req.headers.get("user-agent") || "unknown";
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] ${req.method} ${url.pathname}`);
    console.log(`  User-Agent: ${userAgent}`);

    // Authorization: protect all routes if auth configured
    if (!isAuthorized(req, authPair)) {
      console.log("  ✗ Unauthorized access");
      return respondUnauthorized();
    }

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
        // success: "tinfoil-bolt index",
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