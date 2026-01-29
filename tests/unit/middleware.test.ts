import { describe, it, expect, beforeEach } from "bun:test";
import { authorize, timing, logging, errorHandler, compose } from "../../src/middleware";
import { type RequestContext, ServiceError } from "../../src/types";

describe("middleware", () => {
  describe("authorize", () => {
    const mockReq = (authHeader?: string): Request => {
      return new Request("http://localhost/test", {
        headers: authHeader ? { authorization: authHeader } : {},
      });
    };

    it("should allow request when no auth is configured", async () => {
      const middleware = authorize(null);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      let handlerCalled = false;
      const handler = async () => {
        handlerCalled = true;
        return new Response("OK");
      };

      await middleware(mockReq(), ctx, handler);
      expect(handlerCalled).toBe(true);
    });

    it("should throw ServiceError when auth is required but missing", async () => {
      const middleware = authorize({ user: "admin", pass: "secret" });
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      const handler = async () => new Response("OK");

      let thrownError: ServiceError | null = null;
      try {
        await middleware(mockReq(), ctx, handler);
      } catch (error) {
        thrownError = error as ServiceError;
      }

      expect(thrownError).not.toBe(null);
      expect(thrownError?.statusCode).toBe(401);
    });

    it("should allow request with valid auth", async () => {
      const middleware = authorize({ user: "admin", pass: "secret" });
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      let handlerCalled = false;
      const handler = async () => {
        handlerCalled = true;
        return new Response("OK");
      };

      const authHeader = "Basic " + btoa("admin:secret");
      await middleware(mockReq(authHeader), ctx, handler);
      expect(handlerCalled).toBe(true);
    });
  });

  describe("timing", () => {
    it("should allow request to pass through", async () => {
      const middleware = timing();
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      let handlerCalled = false;
      const handler = async () => {
        handlerCalled = true;
        return new Response("OK");
      };

      const response = await middleware(req, ctx, handler);
      expect(handlerCalled).toBe(true);
      expect(response.status).toBe(200);
    });

    it("should measure request duration", async () => {
      const middleware = timing();
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now() - 100, // Started 100ms ago
      };
      const req = new Request("http://localhost/test");

      const handler = async () => new Response("OK");

      await middleware(req, ctx, handler);
      const elapsed = Date.now() - ctx.startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  describe("logging", () => {
    it("should log request and allow response to pass through", async () => {
      const middleware = logging();
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const handler = async () => new Response("OK");

      const response = await middleware(req, ctx, handler);
      expect(response.status).toBe(200);
    });
  });

  describe("errorHandler", () => {
    it("should catch ServiceError and return appropriate response", async () => {
      const handler: any = async () => {
        throw new ServiceError({
          statusCode: 404,
          message: "Not found",
        });
      };

      const wrappedHandler = errorHandler(handler);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const response = await wrappedHandler(req, ctx);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    });

    it("should handle 401 Unauthorized specially", async () => {
      const handler: any = async () => {
        throw new ServiceError({
          statusCode: 401,
          message: "Unauthorized",
        });
      };

      const wrappedHandler = errorHandler(handler);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const response = await wrappedHandler(req, ctx);
      expect(response.status).toBe(401);
    });

    it("should catch unexpected errors and return 500", async () => {
      const handler: any = async () => {
        throw new Error("Unexpected error");
      };

      const wrappedHandler = errorHandler(handler);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const response = await wrappedHandler(req, ctx);
      expect(response.status).toBe(500);
    });
  });

  describe("compose", () => {
    it("should chain middlewares in correct order", async () => {
      const callOrder: string[] = [];

      const middleware1: any = async (req: any, ctx: any, next: any) => {
        callOrder.push("m1-before");
        const res = await next(req, ctx);
        callOrder.push("m1-after");
        return res;
      };

      const middleware2: any = async (req: any, ctx: any, next: any) => {
        callOrder.push("m2-before");
        const res = await next(req, ctx);
        callOrder.push("m2-after");
        return res;
      };

      const handler: any = async () => {
        callOrder.push("handler");
        return new Response("OK");
      };

      const composed = compose([middleware1, middleware2], handler);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      await composed(req, ctx);
      expect(callOrder).toEqual(["m1-before", "m2-before", "handler", "m2-after", "m1-after"]);
    });

    it("should work with empty middleware array", async () => {
      const handler: any = async () => new Response("OK");
      const composed = compose([], handler);

      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const response = await composed(req, ctx);
      expect(response.status).toBe(200);
    });
  });
});
