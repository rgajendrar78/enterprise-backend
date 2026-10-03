import { OmitType, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";
import { CreateUserDto } from "@/modules/users/dto/create-user.dto";

/** Password and role change through dedicated endpoints, never a generic PATCH. */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ["password", "role"] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
