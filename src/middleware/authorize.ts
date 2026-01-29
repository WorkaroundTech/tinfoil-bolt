/**
 * Authorization middleware
 * Checks if the request is authorized, throws ServiceError if not
 */

import { type Middleware, ServiceError } from "../types";
import { isAuthorized } from "../lib/auth";

export const authorize = (authPair: { user: string; pass: string } | null): Middleware => {
  return async (req: Request, ctx, next) => {
    if (!isAuthorized(req, authPair)) {
      throw new ServiceError({
        statusCode: 401,
        message: "Unauthorized",
      });
    }
    return next(req, ctx);
  };
};
