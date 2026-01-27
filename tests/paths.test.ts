import { describe, it, expect } from "bun:test";
import { encodePath } from "../src/lib/paths";

describe("paths", () => {
  describe("encodePath", () => {
    it("should split path and encode segments", () => {
      const result = encodePath("games/subfolder/file.nsp");
      expect(result).toBe("games/subfolder/file.nsp");
    });

    it("should handle single level paths", () => {
      const result = encodePath("games");
      expect(result).toBe("games");
    });

    it("should encode special characters in path segments", () => {
      const result = encodePath("games/My Game (2023)/file.nsp");
      expect(result).toBe("games/My%20Game%20(2023)/file.nsp");
    });

    it("should handle empty string", () => {
      const result = encodePath("");
      expect(result).toBe("");
    });

    it("should filter out empty segments from trailing slashes", () => {
      const result = encodePath("games/");
      expect(result).toBe("games");
    });

    it("should encode spaces in segments", () => {
      const result = encodePath("games/My Game Collection/title.nsp");
      expect(result).toBe("games/My%20Game%20Collection/title.nsp");
    });

    it("should handle paths with multiple special characters", () => {
      const result = encodePath("games/Game & Collection/[Update] Title.nsp");
      expect(result).toContain("%26"); // &
      expect(result).toContain("%5B"); // [
      expect(result).toContain("%5D"); // ]
    });
  });
});
