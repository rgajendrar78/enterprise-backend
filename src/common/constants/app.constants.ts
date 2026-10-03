export const ROLE = {
  ADMIN: "admin",
  MANAGER: "manager",
  USER: "user",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const PERMISSION = {
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",
  /** Changing a role is privilege escalation — never bundled with USERS_UPDATE. */
  USERS_MANAGE_ROLE: "users:manage-role",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

const ALL_PERMISSIONS = Object.values(PERMISSION);

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [ROLE.ADMIN]: ALL_PERMISSIONS,
  [ROLE.MANAGER]: [PERMISSION.USERS_READ, PERMISSION.USERS_CREATE, PERMISSION.USERS_UPDATE],
  [ROLE.USER]: [PERMISSION.USERS_READ],
};

/** The only way to turn a role into permissions — guard and token issuer must agree. */
export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
