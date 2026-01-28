/**
 * Files route handler
 * Handles GET /files/*
 */

import { type RequestContext, type Handler, ServiceError } from "../types";
import { resolveVirtualPath } from "../lib/paths";
import { parseRange, isSingleRange, getContentRangeHeader } from "../lib/range";

export const filesHandler: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);
  const decodedPath = decodeURIComponent(url.pathname);
  const virtualPath = decodedPath.replace("/files/", "");
  
  const resolved = await resolveVirtualPath(virtualPath);

  if (!resolved) {
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const fileSize = resolved.file.size;
  const rangeHeader = req.headers.get("range");

  // Check for Range header to support resumable downloads
  if (rangeHeader) {
    // Reject multi-range requests (not supported)
    if (!isSingleRange(rangeHeader)) {
      return new Response("Multiple ranges not supported", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    // Parse the range
    const range = parseRange(rangeHeader, fileSize);

    if (!range) {
      // Invalid range request - return 416 Range Not Satisfiable
      return new Response("Range request invalid", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    // Return partial content
    // Note: HTTP Range is inclusive on both ends, but BunFile.slice() is exclusive on the end
    // So we need to pass (end + 1) to slice()
    const partialFile = resolved.file.slice(range.start, range.end + 1);
    const contentLength = range.end - range.start + 1;

    return new Response(partialFile, {
      status: 206,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": contentLength.toString(),
        "Content-Range": getContentRangeHeader(range.start, range.end, fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000", // 1 year for immutable files
      },
    });
  }

  // No Range header - return full file
  return new Response(resolved.file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": fileSize.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000", // 1 year for immutable files
    },
  });
};
