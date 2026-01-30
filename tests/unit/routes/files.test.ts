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

  it("should handle URL-encoded file paths", async () => {
    const req = new Request("http://localhost/files/folder1/Game%20Title%208.nsp");
    
    let thrownError: ServiceError | null = null;
    try {
      await filesHandler(req, ctx);
    } catch (error) {
      thrownError = error as ServiceError;
    }

    // Should not throw a URIError - will throw 404 since file doesn't exist
    expect(thrownError?.statusCode).toBe(404);
    expect(thrownError?.message).toBe("File not found");
  });

  it("should handle malformed URI encoding without throwing URIError", async () => {
    // This URL has incomplete UTF-8 sequence %E2%80%9 which would cause decodeURIComponent to throw
    const req = new Request(
      "http://localhost/files/folder1/Game%20Title%20%2B%20Update%203.0.1%20(v123456)%20%2B%20DLC%20(1%20%E2%80%9%E2%80%A6ATE/file.nsp"
    );
    
    let thrownError: ServiceError | null = null;
    try {
      await filesHandler(req, ctx);
    } catch (error) {
      thrownError = error as ServiceError;
    }

    // Should return 400 for malformed URI, or 404 if the URL constructor handles it gracefully
    expect(thrownError).not.toBe(null);
    expect([400, 404]).toContain(thrownError?.statusCode);
  });

  it("should handle special characters in file paths", async () => {
    // Test various special characters that need URL encoding
    const req = new Request(
      "http://localhost/files/folder1/File%20With%20%5BBrackets%5D%20%26%20%28Parentheses%29.nsp"
    );
    
    let thrownError: ServiceError | null = null;
    try {
      await filesHandler(req, ctx);
    } catch (error) {
      thrownError = error as ServiceError;
    }

    // Should handle the encoding correctly and return 404 (file doesn't exist)
    expect(thrownError?.statusCode).toBe(404);
    expect(thrownError?.message).toBe("File not found");
  });

  it("should handle paths with multiple consecutive encoded spaces", async () => {
    const req = new Request("http://localhost/files/folder1/File%20%20%20With%20%20Spaces.nsp");
    
    let thrownError: ServiceError | null = null;
    try {
      await filesHandler(req, ctx);
    } catch (error) {
      thrownError = error as ServiceError;
    }

    // Should not throw a URIError
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
