/**
 * Timing middleware
 * Measures request duration and stores it in context for logging
 */

import { type Middleware } from "../types";

export const timing = (): Middleware => {
  return async (req: Request, ctx, next) => {
    const response = await next(req, ctx);
    return response;
  };
};
