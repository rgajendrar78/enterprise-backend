import { EmailField } from "@/common/decorators";

export class ForgotPasswordDto {
  @EmailField()
  email: string;
}
