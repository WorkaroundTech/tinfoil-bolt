import { describe, it, expect } from "bun:test";
import { formatLog, type LogFormat } from "../src/lib/logger";

describe("logger formats", () => {
  const testContext = {
    method: "GET",
    path: "/shop.tfl",
    status: 200,
    contentLength: 2621440,
    responseTime: 287,
    userAgent: "Tinfoil/7.0",
  };

  it("should format logs in tiny format", () => {
    const result = formatLog("tiny" as LogFormat, testContext as any);
    expect(result).toBe("GET /shop.tfl 200 - 287ms");
  });

  it("should format logs in short format", () => {
    const result = formatLog("short" as LogFormat, testContext as any);
    expect(result).toBe("GET /shop.tfl 200 2.50MB - 287ms");
  });

  it("should include status code in all formats", () => {
    const formats: LogFormat[] = ["tiny", "short", "dev", "common", "combined"];
    formats.forEach((fmt) => {
      const result = formatLog(fmt, testContext as any);
      expect(result).toContain("200");
    });
  });

  it("should format file sizes correctly", () => {
    const smallFile = { ...testContext, contentLength: 512 };
    const result = formatLog("short" as LogFormat, smallFile as any);
    expect(result).toContain("512B");

    const largeFile = { ...testContext, contentLength: 1048576 };
    const result2 = formatLog("short" as LogFormat, largeFile as any);
    expect(result2).toContain("1.00MB");
  });

  it("should format time durations correctly", () => {
    const slowRequest = { ...testContext, responseTime: 1500 };
    const result = formatLog("tiny" as LogFormat, slowRequest as any);
    expect(result).toContain("1.50s");

    const fastRequest = { ...testContext, responseTime: 45 };
    const result2 = formatLog("tiny" as LogFormat, fastRequest as any);
    expect(result2).toContain("45ms");
  });
});
