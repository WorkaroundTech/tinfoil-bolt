import { describe, it, expect, beforeEach } from "bun:test";
import { ShopDataCache, type ShopData } from "../../src/lib/cache";

describe("ShopDataCache", () => {
  let cache: ShopDataCache;
  const mockShopData: ShopData = {
    files: [{ url: "/file1.nsp", size: 1024 }],
    directories: ["games"],
    success: "Test message",
  };

  beforeEach(() => {
    cache = new ShopDataCache(1); // 1 second TTL for testing
  });

  it("should return null when cache is empty", () => {
    expect(cache.get()).toBe(null);
  });

  it("should store and retrieve data", () => {
    cache.set(mockShopData);
    const result = cache.get();
    expect(result).not.toBe(null);
    expect(result?.files).toEqual(mockShopData.files);
    expect(result?.directories).toEqual(mockShopData.directories);
  });

  it("should return valid cache status", () => {
    expect(cache.isValid()).toBe(false);
    cache.set(mockShopData);
    expect(cache.isValid()).toBe(true);
  });

  it("should expire cache after TTL", async () => {
    cache = new ShopDataCache(0.1); // 100ms TTL
    cache.set(mockShopData);
    expect(cache.get()).not.toBe(null);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cache.get()).toBe(null);
  });

  it("should reset cache", () => {
    cache.set(mockShopData);
    expect(cache.get()).not.toBe(null);
    cache.reset();
    expect(cache.get()).toBe(null);
  });

  it("should preserve success message in cached data", () => {
    cache.set(mockShopData);
    const result = cache.get();
    expect(result?.success).toBe("Test message");
  });

  it("should handle data without success message", () => {
    const dataWithoutSuccess: ShopData = {
      files: [],
      directories: [],
    };
    cache.set(dataWithoutSuccess);
    const result = cache.get();
    expect(result?.success).toBeUndefined();
  });
});
