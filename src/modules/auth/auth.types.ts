import type { Permission, Role } from "@/common/constants/app.constants";

export interface AuthUserProfile {
  id: string;
  email: string;
  role: Role;
  permissions: readonly Permission[];
  profile: {
    name: string;
    imageUrl: string | null;
  };
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUserProfile;
}

/** `resetToken` is present outside production only — see `AuthService.forgotPassword`. */
export interface PasswordResetIssued {
  resetToken?: string;
}
