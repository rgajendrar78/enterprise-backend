import { NotFoundException } from "@nestjs/common";
import type { FindOperator, FindOptionsWhere, Repository } from "typeorm";
import type { PaginationQueryDto } from "@/common/dto/pagination-query.dto";
import { AbstractCrudService } from "@/database/services/abstract-crud.service";
import type { AbstractSoftDeleteEntity } from "@/database/entities/abstract-soft-delete.entity";

interface Widget extends AbstractSoftDeleteEntity {
  name: string;
  status: string;
}

class WidgetService extends AbstractCrudService<Widget> {
  protected readonly resourceName = "Widget";
  protected readonly sortableColumns = ["createdAt", "name"] as const;
  protected readonly searchableColumns = ["name"] as const;
  protected readonly filterableColumns = ["status"] as const;
  protected readonly dateRangeColumns = ["createdAt"] as const;

  constructor(protected readonly repo: Repository<Widget>) {
    super();
  }
}

const query = (extra: Record<string, unknown> = {}): PaginationQueryDto => ({
  page: 2,
  limit: 10,
  ...extra,
});

describe("AbstractCrudService", () => {
  const repo = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    softDelete: jest.fn().mockResolvedValue({ affected: 0 }),
    findOne: jest.fn(),
  };
  const service = new WidgetService(repo as unknown as Repository<Widget>);

  const findAllWith = async (params: Record<string, unknown>) => {
    await service.findAll(query(params));
    return repo.findAndCount.mock.calls.at(-1)?.[0] as {
      where: FindOptionsWhere<Widget> | FindOptionsWhere<Widget>[];
      order: Record<string, string>;
      skip: number;
      take: number;
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it("pages from the requested page, not from the top", async () => {
    const { skip, take } = await findAllWith({});
    expect({ skip, take }).toEqual({ skip: 10, take: 10 });
  });

  /** The key reaches the query builder, so anything not allow-listed must be dropped —
   *  otherwise `?passwordHash=x` filters on a column no endpoint ever exposed. */
  it("applies allow-listed filters and ignores every other query key", async () => {
    const { where } = await findAllWith({ status: "live", passwordHash: "x", role: "admin" });
    expect(where).toEqual({ status: "live" });
  });

  it("falls back to the default column when the sort is not allow-listed", async () => {
    expect((await findAllWith({ sort: "passwordHash:asc" })).order).toEqual({ createdAt: "DESC" });
    expect((await findAllWith({ sort: "name:asc" })).order).toEqual({ name: "ASC" });
  });

  /** Unescaped, a search for "50%" matches every row starting "50". */
  it("escapes LIKE wildcards and keeps the filters on every search branch", async () => {
    const { where } = await findAllWith({ search: "50%_x", status: "live" });
    const branches = where as FindOptionsWhere<Widget>[];

    expect(branches).toHaveLength(1);
    expect(branches[0]?.status).toBe("live");
    expect((branches[0]?.name as FindOperator<string>).value).toBe("%50\\%\\_x%");
  });

  it("turns two date bounds into one range and one bound into an open end", async () => {
    const both = await findAllWith({ createdAtFrom: "2026-01-01", createdAtTo: "2026-01-31" });
    expect((both.where as FindOptionsWhere<Widget>).createdAt).toMatchObject({ type: "between" });

    const open = await findAllWith({ createdAtFrom: "2026-01-01" });
    expect((open.where as FindOptionsWhere<Widget>).createdAt).toMatchObject({
      type: "moreThanOrEqual",
    });

    const none = await findAllWith({});
    expect((none.where as FindOptionsWhere<Widget>).createdAt).toBeUndefined();
  });

  it("404s by resource name when the row deleted nothing", async () => {
    await expect(service.remove("missing")).rejects.toThrow(
      new NotFoundException("Widget not found"),
    );
  });
});
