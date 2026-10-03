import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Permission } from "@/common/constants/app.constants";
import { PERMISSIONS_KEY } from "@/common/decorators";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new UnauthorizedException();

    const missing = required.filter((permission) => !user.permissions.includes(permission));
    if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(", ")}`);
    return true;
  }
}
