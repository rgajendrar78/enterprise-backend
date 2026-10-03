/** Owned by the users module — nothing outside it needs these. */
export const USERS = {
  BCRYPT_ROUNDS: 12,
  PROFILE_CACHE_TTL_SECONDS: 60,
  SORTABLE_COLUMNS: ["createdAt", "email", "role", "isActive"],
  SEARCHABLE_COLUMNS: ["email"],
  FILTERABLE_COLUMNS: ["role", "isActive"],
  DATE_RANGE_COLUMNS: ["createdAt"],
  /** Long enough to arrive by email, short enough that a leaked link goes stale. */
  PASSWORD_RESET_TTL_MINUTES: 30,
  PASSWORD_RESET_TOKEN_BYTES: 32,
  AVATAR_KEY_PREFIX: "avatars/",
} as const;

export const USERS_MESSAGE = {
  CREATED: "User created",
  UPDATED: "User updated",
  ROLE_UPDATED: "Role updated",
  DELETED: "User deleted",
  RESTORED: "User restored",
  AVATAR_UPLOAD_READY: "Avatar upload URL generated",
  AVATAR_REMOVED: "Avatar removed",
} as const;

export const usersProfileCacheKey = (id: string) => `users:profile:${id}`;
