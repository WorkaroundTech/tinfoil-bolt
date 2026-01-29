/**
 * Index route handler
 * Handles GET / and GET /tinfoil
 */

import { type RequestContext, type Handler, ServiceError } from "../../types";
import { buildIndexPayload } from "../utils";

const INDEX_HTML = Bun.file(new URL("../../index.html", import.meta.url));

export const indexHandler: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "";
  const isBrowser = accept.includes("text/html");

  if (isBrowser) {
    if (!(await INDEX_HTML.exists())) {
      throw new ServiceError({
        statusCode: 500,
        message: "Index page missing",
      });
    }

    return new Response(INDEX_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const indexPayload = buildIndexPayload();
  return Response.json(indexPayload);
};
