import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { permissionsForRole } from "@/common/constants/app.constants";
import { ERROR_CODE, ERROR_MESSAGE } from "@/common/constants/errors";
import { AppException } from "@/common/exceptions/app.exception";
import { SessionRevocationService } from "@/common/services/session-revocation.service";
import type { JwtPayload } from "@/common/types";
import { env } from "@/config/env";
import type { AuthSession, AuthUserProfile } from "@/modules/auth/auth.types";
import type { ChangePasswordDto } from "@/modules/auth/dto/change-password.dto";
import type { LoginDto } from "@/modules/auth/dto/login.dto";
import type { ResetPasswordDto } from "@/modules/auth/dto/reset-password.dto";
import type { UpdateProfileDto } from "@/modules/auth/dto/update-profile.dto";
import type { UserProfile } from "@/modules/users/users.types";
import { UsersService } from "@/modules/users/users.service";
import type { PresignedUpload } from "@/infra/s3/s3.service";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly revocations: SessionRevocationService,
  ) {}

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.users.verifyCredentials(dto.email, dto.password);
    if (!user) throw new UnauthorizedException(ERROR_MESSAGE.INVALID_CREDENTIALS);

    // Only after the password checks out, so this cannot be used to enumerate
    // accounts: it tells the person who *owns* the account why they are stuck.
    assertActive(user);
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGE.INVALID_REFRESH_TOKEN);
    }
    if (payload.type !== "refresh") {
      throw new UnauthorizedException(ERROR_MESSAGE.WRONG_TOKEN_TYPE);
    }
    // Otherwise a password change would end the access token but leave the refresh
    // token minting new ones — the session would survive the very thing meant to end it.
    if (await this.revocations.isRevoked(payload)) {
      throw new UnauthorizedException(ERROR_MESSAGE.INVALID_REFRESH_TOKEN);
    }

    const user = await this.users.findProfile(payload.sub).catch(() => {
      throw new UnauthorizedException(ERROR_MESSAGE.INVALID_REFRESH_TOKEN);
    });
    assertActive(user);
    return this.issueSession(user);
  }

  async profile(userId: string): Promise<AuthUserProfile> {
    const user = await this.users.findProfile(userId);
    assertActive(user);
    return toProfile(user);
  }

  async forgotPassword(email: string): Promise<string | undefined> {
    const token = await this.users.issuePasswordReset(email);
    if (!token) return undefined;

    if (env.isProduction) {
      this.logger.log(`Password reset requested for ${email}`);
      return undefined;
    }

    this.logger.log(`Password reset requested for ${email}: token=${token}`);
    return token;
  }

  resetPassword(dto: ResetPasswordDto): Promise<void> {
    return this.users.resetPassword(dto.token, dto.password);
  }

  changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    return this.users.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<AuthUserProfile> {
    await this.users.updateProfile(userId, dto);
    return this.profile(userId);
  }

  generateProfileAvatarUpload(userId: string, contentType: string): Promise<PresignedUpload> {
    return this.users.generateAvatarUpload(userId, contentType);
  }

  async removeProfileAvatar(userId: string): Promise<void> {
    await this.users.removeAvatar(userId);
  }

  private async issueSession(user: UserProfile): Promise<AuthSession> {
    const claims = { sub: user.id, email: user.email, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...claims, type: "access" } satisfies JwtPayload, {
        expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      }),
      this.jwt.signAsync({ ...claims, type: "refresh" } satisfies JwtPayload, {
        expiresIn: env.JWT_REFRESH_TTL_SECONDS,
      }),
    ]);
    return { accessToken, refreshToken, user: toProfile(user) };
  }
}

function assertActive(user: { isActive: boolean }): void {
  if (!user.isActive) throw new AppException(ERROR_CODE.ACCOUNT_DISABLED);
}

function toProfile(user: UserProfile): AuthUserProfile {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: permissionsForRole(user.role),
    profile: user.profile,
  };
}
