import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { ROLE, type Role } from "@/common/constants/app.constants";
import { VALIDATION } from "@/common/constants/validation";
import { EmailField, PasswordField } from "@/common/decorators";

export class CreateUserDto {
  @EmailField()
  email: string;

  @IsString()
  @Length(VALIDATION.NAME_MIN, VALIDATION.NAME_MAX)
  name: string;

  @PasswordField()
  password: string;

  @IsOptional()
  @IsEnum(ROLE)
  role?: Role;
}
