import { IsEnum, IsOptional } from "class-validator";
import { ROLE, type Role } from "@/common/constants/app.constants";
import { BooleanQuery, DateQuery } from "@/common/decorators";
import { PaginationQueryDto } from "@/common/dto/pagination-query.dto";

export class QueryUsersDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ROLE)
  role?: Role;

  @BooleanQuery()
  isActive?: boolean;

  /** `yyyy-mm-dd`, inclusive at both ends. The names are the convention the base reads:
   *  `<column>From` / `<column>To` for every entry in `dateRangeColumns`. */
  @DateQuery()
  createdAtFrom?: string;

  @DateQuery()
  createdAtTo?: string;
}
