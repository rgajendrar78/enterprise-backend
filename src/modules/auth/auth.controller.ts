import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, Public, ResponseMessage } from "@/common/decorators";
import { AUTH, AUTH_MESSAGE } from "@/modules/auth/auth.constants";
import { AuthService } from "@/modules/auth/auth.service";
import type { AuthSession, AuthUserProfile, PasswordResetIssued } from "@/modules/auth/auth.types";
import { ChangePasswordDto } from "@/modules/auth/dto/change-password.dto";
import { ForgotPasswordDto } from "@/modules/auth/dto/forgot-password.dto";
import { LoginDto } from "@/modules/auth/dto/login.dto";
import { RefreshTokenDto } from "@/modules/auth/dto/refresh-token.dto";
import { ResetPasswordDto } from "@/modules/auth/dto/reset-password.dto";
import { UpdateProfileDto } from "@/modules/auth/dto/update-profile.dto";
import { UploadAvatarDto } from "@/modules/users/dto/upload-avatar.dto";
import type { PresignedUpload } from "@/infra/s3/s3.service";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH.LOGIN_RATE_LIMIT })
  @ResponseMessage(AUTH_MESSAGE.LOGGED_IN)
  login(@Body() dto: LoginDto): Promise<AuthSession> {
    return this.auth.login(dto);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthSession> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get("me")
  @ApiBearerAuth()
  me(@CurrentUser("id") userId: string): Promise<AuthUserProfile> {
    return this.auth.profile(userId);
  }

  @Patch("profile")
  @ApiBearerAuth()
  @ResponseMessage(AUTH_MESSAGE.PROFILE_UPDATED)
  updateProfile(
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<AuthUserProfile> {
    return this.auth.updateProfile(userId, dto);
  }

  @Post("profile/avatar")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ResponseMessage(AUTH_MESSAGE.AVATAR_UPLOAD_READY)
  uploadProfileAvatar(
    @CurrentUser("id") userId: string,
    @Body() dto: UploadAvatarDto,
  ): Promise<PresignedUpload> {
    return this.auth.generateProfileAvatarUpload(userId, dto.contentType);
  }

  @Delete("profile/avatar")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ResponseMessage(AUTH_MESSAGE.AVATAR_REMOVED)
  removeProfileAvatar(@CurrentUser("id") userId: string): Promise<void> {
    return this.auth.removeProfileAvatar(userId);
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH.FORGOT_PASSWORD_RATE_LIMIT })
  @ResponseMessage(AUTH_MESSAGE.FORGOT_PASSWORD)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<PasswordResetIssued> {
    // Same response for a known and an unknown address — the only difference is
    // whether an email went out. `resetToken` is a non-production convenience.
    return { resetToken: await this.auth.forgotPassword(dto.email) };
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH.RESET_PASSWORD_RATE_LIMIT })
  @ResponseMessage(AUTH_MESSAGE.PASSWORD_RESET)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto);
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ResponseMessage(AUTH_MESSAGE.PASSWORD_CHANGED)
  changePassword(@CurrentUser("id") userId: string, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.auth.changePassword(userId, dto);
  }
}
