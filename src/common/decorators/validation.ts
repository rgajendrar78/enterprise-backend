import { Param, ParseUUIDPipe, applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { PASSWORD_MESSAGE, PASSWORD_PATTERN, VALIDATION } from "@/common/constants/validation";

export const EmailField = () => applyDecorators(IsEmail(), MaxLength(VALIDATION.EMAIL_MAX));

/** A password being **set**. One being offered for a check is length-only: the rules may
 *  have tightened since it was chosen, and rejecting it here would lock the owner out. */
export const PasswordField = () =>
  applyDecorators(
    IsString(),
    Length(VALIDATION.PASSWORD_MIN, VALIDATION.PASSWORD_MAX),
    Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE }),
  );

export const BooleanQuery = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }) => value === "true" || value === true),
    IsBoolean(),
  );

export const DateQuery = () => applyDecorators(IsOptional(), IsDateString({ strict: true }));

/** Every `:id` is a uuid. Without the pipe a malformed one reaches Postgres and comes
 *  back a 500 instead of the 400 it is. */
export const IdParam = () => Param("id", ParseUUIDPipe);
