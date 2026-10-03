/** App-wide runtime limits. Module-specific numbers live in that module's own constants file. */
export const HTTP_LIMITS = {
  BODY_SIZE: "1mb",
} as const;

export const DATABASE = {
  CONNECTION_TIMEOUT_MS: 5_000,
  IDLE_TIMEOUT_MS: 30_000,
  STATEMENT_TIMEOUT_MS: 30_000,
  RETRY_ATTEMPTS: 5,
  RETRY_DELAY_MS: 2_000,
} as const;

export const REDIS_LIMITS = {
  MAX_RETRIES_PER_REQUEST: 2,
  CONNECT_TIMEOUT_MS: 5_000,
} as const;

export const HEALTH = {
  DB_PING_TIMEOUT_MS: 3_000,
  HEAP_LIMIT_BYTES: 512 * 1024 * 1024,
} as const;

export const LOGGING = {
  CLIENT_ERROR_STATUS: 400,
  SERVER_ERROR_STATUS: 500,
  REQUEST_ID_HEADER: "x-request-id",
  /** Never allowed into a log line, at any depth — safer than omitting per call site. */
  SECRET_FIELDS: [
    "password",
    "newPassword",
    "currentPassword",
    "passwordHash",
    "token",
    "accessToken",
    "refreshToken",
    "resetToken",
    "passwordResetTokenHash",
    "secret",
    "authorization",
  ],
} as const;
