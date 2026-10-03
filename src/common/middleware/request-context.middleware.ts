import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { LOGGING } from "@/common/constants/runtime";
import { runInRequestContext } from "@/common/context/request-context";

/** Anything longer or stranger than this is not a trace id we want in a log line. */
const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

/** Opens the async-local store and settles the correlation id. A caller's id wins, so
 *  one trace spans browser and API; anything odd is replaced, not trusted (injection). */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.headers[LOGGING.REQUEST_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId = candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();

    response.setHeader(LOGGING.REQUEST_ID_HEADER, requestId);
    runInRequestContext(requestId, next);
  }
}
