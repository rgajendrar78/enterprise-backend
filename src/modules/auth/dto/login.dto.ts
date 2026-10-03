import { IsString, MaxLength, MinLength } from "class-validator";
import { VALIDATION } from "@/common/constants/validation";
import { EmailField } from "@/common/decorators";

export class LoginDto {
  @EmailField()
  email: string;

  /** Length only — the password rules may have tightened since this one was set, and
   *  rejecting it here would lock the owner out of their own reset. */
  @IsString()
  @MinLength(VALIDATION.PASSWORD_MIN)
  @MaxLength(VALIDATION.PASSWORD_MAX)
  password: string;
}
