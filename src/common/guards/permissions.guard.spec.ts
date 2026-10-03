import { ForbiddenException, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { PERMISSION, ROLE } from "@/common/constants/app.constants";
import type { AuthenticatedUser } from "@/common/types";
import { PermissionsGuard } from "@/common/guards/permissions.guard";

const contextFor = (user?: AuthenticatedUser): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const guardRequiring = (...required: string[]) => {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new PermissionsGuard(reflector);
};

const userWith = (...permissions: string[]) =>
  ({ id: "u1", email: "a@b.c", role: ROLE.USER, permissions }) as AuthenticatedUser;

describe("PermissionsGuard", () => {
  it("lets a route with no declared permission through", () => {
    expect(guardRequiring().canActivate(contextFor(userWith()))).toBe(true);
  });

  it("refuses an unauthenticated caller on a guarded route", () => {
    expect(() => guardRequiring(PERMISSION.USERS_READ).canActivate(contextFor())).toThrow(
      UnauthorizedException,
    );
  });

  it("requires every listed permission, not any of them", () => {
    const guard = guardRequiring(PERMISSION.USERS_READ, PERMISSION.USERS_DELETE);

    expect(() => guard.canActivate(contextFor(userWith(PERMISSION.USERS_READ)))).toThrow(
      ForbiddenException,
    );
    expect(
      guard.canActivate(contextFor(userWith(PERMISSION.USERS_READ, PERMISSION.USERS_DELETE))),
    ).toBe(true);
  });

  it("names what is missing, so the client can say why", () => {
    expect(() =>
      guardRequiring(PERMISSION.USERS_MANAGE_ROLE).canActivate(contextFor(userWith())),
    ).toThrow(PERMISSION.USERS_MANAGE_ROLE);
  });
});
