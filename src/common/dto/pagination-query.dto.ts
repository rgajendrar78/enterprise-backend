import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/common/constants/app.constants";
import { VALIDATION } from "@/common/constants/validation";
import { BooleanQuery } from "@/common/decorators";

/** Extend this in a feature DTO instead of re-declaring page/limit/sort/search. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sort?: string;

  @IsOptional()
  @IsString()
  @MaxLength(VALIDATION.SEARCH_MAX)
  search?: string;

  /** Soft-deleted rows are hidden by default; `?includeDeleted=true` to restore one. */
  @BooleanQuery()
  includeDeleted?: boolean;
}
