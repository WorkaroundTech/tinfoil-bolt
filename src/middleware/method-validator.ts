/**
 * HTTP Method validation middleware
 * Validates that requests use allowed HTTP methods
 */

import { type Handler, type RequestContext, ServiceError } from "../types";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

/**
 * Creates a middleware that validates HTTP methods
 * @param allowedMethods - Array of allowed HTTP methods for this route/handler
 * @returns Handler that validates the request method
 */
export function methodValidator(allowedMethods: HttpMethod[]): (handler: Handler) => Handler {
  const allowedSet = new Set(allowedMethods);
  
  return (handler: Handler) => {
    return async (req: Request, ctx: RequestContext) => {
      const method = req.method.toUpperCase() as HttpMethod;
      
      // Handle OPTIONS requests for CORS preflight
      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Allow": allowedMethods.join(", "),
            "Access-Control-Allow-Methods": allowedMethods.join(", "),
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      
      // Validate method is allowed
      if (!allowedSet.has(method)) {
        throw new ServiceError({
          statusCode: 405,
          message: `Method ${method} not allowed`,
          headers: {
            "Allow": allowedMethods.join(", "),
          },
        });
      }
      
      return handler(req, ctx);
    };
  };
}
