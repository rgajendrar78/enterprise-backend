import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { VALIDATION } from "@/common/constants/validation";

export class UpdateProfileDto {
  /**
   * The user's full name.
   * @example "John Doe"
   */
  @IsOptional()
  @IsString()
  @MinLength(VALIDATION.NAME_MIN)
  @MaxLength(VALIDATION.NAME_MAX)
  name?: string;

  /**
   * The confirmed S3 object key for the user's avatar.
   * @example "avatars/u1-uuid.jpg"
   */
  @IsOptional()
  @IsString()
  imageKey?: string;
}
