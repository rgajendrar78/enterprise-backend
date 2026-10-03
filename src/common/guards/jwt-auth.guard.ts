import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { permissionsForRole } from "@/common/constants/app.constants";
import { ERROR_MESSAGE } from "@/common/constants/errors";
import { setCurrentUserId } from "@/common/context/request-context";
import { IS_PUBLIC_KEY } from "@/common/decorators";
import { SessionRevocationService } from "@/common/services/session-revocation.service";
import type { JwtPayload } from "@/common/types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly revocations: SessionRevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = request.headers.authorization?.split(" ") ?? [];
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException(ERROR_MESSAGE.MISSING_TOKEN);
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGE.INVALID_ACCESS_TOKEN);
    }
    if (payload.type !== "access") {
      throw new UnauthorizedException(ERROR_MESSAGE.WRONG_TOKEN_TYPE);
    }
    // A signature only proves the token was issued, not that it should still work:
    // the password may have changed or the account been disabled since.
    if (await this.revocations.isRevoked(payload)) {
      throw new UnauthorizedException(ERROR_MESSAGE.INVALID_ACCESS_TOKEN);
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: permissionsForRole(payload.role),
    };
    // Anything downstream can now ask who is acting without being handed the id:
    // `AuditSubscriber` stamps createdBy/updatedBy, services block self-lockout.
    setCurrentUserId(payload.sub);
    return true;
  }
}
