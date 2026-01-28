import { describe, it, expect } from "bun:test";
import { parseRange, isSingleRange, getContentRangeHeader } from "../src/lib/range";

describe("Range Request Utilities", () => {
  describe("parseRange", () => {
    describe("valid ranges", () => {
      it("should parse standard range format (bytes=start-end)", () => {
        const result = parseRange("bytes=0-99", 1000);
        expect(result).toEqual({ start: 0, end: 99 });
      });

      it("should parse open-ended range (bytes=start-)", () => {
        const result = parseRange("bytes=500-", 1000);
        expect(result).toEqual({ start: 500, end: 999 });
      });

      it("should parse suffix range (bytes=-suffix)", () => {
        const result = parseRange("bytes=-500", 1000);
        expect(result).toEqual({ start: 500, end: 999 });
      });

      it("should clamp end byte to file size - 1", () => {
        const result = parseRange("bytes=900-2000", 1000);
        expect(result).toEqual({ start: 900, end: 999 });
      });

      it("should handle single byte range", () => {
        const result = parseRange("bytes=0-0", 1000);
        expect(result).toEqual({ start: 0, end: 0 });
      });

      it("should handle range at end of file", () => {
        const result = parseRange("bytes=999-999", 1000);
        expect(result).toEqual({ start: 999, end: 999 });
      });

      it("should handle suffix smaller than file size", () => {
        const result = parseRange("bytes=-100", 1000);
        expect(result).toEqual({ start: 900, end: 999 });
      });

      it("should handle suffix larger than file size", () => {
        const result = parseRange("bytes=-2000", 1000);
        expect(result).toEqual({ start: 0, end: 999 });
      });
    });

    describe("invalid ranges", () => {
      it("should return null for malformed range", () => {
        expect(parseRange("invalid", 1000)).toBeNull();
      });

      it("should return null for wrong prefix", () => {
        expect(parseRange("kilobytes=0-99", 1000)).toBeNull();
      });

      it("should return null when start > end", () => {
        expect(parseRange("bytes=99-0", 1000)).toBeNull();
      });

      it("should return null when start >= file size", () => {
        expect(parseRange("bytes=1000-1099", 1000)).toBeNull();
      });

      it("should return null when both start and end are empty", () => {
        expect(parseRange("bytes=-", 1000)).toBeNull();
      });

      it("should return null for negative suffix", () => {
        expect(parseRange("bytes=--100", 1000)).toBeNull();
      });

      it("should return null for zero suffix", () => {
        expect(parseRange("bytes=-0", 1000)).toBeNull();
      });

      it("should return null for empty file", () => {
        expect(parseRange("bytes=0-99", 0)).toBeNull();
      });

      it("should return null when start equals file size", () => {
        expect(parseRange("bytes=1000-", 1000)).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should handle large file sizes", () => {
        const largeSize = 1099511627776; // 1TB
        const result = parseRange("bytes=0-1023", largeSize);
        expect(result).toEqual({ start: 0, end: 1023 });
      });

      it("should handle single byte file", () => {
        const result = parseRange("bytes=0-0", 1);
        expect(result).toEqual({ start: 0, end: 0 });
      });

      it("should reject range on single byte file beyond bounds", () => {
        expect(parseRange("bytes=1-", 1)).toBeNull();
      });
    });
  });

  describe("isSingleRange", () => {
    it("should return true for single range", () => {
      expect(isSingleRange("bytes=0-99")).toBe(true);
    });

    it("should return true for open-ended range", () => {
      expect(isSingleRange("bytes=500-")).toBe(true);
    });

    it("should return false for multi-range requests", () => {
      expect(isSingleRange("bytes=0-99, 200-299")).toBe(false);
    });

    it("should return false for multiple comma-separated ranges", () => {
      expect(isSingleRange("bytes=0-99, 200-299, 400-499")).toBe(false);
    });
  });

  describe("getContentRangeHeader", () => {
    it("should generate correct Content-Range header", () => {
      const result = getContentRangeHeader(0, 99, 1000);
      expect(result).toBe("bytes 0-99/1000");
    });

    it("should handle full file range", () => {
      const result = getContentRangeHeader(0, 999, 1000);
      expect(result).toBe("bytes 0-999/1000");
    });

    it("should handle middle range", () => {
      const result = getContentRangeHeader(500, 599, 1000);
      expect(result).toBe("bytes 500-599/1000");
    });

    it("should handle single byte", () => {
      const result = getContentRangeHeader(0, 0, 1);
      expect(result).toBe("bytes 0-0/1");
    });

    it("should handle large file sizes", () => {
      const largeSize = 1099511627776; // 1TB
      const result = getContentRangeHeader(0, 1023, largeSize);
      expect(result).toBe(`bytes 0-1023/${largeSize}`);
    });
  });
});
