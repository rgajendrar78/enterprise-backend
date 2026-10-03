import type { IncomingMessage, ServerResponse } from "node:http";
import { RequestMethod, type LoggerService } from "@nestjs/common";
import type { Params } from "nestjs-pino";
import { stdTimeFunctions } from "pino";
import { currentRequestId, currentUserId } from "@/common/context/request-context";
import { LOGGING } from "@/common/constants/runtime";
import { env } from "@/config/env";

interface ResponseWithError extends ServerResponse {
  locals?: { errorCode?: string; errorMessage?: string };
}

const HEALTH_PATH = "/health";

export const loggerConfig: Params = {
  forRoutes: [{ path: "{*path}", method: RequestMethod.ALL }],
  pinoHttp: {
    level: env.LOG_LEVEL,
    messageKey: "message",
    timestamp: stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: {
      service: env.SERVICE_NAME,
      version: env.SERVICE_VERSION,
      env: env.NODE_ENV,
    },
    /** Correlation without threading a logger through call stacks: every line of a
     *  request carries the same `requestId`, and `userId` once the token is verified. */
    mixin() {
      const requestId = currentRequestId();
      const userId = currentUserId();
      return { ...(requestId ? { requestId } : {}), ...(userId ? { userId } : {}) };
    },
    serializers: {
      req: (request: IncomingMessage & { url?: string; method?: string }) => ({
        method: request.method,
        url: request.url,
      }),
      res: (response: ServerResponse) => ({ statusCode: response.statusCode }),
    },
    customProps: (_request, response) => {
      const { errorCode, errorMessage } = (response as ResponseWithError).locals ?? {};
      return errorCode ? { errorCode, errorMessage } : {};
    },
    customLogLevel: (_request, response, error) => {
      if (error || response.statusCode >= LOGGING.SERVER_ERROR_STATUS) return "error";
      if (response.statusCode >= LOGGING.CLIENT_ERROR_STATUS) return "warn";
      return "info";
    },
    /** Defence in depth. The serializers already keep headers and bodies out, so this
     *  should never match — it is for the day someone logs an object by hand. */
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        ...LOGGING.SECRET_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
      ],
      censor: "[redacted]",
    },
    autoLogging: {
      ignore: (request: IncomingMessage) => request.url?.includes(HEALTH_PATH) ?? false,
    },
  },
};

const NEST_BOOTSTRAP_CONTEXTS = new Set([
  "NestFactory",
  "InstanceLoader",
  "RoutesResolver",
  "RouterExplorer",
  "NestApplication",
]);

export function withoutBootChatter(base: LoggerService): LoggerService {
  return {
    log: (message: unknown, ...rest: unknown[]): void => {
      const context = rest.at(-1);
      if (typeof context === "string" && NEST_BOOTSTRAP_CONTEXTS.has(context)) return;
      base.log(message, ...rest);
    },
    error: (message: unknown, ...rest: unknown[]): void => {
      base.error(message, ...rest);
    },
    warn: (message: unknown, ...rest: unknown[]): void => {
      base.warn(message, ...rest);
    },
    debug: (message: unknown, ...rest: unknown[]): void => {
      base.debug?.(message, ...rest);
    },
    verbose: (message: unknown, ...rest: unknown[]): void => {
      base.verbose?.(message, ...rest);
    },
    fatal: (message: unknown, ...rest: unknown[]): void => {
      base.fatal?.(message, ...rest);
    },
  };
}
