import { IsEnum } from "class-validator";
import { ROLE, type Role } from "@/common/constants/app.constants";

export class ChangeRoleDto {
  @IsEnum(ROLE)
  role: Role;
}
