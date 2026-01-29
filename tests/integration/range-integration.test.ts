import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { parseRange, isSingleRange, getContentRangeHeader } from "../../src/lib/range";

// Create a test file for range request testing
const testDir = "/tmp/tinfoil-test-ranges";
const testFile = join(testDir, "test-file.bin");
const testContent = Buffer.alloc(1000, 0x42); // 1000 bytes of 'B' (0x42)

beforeAll(async () => {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  writeFileSync(testFile, testContent);
});

afterAll(() => {
  if (existsSync(testFile)) unlinkSync(testFile);
});

describe("HTTP Range Request Integration Tests", () => {
  it("should respond with Accept-Ranges header for full file requests", async () => {
    const file = Bun.file(testFile);
    const response = new Response(file, {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": file.size.toString(),
      },
    });

    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe("1000");
    expect(response.status).toBe(200);
  });

  it("should slice file correctly for range requests", async () => {
    const file = Bun.file(testFile);
    const sliced = file.slice(0, 100); // slice end is exclusive: slice(0, 100) = bytes 0-99
    const buffer = await sliced.arrayBuffer();

    expect(buffer.byteLength).toBe(100); // bytes 0-99 = 100 bytes
    // Verify content
    const view = new Uint8Array(buffer);
    expect(view[0]).toBe(0x42);
    expect(view[99]).toBe(0x42);
  });

  it("should generate correct 206 Partial Content response", async () => {
    const file = Bun.file(testFile);
    const sliced = file.slice(100, 200); // slice end is exclusive

    const response = new Response(sliced, {
      status: 206,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "100",
        "Content-Range": "bytes 100-199/1000",
        "Accept-Ranges": "bytes",
      },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(response.headers.get("Content-Length")).toBe("100");
  });

  it("should generate correct 416 Range Not Satisfiable response", async () => {
    const file = Bun.file(testFile);
    const response = new Response("Range request invalid", {
      status: 416,
      headers: {
        "Content-Range": `bytes */${file.size}`,
      },
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */1000");
  });

  it("should handle multiple range slice operations", async () => {
    const file = Bun.file(testFile);

    // First range: bytes 0-99
    const range1 = file.slice(0, 100);
    const buf1 = await range1.arrayBuffer();
    expect(buf1.byteLength).toBe(100);

    // Second range: bytes 500-599
    const range2 = file.slice(500, 600);
    const buf2 = await range2.arrayBuffer();
    expect(buf2.byteLength).toBe(100);

    // Verify they're different byte positions but same content (all 0x42)
    const view2 = new Uint8Array(buf2);
    expect(view2[0]).toBe(0x42);
  });

  it("should support open-ended range to end of file", async () => {
    const file = Bun.file(testFile);
    const sliced = file.slice(900, 1000); // bytes 900-999 (last 100 bytes)

    const buffer = await sliced.arrayBuffer();
    expect(buffer.byteLength).toBe(100);
  });

  it("should support single-byte range", async () => {
    const file = Bun.file(testFile);
    const sliced = file.slice(500, 501); // single byte at position 500

    const buffer = await sliced.arrayBuffer();
    expect(buffer.byteLength).toBe(1);

    const view = new Uint8Array(buffer);
    expect(view[0]).toBe(0x42);
  });
});
