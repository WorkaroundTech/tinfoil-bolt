/**
 * Middleware for the tinfoil-bolt server
 */

import { type RequestContext, type Handler, type Middleware, ServiceError } from "./types";
import { isAuthorized, respondUnauthorized } from "./lib/auth";
import { logRequest } from "./lib/logger";
import { LOG_FORMAT } from "./config";

/**
 * Authorization middleware
 * Checks if the request is authorized, throws ServiceError if not
 */
export const authorize = (authPair: { user: string; pass: string } | null): Middleware => {
  return async (req: Request, ctx: RequestContext, next: Handler) => {
    if (!isAuthorized(req, authPair)) {
      throw new ServiceError({
        statusCode: 401,
        message: "Unauthorized",
      });
    }
    return next(req, ctx);
  };
};

/**
 * Timing middleware
 * Measures request duration and stores it in context for logging
 */
export const timing = (): Middleware => {
  return async (req: Request, ctx: RequestContext, next: Handler) => {
    const response = await next(req, ctx);
    return response;
  };
};

/**
 * Logging middleware
 * Logs request details after the response is generated
 */
export const logging = (): Middleware => {
  return async (req: Request, ctx: RequestContext, next: Handler) => {
    const response = await next(req, ctx);
    const url = new URL(req.url);
    const elapsed = Date.now() - ctx.startTime;

    // Extract content-length from response headers if available
    const contentLength = response.headers.get("content-length");
    const logData: any = {
      remoteAddr: ctx.remoteAddress,
      userAgent: ctx.userAgent,
    };

    if (contentLength) {
      logData.contentLength = parseInt(contentLength, 10);
    }

    logRequest(LOG_FORMAT, req.method, url.pathname, response.status, elapsed, logData);
    return response;
  };
};

/**
 * Error handler middleware
 * Wraps the entire middleware chain and catches errors
 */
export const errorHandler = (handler: Handler): Handler => {
  return async (req: Request, ctx: RequestContext) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      const url = new URL(req.url);
      const elapsed = Date.now() - ctx.startTime;

      if (error instanceof ServiceError) {
        logRequest(LOG_FORMAT, req.method, url.pathname, error.statusCode, elapsed, {
          remoteAddr: ctx.remoteAddress,
          userAgent: ctx.userAgent,
        });

        if (error.statusCode === 401) {
          return respondUnauthorized();
        }

        return new Response(error.message, { status: error.statusCode });
      }

      // Unknown error - log as 500
      console.error(`✗ Unexpected error:`, error);
      logRequest(LOG_FORMAT, req.method, url.pathname, 500, elapsed, {
        remoteAddr: ctx.remoteAddress,
        userAgent: ctx.userAgent,
      });

      return new Response("Internal server error", { status: 500 });
    }
  };
};

/**
 * Compose middleware into a chain
 * Applies middleware in order, returning a handler
 */
export const compose = (middlewares: Middleware[], handler: Handler): Handler => {
  return middlewares.reduceRight(
    (next: Handler, middleware: Middleware) => (req: Request, ctx: RequestContext) =>
      middleware(req, ctx, next),
    handler
  );
};
