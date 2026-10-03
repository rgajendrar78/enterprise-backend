/** `errorCode` values clients branch on. Stable API contract — never reword one in place. */
export const ERROR_CODE = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  DUPLICATE_RESOURCE: "DUPLICATE_RESOURCE",
  FOREIGN_KEY_VIOLATION: "FOREIGN_KEY_VIOLATION",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  HTTP_ERROR: "HTTP_ERROR",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  INVALID_RESET_TOKEN: "INVALID_RESET_TOKEN",
} as const;

export const ERROR_MESSAGE = {
  SUCCESS: "Success",
  VALIDATION_FAILED: "Validation failed",
  MISSING_TOKEN: "Missing access token",
  INVALID_ACCESS_TOKEN: "Invalid or expired access token",
  INVALID_REFRESH_TOKEN: "Invalid or expired refresh token",
  WRONG_TOKEN_TYPE: "Invalid token type",
  DUPLICATE_RESOURCE: "Resource already exists",
  FOREIGN_KEY_VIOLATION: "Related resource not found",
  INTERNAL_SERVER_ERROR: "Internal server error",
  TOO_MANY_REQUESTS: "Too many attempts. Wait a moment and try again.",
  NOT_FOUND: "Resource not found",
  /** Same text for a wrong email and a wrong password — never reveal which. */
  INVALID_CREDENTIALS: "Invalid email or password",
  ACCOUNT_DISABLED: "This account has been deactivated. Contact an administrator.",
  INVALID_RESET_TOKEN: "This password reset link is invalid or has expired",
  CURRENT_PASSWORD_WRONG: "Current password is incorrect",
  SELF_DEACTIVATE: "You cannot deactivate your own account",
  SELF_DELETE: "You cannot delete your own account",
  SELF_ROLE_CHANGE: "You cannot change your own role",
  LAST_ADMIN: "This is the last active admin — promote another admin first",
} as const;

export const PG_ERROR = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
} as const;
