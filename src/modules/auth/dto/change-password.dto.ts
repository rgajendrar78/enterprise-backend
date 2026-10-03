import { IsString, MaxLength } from "class-validator";
import { VALIDATION } from "@/common/constants/validation";
import { PasswordField } from "@/common/decorators";

export class ChangePasswordDto {
  /** Only length-checked: the rules may have tightened since it was set. */
  @IsString()
  @MaxLength(VALIDATION.PASSWORD_MAX)
  currentPassword: string;

  @PasswordField()
  newPassword: string;
}
