import { HttpStatus, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
const mockEnv = {
  isProduction: false,
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_SECONDS: 604800,
};
jest.mock("@/config/env", () => ({ env: mockEnv }));

import { PERMISSION, ROLE } from "@/common/constants/app.constants";
import { ERROR_CODE } from "@/common/constants/errors";
import { AppException } from "@/common/exceptions/app.exception";
import type { SessionRevocationService } from "@/common/services/session-revocation.service";
import { AuthService } from "@/modules/auth/auth.service";
import type { UsersService } from "@/modules/users/users.service";
import type { UserProfile } from "@/modules/users/users.types";

describe("AuthService", () => {
  const jwt = { signAsync: jest.fn().mockResolvedValue("token"), verifyAsync: jest.fn() };
  const users = {
    verifyCredentials: jest.fn(),
    findProfile: jest.fn(),
    issuePasswordReset: jest.fn(),
  };
  const revocations = { revokeAllFor: jest.fn(), isRevoked: jest.fn().mockResolvedValue(false) };
  const service = new AuthService(
    users as unknown as UsersService,
    jwt as unknown as JwtService,
    revocations as unknown as SessionRevocationService,
  );

  const credentials = { email: "admin@example.com", password: "Password1" };
  const profile: UserProfile = {
    id: "uuid-1",
    email: "test@example.com",
    role: ROLE.ADMIN,
    isActive: true,
    profile: {
      name: "Test User",
      imageUrl: null,
    },
  };

  beforeEach(() => jest.clearAllMocks());

  // The users module answers null for both an unknown address and a wrong password,
  // having spent the same bcrypt cost, so neither the wording nor the timing differs.
  it("rejects unknown credentials with the generic message", async () => {
    users.verifyCredentials.mockResolvedValue(null);

    await expect(service.login(credentials)).rejects.toThrow(UnauthorizedException);
    await expect(service.login(credentials)).rejects.toThrow("Invalid email or password");
  });

  it("tells a deactivated user why, but only once the password is right", async () => {
    users.verifyCredentials.mockResolvedValue({ ...profile, isActive: false });

    const rejection = await service.login(credentials).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(AppException);
    expect((rejection as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((rejection as AppException).getResponse()).toMatchObject({
      errorCode: ERROR_CODE.ACCOUNT_DISABLED,
    });
  });

  it("issues both tokens and resolves permissions from the role", async () => {
    users.verifyCredentials.mockResolvedValue(profile);

    const session = await service.login(credentials);

    expect(session.accessToken).toBe("token");
    expect(session.refreshToken).toBe("token");
    expect(session.user.permissions).toContain(PERMISSION.USERS_DELETE);
    expect(jwt.signAsync).toHaveBeenCalledTimes(2);
  });

  it("ends the session when the account behind a refresh token is gone", async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: "1a2b", type: "refresh" });
    users.findProfile.mockRejectedValue(new Error("User not found"));

    await expect(service.refresh("refresh-token")).rejects.toThrow(UnauthorizedException);
  });

  // A live reset token in a log is an account takeover for anyone who can read logs,
  // and log readers are usually a wider group than database readers.
  it("never logs the reset token in production", async () => {
    users.issuePasswordReset.mockResolvedValue("secret-token");
    const written: string[] = [];
    jest.spyOn(service["logger"], "log").mockImplementation((m) => written.push(String(m)));

    mockEnv.isProduction = true;
    try {
      await expect(service.forgotPassword(credentials.email)).resolves.toBeUndefined();
      expect(written.join()).not.toContain("secret-token");
    } finally {
      mockEnv.isProduction = false;
    }

    await expect(service.forgotPassword(credentials.email)).resolves.toBe("secret-token");
  });
});
