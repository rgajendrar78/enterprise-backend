import { buildOrder, paginate, skipOf } from "@/common/utils/pagination.util";

describe("pagination.util", () => {
  it("computes page count and never reports zero pages", () => {
    expect(paginate([1, 2], 21, 2, 10).meta).toEqual({
      page: 2,
      limit: 10,
      totalCount: 21,
      totalPages: 3,
    });
    expect(paginate([], 0, 1, 10).meta.totalPages).toBe(1);
  });

  it("computes the offset", () => {
    expect(skipOf(1, 20)).toBe(0);
    expect(skipOf(3, 20)).toBe(40);
  });

  it("only orders by allow-listed columns", () => {
    const allowed = ["createdAt", "email"] as const;
    expect(buildOrder("email:asc", allowed, "createdAt")).toEqual({ email: "ASC" });
    expect(buildOrder("password; DROP TABLE users", allowed, "createdAt")).toEqual({
      createdAt: "DESC",
    });
    expect(buildOrder(undefined, allowed, "createdAt")).toEqual({ createdAt: "DESC" });
    // A rejected column takes its direction with it — a typo is not a request to
    // read the list oldest-first.
    expect(buildOrder("typo:asc", allowed, "createdAt")).toEqual({ createdAt: "DESC" });
  });
});
