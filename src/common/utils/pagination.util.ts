import type { Paginated } from "@/common/types";

export function paginate<T>(
  items: T[],
  totalCount: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    items,
    meta: { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) },
  };
}

export function skipOf(page: number, limit: number): number {
  return (page - 1) * limit;
}

/** `?sort=createdAt:asc` -> `{ createdAt: "ASC" }`; the allow-list is what makes it injection-safe. */
export function buildOrder<T extends string>(
  sort: string | undefined,
  allowed: readonly T[],
  fallback: T,
): Record<string, "ASC" | "DESC"> {
  const [field, direction] = (sort ?? "").split(":");
  // An unknown column means no sort was given, direction included — honouring it would
  // silently answer `?sort=typo:asc` with the list flipped to oldest-first.
  if (!allowed.includes(field as T)) return { [fallback]: "DESC" };
  return { [field]: direction?.toLowerCase() === "asc" ? "ASC" : "DESC" };
}
