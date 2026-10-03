import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSION } from "@/common/constants/app.constants";
import { IdParam, RequirePermissions, ResponseMessage } from "@/common/decorators";
import { ChangeRoleDto } from "@/modules/users/dto/change-role.dto";
import { CreateUserDto } from "@/modules/users/dto/create-user.dto";
import { QueryUsersDto } from "@/modules/users/dto/query-users.dto";
import { UpdateUserDto } from "@/modules/users/dto/update-user.dto";
import { UploadAvatarDto } from "@/modules/users/dto/upload-avatar.dto";
import type { User } from "@/modules/users/entities/user.entity";
import { USERS_MESSAGE } from "@/modules/users/users.constants";
import { UsersService } from "@/modules/users/users.service";
import type { PresignedUpload } from "@/infra/s3/s3.service";
import type { Paginated } from "@/common/types";

@ApiTags("Users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSION.USERS_READ)
  findAll(@Query() query: QueryUsersDto): Promise<Paginated<User>> {
    return this.users.findAll(query);
  }

  @Get(":id")
  @RequirePermissions(PERMISSION.USERS_READ)
  findOne(@IdParam() id: string): Promise<User> {
    return this.users.findOne(id, true);
  }

  @Post()
  @RequirePermissions(PERMISSION.USERS_CREATE)
  @ResponseMessage(USERS_MESSAGE.CREATED)
  create(@Body() dto: CreateUserDto): Promise<User> {
    return this.users.create(dto);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSION.USERS_UPDATE)
  @ResponseMessage(USERS_MESSAGE.UPDATED)
  update(@IdParam() id: string, @Body() dto: UpdateUserDto): Promise<User> {
    return this.users.update(id, dto);
  }

  @Patch(":id/role")
  @RequirePermissions(PERMISSION.USERS_MANAGE_ROLE)
  @ResponseMessage(USERS_MESSAGE.ROLE_UPDATED)
  changeRole(@IdParam() id: string, @Body() dto: ChangeRoleDto): Promise<User> {
    return this.users.changeRole(id, dto.role);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.USERS_DELETE)
  @ResponseMessage(USERS_MESSAGE.DELETED)
  remove(@IdParam() id: string): Promise<void> {
    return this.users.remove(id);
  }

  /** Soft delete is reversible — list with `?includeDeleted=true` to find the row. */
  @Patch(":id/restore")
  @RequirePermissions(PERMISSION.USERS_DELETE)
  @ResponseMessage(USERS_MESSAGE.RESTORED)
  restore(@IdParam() id: string): Promise<User> {
    return this.users.restore(id);
  }

  @Post(":id/avatar")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.USERS_UPDATE)
  @ResponseMessage(USERS_MESSAGE.AVATAR_UPLOAD_READY)
  uploadAvatar(@IdParam() id: string, @Body() dto: UploadAvatarDto): Promise<PresignedUpload> {
    return this.users.generateAvatarUpload(id, dto.contentType);
  }

  @Delete(":id/avatar")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.USERS_UPDATE)
  @ResponseMessage(USERS_MESSAGE.AVATAR_REMOVED)
  removeAvatar(@IdParam() id: string): Promise<void> {
    return this.users.removeAvatar(id);
  }
}
