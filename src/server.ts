/**
 * tinfoil-bolt ⚡
 * A lightning-fast, zero-dependency Tinfoil server for Switch.
 */

import { PORT, BASES, GLOB_PATTERN, getAuthPair, CACHE_TTL, SUCCESS_MESSAGE, LOG_FORMAT } from "./config";
import { encodePath, resolveVirtualPath } from "./lib/paths";
import { isAuthorized, respondUnauthorized } from "./lib/auth";
import { ShopDataCache, type ShopData } from "./lib/cache";
import { logRequest } from "./lib/logger";
import { parseRange, isSingleRange, getContentRangeHeader } from "./lib/range";
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

console.log(`> Log format: ${LOG_FORMAT}`);

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

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0", // Bind to all interfaces (required for WSL/Docker)
  async fetch(req, server) {
    const requestStart = Date.now();
    const url = new URL(req.url);
    const decodedPath = decodeURIComponent(url.pathname);
    const userAgent = req.headers.get("user-agent") || "";
    
    // Get remote address from x-forwarded-for header (set by proxies/load balancers)
    // Falls back to "-" if not available (e.g., direct connection)
    const remoteAddr = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || server.requestIP(req)?.address || "-";

    // Authorization: protect all routes if auth configured
    if (!isAuthorized(req, authPair)) {
      const elapsed = Date.now() - requestStart;
      logRequest(LOG_FORMAT, req.method, url.pathname, 401, elapsed, { remoteAddr, userAgent });
      return respondUnauthorized();
    }

    // 1. Tinfoil Index Endpoint (lists shop.json and shop.tfl)
    if (url.pathname === "/" || url.pathname === "/tinfoil") {
      const accept = req.headers.get("accept") || "";
      const isBrowser = accept.includes("text/html");
      
      if (isBrowser) {
        if (!(await INDEX_HTML.exists())) {
          const elapsed = Date.now() - requestStart;
          logRequest(LOG_FORMAT, req.method, url.pathname, 500, elapsed, { remoteAddr, userAgent });
          return new Response("Index page missing", { status: 500 });
        }

        const htmlResponse = new Response(INDEX_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
        const elapsed = Date.now() - requestStart;
        logRequest(LOG_FORMAT, req.method, url.pathname, 200, elapsed, {
          contentLength: INDEX_HTML.size,
          remoteAddr,
          userAgent,
        });
        return htmlResponse;
      }
      
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

      const jsonResponse = Response.json(indexPayload);
      const elapsed = Date.now() - requestStart;
      logRequest(LOG_FORMAT, req.method, url.pathname, 200, elapsed, { remoteAddr, userAgent });
      return jsonResponse;
    }

    // 2. Shop Data Endpoints (actual game listing)
    if (url.pathname === "/shop.json" || url.pathname === "/shop.tfl") {
      try {
        // Check cache first
        let shopData = shopDataCache.get();
        if (!shopData) {
          shopData = await buildShopData();
          shopDataCache.set(shopData);
        }
        
        const contentType = url.pathname.endsWith(".tfl") 
          ? "application/octet-stream" 
          : "application/json";
        
        const responseBody = JSON.stringify(shopData);
        const shopResponse = new Response(responseBody, {
          headers: { "Content-Type": contentType },
        });
        
        const elapsed = Date.now() - requestStart;
        logRequest(LOG_FORMAT, req.method, url.pathname, 200, elapsed, {
          contentLength: responseBody.length,
          remoteAddr,
          userAgent,
        });
        return shopResponse;
      } catch (err) {
        console.error(`✗ Error building shop data:`, err);
        const elapsed = Date.now() - requestStart;
        logRequest(LOG_FORMAT, req.method, url.pathname, 500, elapsed, { remoteAddr, userAgent });
        return new Response("Error scanning libraries", { status: 500 });
      }
    }

    // 3. File Download Endpoint
    if (url.pathname.startsWith("/files/")) {
      const virtualPath = decodedPath.replace("/files/", "");
      const resolved = await resolveVirtualPath(virtualPath);

      if (!resolved) {
        const elapsed = Date.now() - requestStart;
        logRequest(LOG_FORMAT, req.method, url.pathname, 404, elapsed, { remoteAddr, userAgent });
        return new Response("File not found", { status: 404 });
      }

      const fileSize = resolved.file.size;
      const rangeHeader = req.headers.get("range");

      // Check for Range header to support resumable downloads
      if (rangeHeader) {
        // Reject multi-range requests (not supported)
        if (!isSingleRange(rangeHeader)) {
          const elapsed = Date.now() - requestStart;
          logRequest(LOG_FORMAT, req.method, url.pathname, 416, elapsed, { remoteAddr, userAgent });
          return new Response("Multiple ranges not supported", {
            status: 416,
            headers: {
              "Content-Range": `bytes */${fileSize}`,
            },
          });
        }

        // Parse the range
        const range = parseRange(rangeHeader, fileSize);

        if (!range) {
          // Invalid range request - return 416 Range Not Satisfiable
          const elapsed = Date.now() - requestStart;
          logRequest(LOG_FORMAT, req.method, url.pathname, 416, elapsed, { remoteAddr, userAgent });
          return new Response("Range request invalid", {
            status: 416,
            headers: {
              "Content-Range": `bytes */${fileSize}`,
            },
          });
        }

        // Return partial content
        // Note: HTTP Range is inclusive on both ends, but BunFile.slice() is exclusive on the end
        // So we need to pass (end + 1) to slice()
        const partialFile = resolved.file.slice(range.start, range.end + 1);
        const contentLength = range.end - range.start + 1;

        const fileResponse = new Response(partialFile, {
          status: 206,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": contentLength.toString(),
            "Content-Range": getContentRangeHeader(range.start, range.end, fileSize),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000", // 1 year for immutable files
          },
        });

        const elapsed = Date.now() - requestStart;
        logRequest(LOG_FORMAT, req.method, url.pathname, 206, elapsed, {
          contentLength,
          remoteAddr,
          userAgent,
        });
        return fileResponse;
      }

      // No Range header - return full file
      const fileResponse = new Response(resolved.file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": fileSize.toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000", // 1 year for immutable files
        },
      });

      const elapsed = Date.now() - requestStart;
      logRequest(LOG_FORMAT, req.method, url.pathname, 200, elapsed, {
        contentLength: fileSize,
        remoteAddr,
        userAgent,
      });
      return fileResponse;
    }

    // 4. Health/Status
    const healthResponse = new Response(`* tinfoil-bolt is active.\nIndex: / or /tinfoil\nShop: /shop.tfl`, { status: 200 });
    const elapsed = Date.now() - requestStart;
    logRequest(LOG_FORMAT, req.method, url.pathname, 200, elapsed, { remoteAddr, userAgent });
    return healthResponse;
  },
});

console.log(`\n>> Server is up and listening on port: ${PORT}`);
console.log(`>> Endpoints:`);
console.log(`   GET /          - Index listing`);
console.log(`   GET /shop.tfl  - Game library (Tinfoil format)`);
console.log(`   GET /files/*   - File downloads`);