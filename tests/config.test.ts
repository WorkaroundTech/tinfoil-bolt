import { describe, it, expect } from "bun:test";
import { buildBaseAliases } from "../src/config";

describe("config", () => {
  describe("buildBaseAliases", () => {
    it("should create single alias for single directory", () => {
      const result = buildBaseAliases(["/data/games"]);
      expect(result).toHaveLength(1);
      expect(result[0].alias).toBe("games");
      expect(result[0].path).toBe("/data/games");
    });

    it("should extract basename from nested paths", () => {
      const result = buildBaseAliases(["/mnt/nas/switch_games"]);
      expect(result[0].alias).toBe("switch_games");
      expect(result[0].path).toBe("/mnt/nas/switch_games");
    });

    it("should number duplicate directory names", () => {
      const result = buildBaseAliases(["/mnt/games", "/usb/games"]);
      expect(result).toHaveLength(2);
      expect(result[0].alias).toBe("games");
      expect(result[1].alias).toBe("games-2");
    });

    it("should handle multiple duplicates correctly", () => {
      const result = buildBaseAliases([
        "/path1/games",
        "/path2/games",
        "/path3/games",
      ]);
      expect(result[0].alias).toBe("games");
      expect(result[1].alias).toBe("games-2");
      expect(result[2].alias).toBe("games-3");
    });

    it("should handle mixed unique and duplicate names", () => {
      const result = buildBaseAliases([
        "/data/games",
        "/data/backups",
        "/usb/games",
      ]);
      expect(result[0].alias).toBe("games");
      expect(result[1].alias).toBe("backups");
      expect(result[2].alias).toBe("games-2");
    });

    it("should default to 'games' for root directory", () => {
      const result = buildBaseAliases(["/"]);
      expect(result[0].alias).toBe("games");
    });

    it("should handle empty array", () => {
      const result = buildBaseAliases([]);
      expect(result).toHaveLength(0);
    });
  });
});
