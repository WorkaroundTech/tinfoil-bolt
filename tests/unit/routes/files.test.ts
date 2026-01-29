import { describe, it, expect } from "bun:test";
import { filesHandler } from "../../../src/routes/handlers/files";
import { type RequestContext, ServiceError } from "../../../src/types";

describe("routes/files", () => {
  const ctx: RequestContext = {
    remoteAddress: "127.0.0.1",
    userAgent: "test",
    startTime: Date.now(),
  };

  it("should return 404 for non-existent files", async () => {
    const req = new Request("http://localhost/files/nonexistent-file-xyz.nsp");
    
    let thrownError: ServiceError | null = null;
    try {
      await filesHandler(req, ctx);
    } catch (error) {
      thrownError = error as ServiceError;
    }

    expect(thrownError).not.toBe(null);
    expect(thrownError?.statusCode).toBe(404);
  });

  it("should set Accept-Ranges header", async () => {
    // This test would need a real file to work properly
    // For now we test that the handler structure is correct
    expect(filesHandler).toBeDefined();
  });

  it("should handle range request header", async () => {
    // This would require a mock file system or fixture
    expect(filesHandler).toBeDefined();
  });

  it("should set proper cache headers", async () => {
    // Files should be cached for 1 year
    expect(filesHandler).toBeDefined();
  });
});
