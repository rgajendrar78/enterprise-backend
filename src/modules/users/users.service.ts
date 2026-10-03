import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { compare, hash, hashSync } from "bcryptjs";
import { Not, Repository } from "typeorm";
import { ROLE, type Role } from "@/common/constants/app.constants";
import { ERROR_CODE, ERROR_MESSAGE } from "@/common/constants/errors";
import { currentUserId } from "@/common/context/request-context";
import { AppException } from "@/common/exceptions/app.exception";
import { AbstractCrudService } from "@/database/services/abstract-crud.service";
import { SessionRevocationService } from "@/common/services/session-revocation.service";
import { CacheService } from "@/infra/redis/cache.service";
import { S3Service, type PresignedUpload } from "@/infra/s3/s3.service";
import type { CreateUserDto } from "@/modules/users/dto/create-user.dto";
import type { UpdateUserDto } from "@/modules/users/dto/update-user.dto";
import { User } from "@/modules/users/entities/user.entity";
import type { UserProfile } from "@/modules/users/users.types";
import { USERS, usersProfileCacheKey } from "@/modules/users/users.constants";
import { randomUUID } from "node:crypto";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const isFuture = (date: Date | null): boolean => date !== null && date.getTime() > Date.now();

/** A real hash of a value nobody holds, so a missing user costs the same compare as a
 *  present one. Built once at boot; matching rounds is what makes the timing equal. */
const DUMMY_PASSWORD_HASH = hashSync(randomBytes(32).toString("hex"), USERS.BCRYPT_ROUNDS);

@Injectable()
export class UsersService extends AbstractCrudService<User> {
  protected readonly resourceName = "User";
  protected readonly sortableColumns = USERS.SORTABLE_COLUMNS;
  protected readonly searchableColumns = USERS.SEARCHABLE_COLUMNS;
  protected readonly filterableColumns = USERS.FILTERABLE_COLUMNS;
  protected readonly dateRangeColumns = USERS.DATE_RANGE_COLUMNS;

  constructor(
    @InjectRepository(User)
    protected readonly repo: Repository<User>,
    private readonly cache: CacheService,
    private readonly revocations: SessionRevocationService,
    private readonly s3: S3Service,
  ) {
    super();
  }

  protected onChanged(id: string): Promise<void> {
    return this.cache.del(usersProfileCacheKey(id));
  }

  findProfile(id: string): Promise<UserProfile> {
    return this.cache.wrap(usersProfileCacheKey(id), USERS.PROFILE_CACHE_TTL_SECONDS, async () => {
      const user = await this.findOne(id);
      return {
        id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        profile: {
          name: user.profile?.name ?? "",
          imageUrl: user.profile?.imageUrl ?? null,
        },
      };
    });
  }

  async verifyCredentials(email: string, password: string): Promise<UserProfile | null> {
    const user = await this.repo.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
      relations: { profile: true },
    });

    const matches = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !matches) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      profile: {
        name: user.profile?.name ?? "",
        imageUrl: user.profile?.imageUrl ?? null,
      },
    };
  }

  async create(dto: CreateUserDto): Promise<User> {
    return this.saveNew({
      email: dto.email,
      role: dto.role,
      passwordHash: await hash(dto.password, USERS.BCRYPT_ROUNDS),
      profile: { name: dto.name },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    if (dto.isActive === false) {
      this.assertNotSelf(id, ERROR_MESSAGE.SELF_DEACTIVATE);
      await this.assertNotLastActiveAdmin(id);
    }

    // Split the DTO if it contains profile data, though UpdateUserDto currently doesn't
    // but doing it for safety if it ever does.
    const user = await this.applyUpdate(id, dto);

    if (dto.isActive === false) await this.revocations.revokeAllFor(id);
    return user;
  }

  async updateProfile(id: string, data: { name?: string; imageKey?: string }): Promise<User> {
    const user = await this.findOne(id);
    const profileUpdate: Partial<User["profile"]> = { ...user.profile };

    if (data.name !== undefined) profileUpdate.name = data.name;

    const currentKey = user.profile?.imageUrl
      ? this.s3.extractKeyFromUrl(user.profile.imageUrl)
      : null;
    if (data.imageKey !== undefined && data.imageKey !== currentKey) {
      if (currentKey) {
        this.s3.deleteObject(currentKey).catch(() => {});
      }
      profileUpdate.imageUrl = data.imageKey;
    }

    return this.applyUpdate(id, { profile: profileUpdate });
  }

  async changeRole(id: string, role: Role): Promise<User> {
    this.assertNotSelf(id, ERROR_MESSAGE.SELF_ROLE_CHANGE);
    if (role !== ROLE.ADMIN) await this.assertNotLastActiveAdmin(id);

    const user = await this.applyUpdate(id, { role });
    await this.revocations.revokeAllFor(id);
    return user;
  }

  async remove(id: string): Promise<void> {
    this.assertNotSelf(id, ERROR_MESSAGE.SELF_DELETE);
    await this.assertNotLastActiveAdmin(id);
    await super.remove(id);
    await this.revocations.revokeAllFor(id);
  }

  async generateAvatarUpload(id: string, contentType: string): Promise<PresignedUpload> {
    const extension = contentType.split("/")[1] || "bin";
    const key = `${USERS.AVATAR_KEY_PREFIX}${id}-${randomUUID()}.${extension}`;
    return this.s3.generatePresignedUpload(key, contentType);
  }

  async removeAvatar(id: string): Promise<void> {
    const user = await this.findOne(id);
    if (!user.profile?.imageUrl) return;

    const oldKey = this.s3.extractKeyFromUrl(user.profile.imageUrl);
    if (oldKey) {
      await this.s3.deleteObject(oldKey).catch(() => {});
    }

    await this.applyUpdate(id, { profile: { ...user.profile, imageUrl: null } });
  }

  async issuePasswordReset(email: string): Promise<string | null> {
    const user = await this.repo.findOne({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) return null;

    const token = randomBytes(USERS.PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
    await this.repo.update(user.id, {
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: new Date(Date.now() + USERS.PASSWORD_RESET_TTL_MINUTES * 60_000),
    });
    return token;
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const user = await this.repo.findOne({
      where: { passwordResetTokenHash: hashToken(token) },
      select: { id: true, isActive: true, passwordResetExpiresAt: true },
    });
    if (!user?.isActive || !isFuture(user.passwordResetExpiresAt)) {
      throw new AppException(ERROR_CODE.INVALID_RESET_TOKEN);
    }
    await this.setPassword(user.id, password);
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.repo.findOne({
      where: { id },
      select: { id: true, passwordHash: true },
    });
    if (!user || !(await compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException(ERROR_MESSAGE.CURRENT_PASSWORD_WRONG);
    }
    await this.setPassword(id, newPassword);
  }

  private async setPassword(id: string, password: string): Promise<void> {
    await this.applyUpdate(id, {
      passwordHash: await hash(password, USERS.BCRYPT_ROUNDS),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    });
    await this.revocations.revokeAllFor(id);
  }

  private assertNotSelf(id: string, message: string): void {
    if (id === currentUserId()) throw new ForbiddenException(message);
  }

  private async assertNotLastActiveAdmin(id: string): Promise<void> {
    const { role } = await this.findOne(id);
    if (role !== ROLE.ADMIN) return;

    const others = await this.repo.countBy({ id: Not(id), role: ROLE.ADMIN, isActive: true });
    if (others === 0) throw new ForbiddenException(ERROR_MESSAGE.LAST_ADMIN);
  }
}
