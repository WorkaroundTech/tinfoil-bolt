/**
 * Router setup
 * Routes requests to appropriate handlers based on pathname
 */

import { type Handler, type RequestContext } from "../types";
import { indexHandler } from "./handlers/index";
import { shopHandler } from "./handlers/shop";
import { filesHandler } from "./handlers/files";

export const router: Handler = async (req: Request, ctx: RequestContext) => {
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
