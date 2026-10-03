import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { Permission } from "@/common/constants/app.constants";
import type { AuthenticatedUser } from "@/common/types";

export * from "@/common/decorators/validation";

export const IS_PUBLIC_KEY = "isPublic";
export const PERMISSIONS_KEY = "permissions";
export const RESPONSE_MESSAGE_KEY = "responseMessage";

/** Skip the global JWT guard for this route/controller. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Overrides the `message` field of the success envelope. */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE_KEY, message);

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<Request>().user;
    return field && user ? user[field] : user;
  },
);
