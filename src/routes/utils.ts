/**
 * Route handler utilities
 */

import { SUCCESS_MESSAGE } from "../config";

export interface IndexPayload {
  files: Array<{ url: string; size: number }>;
  directories: string[];
  success?: string;
}

/**
 * Builds the index payload for the root and /tinfoil endpoints
 */
export function buildIndexPayload(): IndexPayload {
  const payload: IndexPayload = {
    files: [
      { url: "shop.json", size: 0 },
      { url: "shop.tfl", size: 0 },
    ],
    directories: [],
  };

  if (SUCCESS_MESSAGE) {
    payload.success = SUCCESS_MESSAGE;
  }

  return payload;
}
