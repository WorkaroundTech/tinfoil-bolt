/**
 * Shop data building logic
 */

import { BASES, GLOB_PATTERN, SUCCESS_MESSAGE } from "../config";
import { encodePath } from "../lib/paths";

export interface ShopData {
  files: Array<{ url: string; size: number }>;
  directories: string[];
  success?: string;
}

/**
 * Scans all configured base directories and builds shop data
 */
export async function buildShopData(): Promise<ShopData> {
  const fileEntries: { virtualPath: string; absPath: string }[] = [];
  const directories = new Set<string>();

  // Scan ALL directories
  await Promise.all(
    BASES.map(async ({ path: dir, alias }) => {
      const glob = new Bun.Glob(GLOB_PATTERN);
      for await (const file of glob.scan({ cwd: dir, onlyFiles: true })) {
        const virtualPath = `${alias}/${file}`;
        fileEntries.push({ virtualPath, absPath: `${dir}/${file}` });

        const dirName = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
        if (dirName.length > 0) {
          directories.add(`${alias}/${dirName}`);
        } else {
          directories.add(alias);
        }
      }
      console.log(`[SHOP] Scanned ${fileCount} files from ${alias} (${dir})`);
    })
  );

  const shopData: ShopData = {
    files: fileEntries.map(({ virtualPath, absPath }) => ({
      url: `../files/${encodePath(virtualPath)}`,
      size: Bun.file(absPath).size,
    })),
    directories: Array.from(directories).map((d) => `../files/${encodePath(d)}`),
  };

  // Add success message if configured
  if (SUCCESS_MESSAGE) {
    shopData.success = SUCCESS_MESSAGE;
  }

  return shopData;
}
