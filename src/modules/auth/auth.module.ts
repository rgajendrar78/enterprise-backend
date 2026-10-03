import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { env } from "@/config/env";
import { AuthController } from "@/modules/auth/auth.controller";
import { AuthService } from "@/modules/auth/auth.service";
import { UsersModule } from "@/modules/users/users.module";

@Module({
  imports: [
    UsersModule,
    // `global` so the app-wide JwtAuthGuard can inject JwtService.
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_ACCESS_TTL_SECONDS },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
