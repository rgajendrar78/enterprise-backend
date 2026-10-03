import type { Permission, Role } from "@/common/constants/app.constants";

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

/** What a paginated service method returns; the response interceptor unwraps it. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access" | "refresh";
  /** Stamped by the signer, so it is absent when signing and present when verifying.
   *  `SessionRevocationService` compares it against the user's last revocation. */
  iat?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  permissions: readonly Permission[];
}
