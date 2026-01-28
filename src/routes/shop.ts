/**
 * Shop route handler
 * Handles GET /shop.json and GET /shop.tfl
 */

import { type RequestContext, type Handler, ServiceError } from "../types";
import { ShopDataCache } from "../lib/cache";
import { buildShopData } from "../lib/shop";
import { CACHE_TTL } from "../config";

const shopDataCache = new ShopDataCache(CACHE_TTL);

export const shopHandler: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);
  
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
    
    return new Response(responseBody, {
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    console.error(`✗ Error building shop data:`, err);
    throw new ServiceError({
      statusCode: 500,
      message: "Error scanning libraries",
    });
  }
};
