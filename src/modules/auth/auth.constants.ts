export const AUTH = {
  /** Tighter than the global limit: login is the credential-stuffing target. */
  LOGIN_RATE_LIMIT: { limit: 5, ttl: 60_000 },
  FORGOT_PASSWORD_RATE_LIMIT: { limit: 3, ttl: 900_000 },
  RESET_PASSWORD_RATE_LIMIT: { limit: 10, ttl: 900_000 },
} as const;

export const AUTH_MESSAGE = {
  LOGGED_IN: "Logged in",
  /** Said whether or not the address exists, so the endpoint reveals nothing. */
  FORGOT_PASSWORD: "If that email has an account, a password reset link is on its way",
  PASSWORD_RESET: "Password updated — you can sign in now",
  PASSWORD_CHANGED: "Password updated",
  PROFILE_UPDATED: "Profile updated",
  AVATAR_UPLOAD_READY: "Avatar upload URL generated",
  AVATAR_REMOVED: "Avatar removed",
} as const;
