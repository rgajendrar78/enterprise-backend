import { IsString, MaxLength } from "class-validator";
import { VALIDATION } from "@/common/constants/validation";
import { PasswordField } from "@/common/decorators";

export class ResetPasswordDto {
  @IsString()
  @MaxLength(VALIDATION.RESET_TOKEN_MAX)
  token: string;

  @PasswordField()
  password: string;
}
