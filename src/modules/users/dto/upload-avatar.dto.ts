import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { S3_CONSTANTS } from "@/infra/s3/s3.constants";

export class UploadAvatarDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(S3_CONSTANTS.ALLOWED_MIME_TYPES, {
    message: `Content type must be one of: ${S3_CONSTANTS.ALLOWED_MIME_TYPES.join(", ")}`,
  })
  contentType: string;
}
