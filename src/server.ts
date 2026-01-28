/**
 * tinfoil-bolt ⚡
 * A lightning-fast, zero-dependency Tinfoil server for Switch.
 */

import { PORT, BASES, getAuthPair, CACHE_TTL, SUCCESS_MESSAGE, LOG_FORMAT } from "./config";
import { type RequestContext, type Handler } from "./types";
import { authorize, timing, logging, errorHandler, compose } from "./middleware";
import { indexHandler } from "./routes/index";
import { shopHandler } from "./routes/shop";
import { filesHandler } from "./routes/files";

console.log(`⚡ tinfoil-bolt server running!`);
console.log(`> Scanning directories:`, BASES.map((b) => `${b.alias} -> ${b.path}`));

const authPair = getAuthPair();
if (authPair) {
  console.log(`> Authentication enabled (user: ${authPair.user})`);
} else {
  console.log(`> Authentication disabled`);
}

console.log(`> CACHE TTL: ${CACHE_TTL}s`);

if (SUCCESS_MESSAGE) {
  console.log(`> Success message: "${SUCCESS_MESSAGE}"`);
}

console.log(`> Log format: ${LOG_FORMAT}`);

/**
 * Main router handler
 * Routes requests to appropriate handlers based on pathname
 */
const router: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);

  // 1. Index endpoint (lists shop.json and shop.tfl)
  if (url.pathname === "/" || url.pathname === "/tinfoil") {
    return indexHandler(req, ctx);
  }

  // 2. Shop data endpoints
  if (url.pathname === "/shop.json" || url.pathname === "/shop.tfl") {
    return shopHandler(req, ctx);
  }

  // 3. File download endpoint
  if (url.pathname.startsWith("/files/")) {
    return filesHandler(req, ctx);
  }

  // 4. Health/Status endpoint
  return new Response(`* tinfoil-bolt is active.\nIndex: / or /tinfoil\nShop: /shop.tfl`, { status: 200 });
};

/**
 * Setup middleware chain with error handler
 * Order: errorHandler -> authorize -> timing -> logging -> router
 */
const middleware = compose(
  [
    authorize(authPair),
    timing(),
    logging(),
  ],
  router
);

const handler = errorHandler(middleware);

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0", // Bind to all interfaces (required for WSL/Docker)
  async fetch(req, server) {
    const url = new URL(req.url);
    const userAgent = req.headers.get("user-agent") || "";
    
    // Get remote address from x-forwarded-for header (set by proxies/load balancers)
    // Falls back to server IP if not available (e.g., direct connection)
    const remoteAddr = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || server.requestIP(req)?.address || "-";

    const ctx: RequestContext = {
      remoteAddress: remoteAddr,
      userAgent,
      startTime: Date.now(),
    };

    return handler(req, ctx);
  },
});

console.log(`\n>> Server is up and listening on port: ${PORT}`);
console.log(`>> Endpoints:`);
console.log(`   GET /          - Index listing`);
console.log(`   GET /shop.tfl  - Game library (Tinfoil format)`);
console.log(`   GET /files/*   - File downloads`);