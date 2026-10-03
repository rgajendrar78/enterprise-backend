import { NotFoundException } from "@nestjs/common";
import {
  ILike,
  type DeepPartial,
  type FindOptionsOrder,
  type FindOptionsWhere,
  type ObjectLiteral,
  type Repository,
} from "typeorm";
import type { PaginationQueryDto } from "@/common/dto/pagination-query.dto";
import type { Paginated } from "@/common/types";
import { dateRange } from "@/common/utils/date-range.util";
import { buildOrder, paginate, skipOf } from "@/common/utils/pagination.util";
import type { AbstractSoftDeleteEntity } from "@/database/entities/abstract-soft-delete.entity";

type Column<T> = Extract<keyof T, string>;

/** List, read, soft-delete and restore for every resource; a module declares only its
 *  repository and columns. Writes stay `protected` and rules stay in the module. */
export abstract class AbstractCrudService<T extends AbstractSoftDeleteEntity & ObjectLiteral> {
  protected abstract readonly repo: Repository<T>;
  protected abstract readonly resourceName: string;
  protected abstract readonly sortableColumns: readonly Column<T>[];
  protected readonly searchableColumns: readonly Column<T>[] = [];
  protected readonly filterableColumns: readonly Column<T>[] = [];
  protected readonly dateRangeColumns: readonly Column<T>[] = [];

  async findAll(
    query: PaginationQueryDto,
    extraFilters: FindOptionsWhere<T> = {},
  ): Promise<Paginated<T>> {
    const filters = { ...this.filtersFrom(query), ...this.rangesFrom(query), ...extraFilters };
    const [items, totalCount] = await this.repo.findAndCount({
      where: this.buildWhere(query.search, filters),
      order: buildOrder(
        query.sort,
        this.sortableColumns,
        this.sortableColumns[0],
      ) as FindOptionsOrder<T>,
      skip: skipOf(query.page, query.limit),
      take: query.limit,
      withDeleted: query.includeDeleted,
    });
    return paginate(items, totalCount, query.page, query.limit);
  }

  async findOne(id: string, includeDeleted = false): Promise<T> {
    const entity = await this.repo.findOne({
      where: { id } as FindOptionsWhere<T>,
      withDeleted: includeDeleted,
    });
    if (!entity) throw this.notFound();
    return entity;
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repo.softRemove(entity);
    await this.onChanged(id);
  }

  async restore(id: string): Promise<T> {
    const entity = await this.findOne(id, true);
    if (!entity) throw this.notFound();

    // Explicitly set deletedAt to null and save so the AuditSubscriber runs and stamps updatedBy
    entity.deletedAt = null;
    await this.repo.save(entity);

    await this.onChanged(id);
    return this.findOne(id);
  }

  protected async saveNew(data: DeepPartial<T>): Promise<T> {
    const { id } = await this.repo.save(this.repo.create(data));
    await this.onChanged(id);
    return this.findOne(id);
  }

  protected async applyUpdate(id: string, data: DeepPartial<T>): Promise<T> {
    const entity = await this.repo.preload({ id, ...data });
    if (!entity) throw this.notFound();
    await this.repo.save(entity);
    await this.onChanged(id);
    return this.findOne(id);
  }

  protected notFound(): NotFoundException {
    return new NotFoundException(`${this.resourceName} not found`);
  }

  protected onChanged(_id: string): Promise<void> {
    return Promise.resolve();
  }

  protected filtersFrom(query: PaginationQueryDto): FindOptionsWhere<T> {
    const sent = query as unknown as Record<string, unknown>;
    const filters: Record<string, unknown> = {};
    for (const column of this.filterableColumns) {
      if (sent[column] !== undefined) filters[column] = sent[column];
    }
    return filters as FindOptionsWhere<T>;
  }

  protected rangesFrom(query: PaginationQueryDto): FindOptionsWhere<T> {
    const sent = query as unknown as Record<string, string | undefined>;
    const ranges: Record<string, unknown> = {};

    for (const column of this.dateRangeColumns) {
      const range = dateRange(sent[`${column}From`], sent[`${column}To`]);
      if (range) ranges[column] = range;
    }
    return ranges as FindOptionsWhere<T>;
  }

  protected buildWhere(
    search: string | undefined,
    filters: FindOptionsWhere<T>,
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (!search || this.searchableColumns.length === 0) return filters;
    const term = escapeLikeWildcards(search);
    return this.searchableColumns.map((column) => ({
      ...filters,
      [column]: ILike(`%${term}%`),
    }));
  }
}

/** `%` and `_` are wildcards to LIKE, so an unescaped search for "50%" matches every
 *  row starting "50". Backslash is Postgres's default escape character. */
function escapeLikeWildcards(search: string): string {
  return search.replace(/[\\%_]/g, (character) => `\\${character}`);
}
