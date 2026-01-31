/**
 * Type definitions for the tinfoil-bolt server
 */

export interface RequestContext<T = any> {
  remoteAddress: string;
  userAgent: string;
  startTime: number;
  data?: T;
}

export interface ServiceErrorOptions {
  statusCode: number;
  message: string;
  details?: Record<string, any>;
  headers?: Record<string, string>;
}

export class ServiceError extends Error {
  statusCode: number;
  details?: Record<string, any>;
  headers?: Record<string, string>;

  constructor(options: ServiceErrorOptions) {
    super(options.message);
    this.name = "ServiceError";
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.headers = options.headers;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

export type Handler = (req: Request, ctx: RequestContext) => Promise<Response>;
export type Middleware = (req: Request, ctx: RequestContext, next: Handler) => Promise<Response>;
