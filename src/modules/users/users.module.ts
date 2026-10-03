import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Profile } from "@/modules/users/entities/profile.entity";
import { User } from "@/modules/users/entities/user.entity";
import { UsersController } from "@/modules/users/users.controller";
import { UsersService } from "@/modules/users/users.service";

@Module({
  imports: [TypeOrmModule.forFeature([User, Profile])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // other modules talk to users through this service only
})
export class UsersModule {}
