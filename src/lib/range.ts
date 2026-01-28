/**
 * HTTP Range Request utilities
 * Handles RFC 7233 byte range requests for resumable downloads
 */

export interface RangeRequest {
  start: number;
  end: number;
}

/**
 * Parse Range header and return start/end bytes
 * Supports format: "bytes=start-end" or "bytes=start-" (open-ended)
 * 
 * @param rangeHeader - The Range header value (e.g., "bytes=0-1023")
 * @param fileSize - Total file size in bytes
 * @returns RangeRequest object with start/end, or null if invalid
 * 
 * @example
 * parseRange("bytes=0-99", 1000) // { start: 0, end: 99 }
 * parseRange("bytes=500-", 1000) // { start: 500, end: 999 }
 * parseRange("bytes=-500", 1000) // Last 500 bytes: { start: 500, end: 999 }
 * parseRange("bytes=1000-1099", 1000) // null (out of range)
 */
export function parseRange(rangeHeader: string, fileSize: number): RangeRequest | null {
  // Parse "bytes=..." format
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startStr, endStr] = match;

  // Both empty is invalid
  if (!startStr && !endStr) return null;

  let start: number;
  let end: number;

  if (startStr && endStr) {
    // Format: bytes=start-end
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);

    // Validate: start <= end and both within file bounds
    if (isNaN(start) || isNaN(end) || start > end || start >= fileSize) {
      return null;
    }

    // Clamp end to file size - 1
    end = Math.min(end, fileSize - 1);
  } else if (startStr) {
    // Format: bytes=start-
    start = parseInt(startStr, 10);
    if (isNaN(start) || start >= fileSize) return null;
    end = fileSize - 1;
  } else {
    // Format: bytes=-suffix (last N bytes)
    const suffix = parseInt(endStr || "0", 10);
    if (isNaN(suffix) || suffix <= 0) return null;
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  }

  return { start, end };
}

/**
 * Validate and handle multiple range support
 * Currently only single-range requests are supported
 * 
 * @param rangeHeader - The Range header value
 * @returns true if single range, false if multi-range (unsupported)
 */
export function isSingleRange(rangeHeader: string): boolean {
  // Check for comma (indicates multiple ranges)
  return !rangeHeader.includes(",");
}

/**
 * Generate Content-Range header value
 * Format: "bytes start-end/total"
 * 
 * @param start - Start byte position (inclusive)
 * @param end - End byte position (inclusive)
 * @param total - Total file size
 * @returns Content-Range header value
 * 
 * @example
 * getContentRangeHeader(0, 99, 1000) // "bytes 0-99/1000"
 */
export function getContentRangeHeader(start: number, end: number, total: number): string {
  return `bytes ${start}-${end}/${total}`;
}
