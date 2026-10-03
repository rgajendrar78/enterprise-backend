import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { EntityNotFoundError, QueryFailedError } from "typeorm";
import { ERROR_CODE, ERROR_MESSAGE, PG_ERROR } from "@/common/constants/errors";
import type { ApiErrorResponse } from "@/common/types";
import { env } from "@/config/env";

interface NormalizedError {
  status: number;
  message: string;
  errorCode: string;
  details?: unknown;
}

const SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

const FRIENDLY_MESSAGE: Partial<Record<number, string>> = {
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_MESSAGE.TOO_MANY_REQUESTS,
};

/** Clients branch on `errorCode`, so it is always SCREAMING_SNAKE, never Nest's "Not Found". */
function codeFor(status: number): string {
  return HttpStatus[status] ?? ERROR_CODE.HTTP_ERROR;
}

function fromHttpException(exception: HttpException): NormalizedError {
  const status = exception.getStatus();
  const payload = exception.getResponse();
  if (typeof payload === "string") {
    return { status, message: FRIENDLY_MESSAGE[status] ?? payload, errorCode: codeFor(status) };
  }

  const body = payload as { message?: string | string[]; errorCode?: string };
  return Array.isArray(body.message)
    ? {
        status,
        message: ERROR_MESSAGE.VALIDATION_FAILED,
        errorCode: ERROR_CODE.VALIDATION_FAILED,
        details: body.message,
      }
    : {
        status,
        message: FRIENDLY_MESSAGE[status] ?? body.message ?? exception.message,
        errorCode: body.errorCode ?? codeFor(status),
      };
}

function normalize(exception: unknown): NormalizedError {
  if (exception instanceof HttpException) return fromHttpException(exception);

  if (exception instanceof EntityNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      message: ERROR_MESSAGE.NOT_FOUND,
      errorCode: codeFor(HttpStatus.NOT_FOUND),
    };
  }

  if (exception instanceof QueryFailedError) {
    const code = (exception.driverError as { code?: string } | undefined)?.code;
    if (code === PG_ERROR.UNIQUE_VIOLATION) {
      return {
        status: HttpStatus.CONFLICT,
        message: ERROR_MESSAGE.DUPLICATE_RESOURCE,
        errorCode: ERROR_CODE.DUPLICATE_RESOURCE,
      };
    }
    if (code === PG_ERROR.FOREIGN_KEY_VIOLATION) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: ERROR_MESSAGE.FOREIGN_KEY_VIOLATION,
        errorCode: ERROR_CODE.FOREIGN_KEY_VIOLATION,
      };
    }
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: ERROR_MESSAGE.INTERNAL_SERVER_ERROR,
    errorCode: ERROR_CODE.INTERNAL_SERVER_ERROR,
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const { status, message, errorCode, details } = normalize(exception);

    response.locals.errorCode = errorCode;
    response.locals.errorMessage = message;

    if (status >= SERVER_ERROR_STATUS) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status} ${errorCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      message,
      errorCode,
      ...(details ? { details } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    // Stack traces are a debugging aid, never a production response.
    if (!env.isProduction && exception instanceof Error && status >= SERVER_ERROR_STATUS) {
      body.details = exception.stack;
    }

    response.status(status).json(body);
  }
}
