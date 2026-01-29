/**
 * Middleware composition utility
 * Chains multiple middleware together
 */

import { type Handler, type Middleware, type RequestContext } from "../types";

export const compose = (middlewares: Middleware[], handler: Handler): Handler => {
  return middlewares.reduceRight(
    (next: Handler, middleware: Middleware) => (req: Request, ctx: RequestContext) =>
      middleware(req, ctx, next),
    handler
  );
};
