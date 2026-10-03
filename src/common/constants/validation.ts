/** Mirrors the client's field rules. Change here and in the client together. */
export const VALIDATION = {
  EMAIL_MAX: 180,
  NAME_MIN: 2,
  NAME_MAX: 120,
  PASSWORD_MIN: 8,
  /** bcrypt only reads the first 72 bytes. */
  PASSWORD_MAX: 72,
  SEARCH_MAX: 120,
  RESET_TOKEN_MAX: 128,
} as const;

export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export const PASSWORD_MESSAGE = `Password must be ${VALIDATION.PASSWORD_MIN}-${VALIDATION.PASSWORD_MAX} characters and contain a letter and a number`;
