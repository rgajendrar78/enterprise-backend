import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Observable, map } from "rxjs";
import { ERROR_MESSAGE } from "@/common/constants/errors";
import { RESPONSE_MESSAGE_KEY } from "@/common/decorators";
import type { ApiResponse, Paginated } from "@/common/types";

function isPaginated(value: unknown): value is Paginated<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Paginated<unknown>).items) &&
    typeof (value as Paginated<unknown>).meta === "object"
  );
}

/** Wraps every controller return value in the single success envelope. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor<unknown, ApiResponse<unknown>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<unknown>> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? ERROR_MESSAGE.SUCCESS;

    return next
      .handle()
      .pipe(
        map((value: unknown) =>
          isPaginated(value)
            ? { success: true, message, data: value.items, meta: value.meta }
            : { success: true, message, data: value ?? null },
        ),
      );
  }
}
