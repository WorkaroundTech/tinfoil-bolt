/**
 * tinfoil-bolt ⚡
 * A lightning-fast, zero-dependency Tinfoil server for Switch.
 */

import { PORT, BASES, GLOB_PATTERN, getAuthPair, CACHE_TTL, SUCCESS_MESSAGE } from "./config";
import { encodePath, resolveVirtualPath } from "./lib/paths";
import { isAuthorized, respondUnauthorized } from "./lib/auth";
import { ShopDataCache, type ShopData } from "./lib/cache";
const INDEX_HTML = Bun.file(new URL("./index.html", import.meta.url));

// helpers moved to src/config.ts and src/lib/paths.ts

console.log(`⚡ tinfoil-bolt server running!`);
console.log(`> Scanning directories:`, BASES.map((b) => `${b.alias} -> ${b.path}`));

const authPair = getAuthPair();
if (authPair) {
  console.log(`> Authentication enabled (user: ${authPair.user})`);
} else {
  console.log(`> Authentication disabled`);
}

console.log(`> CACHE TTL: ${CACHE_TTL}s`);
const shopDataCache = new ShopDataCache(CACHE_TTL);

if (SUCCESS_MESSAGE) {
  console.log(`> Success message: "${SUCCESS_MESSAGE}"`);
}


async function buildShopData(): Promise<ShopData> {
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

  const shopData: ShopData = {
    files: fileEntries.map(({ virtualPath, absPath }) => ({
      url: `../files/${encodePath(virtualPath)}`,
      size: Bun.file(absPath).size,
    })),
    directories: Array.from(directories).map((d) => `../files/${encodePath(d)}`),
  };

  // Add success message if configured
  if (SUCCESS_MESSAGE) {
    shopData.success = SUCCESS_MESSAGE;
  }

  return shopData;
}

function respondWithTiming(res: Response, startMs: number): Response {
  const elapsed = Date.now() - startMs;
  console.log(`  [${elapsed}ms]`);
  return res;
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0", // Bind to all interfaces (required for WSL/Docker)
  async fetch(req) {
    const requestStart = Date.now();
    const url = new URL(req.url);
    const decodedPath = decodeURIComponent(url.pathname);
    const userAgent = req.headers.get("user-agent") || "unknown";
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] ${req.method} ${url.pathname}`);
    console.log(`  User-Agent: ${userAgent}`);

    // Authorization: protect all routes if auth configured
    if (!isAuthorized(req, authPair)) {
      console.log("  ✗ Unauthorized access");
      return respondWithTiming(respondUnauthorized(), requestStart);
    }

    // 1. Tinfoil Index Endpoint (lists shop.json and shop.tfl)
    if (url.pathname === "/" || url.pathname === "/tinfoil") {
      const accept = req.headers.get("accept") || "";
      const isBrowser = accept.includes("text/html");
      
      if (isBrowser) {
        console.log(`  -> Serving HTML index page`);
        if (!(await INDEX_HTML.exists())) {
          console.error("  ✗ index.html not found on disk");
          return respondWithTiming(new Response("Index page missing", { status: 500 }), requestStart);
        }

        return respondWithTiming(new Response(INDEX_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }), requestStart);
      }
      
      console.log(`  → Serving JSON index (Tinfoil client)`);
      const indexPayload: any = {
        files: [
          { url: "shop.json", size: 0 },
          { url: "shop.tfl", size: 0 },
        ],
        directories: [],
      };

      // Add success message if configured
      if (SUCCESS_MESSAGE) {
        indexPayload.success = SUCCESS_MESSAGE;
      }

      return respondWithTiming(Response.json(indexPayload), requestStart);
    }

    // 2. Shop Data Endpoints (actual game listing)
    if (url.pathname === "/shop.json" || url.pathname === "/shop.tfl") {
      try {
        // Check cache first
        let shopData = shopDataCache.get();
        if (shopData) {
          console.log(`  ✓ Cache hit`);
        } else {
          console.log(`  -> Building shop data (cache miss)...`);
          const startTime = Date.now();
          shopData = await buildShopData();
          shopDataCache.set(shopData);
          const elapsed = Date.now() - startTime;
          console.log(`  -> Built in ${elapsed}ms, caching for ${CACHE_TTL}s`);
        }
        
        console.log(`  -> Found ${shopData.files.length} files in ${shopData.directories.length} directories`);
        
        const contentType = url.pathname.endsWith(".tfl") 
          ? "application/octet-stream" 
          : "application/json";
        
        console.log(`  -> Serving as ${contentType}`);
        
        return respondWithTiming(new Response(JSON.stringify(shopData), {
          headers: { "Content-Type": contentType },
        }), requestStart);
      } catch (err) {
        console.error(`  ✗ Error building shop data:`, err);
        return respondWithTiming(new Response("Error scanning libraries", { status: 500 }), requestStart);
      }
    }

    // 3. File Download Endpoint
    if (url.pathname.startsWith("/files/")) {
      const virtualPath = decodedPath.replace("/files/", "");
      console.log(`  -> Resolving file: ${virtualPath}`);
      
      const resolved = await resolveVirtualPath(virtualPath);

      if (!resolved) {
        console.log(`  ✗ File not found: ${virtualPath}`);
        return respondWithTiming(new Response("File not found", { status: 404 }), requestStart);
      }

      const fileSize = resolved.file.size;
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      console.log(`  ✓ Serving file: ${resolved.absPath} (${sizeMB} MB)`);

      return respondWithTiming(new Response(resolved.file), requestStart);
    }

    // 4. Health/Status
    console.log(`  -> Serving health check`);
    return respondWithTiming(new Response(`* tinfoil-bolt is active.\nIndex: / or /tinfoil\nShop: /shop.tfl`, { status: 200 }), requestStart);
  },
});

console.log(`\n>> Server is up and listening on port: ${PORT}`);
console.log(`>> Endpoints:`);
console.log(`   GET /          - Index listing`);
console.log(`   GET /shop.tfl  - Game library (Tinfoil format)`);
console.log(`   GET /files/*   - File downloads`);