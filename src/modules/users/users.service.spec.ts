import { ForbiddenException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { ROLE } from "@/common/constants/app.constants";
import { runInRequestContext, setCurrentUserId } from "@/common/context/request-context";
import type { SessionRevocationService } from "@/common/services/session-revocation.service";
import type { CacheService } from "@/infra/redis/cache.service";
import type { S3Service } from "@/infra/s3/s3.service";
import type { User } from "@/modules/users/entities/user.entity";
import { UsersService } from "@/modules/users/users.service";

const ACTING_ADMIN = "admin-1";

describe("UsersService", () => {
  const stored = {
    id: "u1",
    email: "a@b.c",
    role: ROLE.USER,
    profile: { name: "A" },
  } as unknown as User;
  let repository: Record<string, jest.Mock>;
  let cache: Partial<CacheService>;
  let revocations: Partial<SessionRevocationService>;
  let s3: Partial<S3Service>;
  let service: UsersService;

  beforeEach(() => {
    repository = {
      create: jest.fn((input: Partial<User>) => input as User),
      save: jest.fn().mockResolvedValue({ id: "u1" }),
      findOne: jest.fn().mockResolvedValue(stored),
      preload: jest.fn((input: Partial<User>) => Promise.resolve(input as User)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      countBy: jest.fn().mockResolvedValue(1),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    cache = { wrap: jest.fn(), del: jest.fn() };
    revocations = { revokeAllFor: jest.fn(), isRevoked: jest.fn() };
    s3 = {
      generatePresignedUpload: jest.fn(),
      deleteObject: jest.fn(),
      extractKeyFromUrl: jest.fn(),
    };

    service = new UsersService(
      repository as unknown as Repository<User>,
      cache as unknown as CacheService,
      revocations as unknown as SessionRevocationService,
      s3 as unknown as S3Service,
    );
  });

  const asAdmin = <T>(run: () => Promise<T>): Promise<T> =>
    runInRequestContext("test-request-id", () => {
      setCurrentUserId(ACTING_ADMIN);
      return run();
    });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue(stored);
    repository.countBy.mockResolvedValue(1);
  });

  it("hashes the password and never returns the hash", async () => {
    const created = await service.create({ email: "a@b.c", name: "A", password: "Password1" });

    const saved = repository.create.mock.calls[0]?.[0];
    expect(saved?.passwordHash).toBeDefined();
    expect(saved?.passwordHash).not.toBe("Password1");
    expect(created).toBe(stored);
    expect(created).not.toHaveProperty("passwordHash");
  });

  it("refuses to let you deactivate, delete or demote yourself", async () => {
    await expect(asAdmin(() => service.update(ACTING_ADMIN, { isActive: false }))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(asAdmin(() => service.remove(ACTING_ADMIN))).rejects.toThrow(ForbiddenException);
    await expect(asAdmin(() => service.changeRole(ACTING_ADMIN, ROLE.USER))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("allows deactivating somebody else", async () => {
    await expect(asAdmin(() => service.update("someone-else", { isActive: false }))).resolves.toBe(
      stored,
    );
  });

  // Otherwise a manager (who has users:update) can leave the app unadministrable.
  it("refuses to deactivate the last active admin", async () => {
    repository.findOne.mockResolvedValue({ ...stored, role: ROLE.ADMIN });
    repository.countBy.mockResolvedValue(0);

    await expect(asAdmin(() => service.update("last-admin", { isActive: false }))).rejects.toThrow(
      /last active admin/,
    );
  });

  it("accepts it once another active admin exists", async () => {
    repository.findOne.mockResolvedValue({ ...stored, role: ROLE.ADMIN });
    repository.countBy.mockResolvedValue(1);

    await expect(
      asAdmin(() => service.update("an-admin", { isActive: false })),
    ).resolves.toMatchObject({ id: "u1" });
  });

  describe("password reset", () => {
    it("rejects an unknown token", async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.resetPassword("nope", "Password1")).rejects.toThrow(/invalid or has/i);
    });

    it("rejects an expired token", async () => {
      repository.findOne.mockResolvedValue({
        id: "u1",
        isActive: true,
        passwordResetExpiresAt: new Date(Date.now() - 1),
      });
      await expect(service.resetPassword("stale", "Password1")).rejects.toThrow(/invalid or has/i);
    });

    it("rejects a token belonging to a deactivated account", async () => {
      repository.findOne.mockResolvedValue({
        id: "u1",
        isActive: false,
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.resetPassword("valid", "Password1")).rejects.toThrow(/invalid or has/i);
    });

    it("stores the new hash and clears the token, so a link works once", async () => {
      repository.findOne.mockResolvedValue({
        id: "u1",
        isActive: true,
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      });

      await service.resetPassword("valid", "Password1");

      const [patch] = repository.preload.mock.calls[0] ?? [];
      expect(patch).toMatchObject({ passwordResetTokenHash: null, passwordResetExpiresAt: null });
      expect(patch?.passwordHash).not.toBe("Password1");
    });

    it("ends every open session when the password changes", async () => {
      repository.findOne.mockResolvedValue({
        id: "u1",
        isActive: true,
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      });

      await service.resetPassword("valid", "Password1");

      expect(revocations.revokeAllFor).toHaveBeenCalledWith("u1");
    });

    it("never returns a token for an address without an active account", async () => {
      repository.findOne.mockResolvedValue({ id: "u1", isActive: false });
      await expect(service.issuePasswordReset("a@b.c")).resolves.toBeNull();

      repository.findOne.mockResolvedValue(null);
      await expect(service.issuePasswordReset("nobody@b.c")).resolves.toBeNull();
    });

    it("stores only a hash of the token it hands out", async () => {
      repository.findOne.mockResolvedValue({ id: "u1", isActive: true });

      const token = await service.issuePasswordReset("a@b.c");

      const [, patch] = repository.update.mock.calls[0] ?? [];
      expect(token).toBeTruthy();
      expect(patch?.passwordResetTokenHash).not.toBe(token);
      expect(patch?.passwordResetTokenHash).toHaveLength(64);
    });
  });

  describe("search", () => {
    const whereFor = async (search: string) => {
      await service.findAll({ page: 1, limit: 20, search });
      const [options] = repository.findAndCount.mock.calls[0] ?? [];
      return (options as { where: Record<string, { value: string }>[] }).where;
    };

    // `%` and `_` are LIKE wildcards. Unescaped, searching "50%" matches every row
    // starting "50", and "a_b" matches "axb" — the results quietly stop meaning anything.
    it("escapes wildcards so a search is a literal one", async () => {
      const where = await whereFor("50%_x");

      for (const branch of where) {
        expect(Object.values(branch)[0]?.value).toBe("%50\\%\\_x%");
      }
    });

    it("leaves an ordinary term alone", async () => {
      const where = await whereFor("ada");

      expect(Object.values(where[0] ?? {})[0]?.value).toBe("%ada%");
    });
  });
});
