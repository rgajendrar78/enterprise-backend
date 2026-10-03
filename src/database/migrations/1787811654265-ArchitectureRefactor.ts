import type { MigrationInterface, QueryRunner } from "typeorm";

export class ArchitectureRefactor1787811654265 implements MigrationInterface {
  name = "ArchitectureRefactor1787811654265";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add VersionColumn with default 1, then drop default so subsequent inserts must rely on TypeORM handling
    await queryRunner.query(`ALTER TABLE "profiles" ADD "version" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "profiles" ALTER COLUMN "version" DROP DEFAULT`);

    await queryRunner.query(`ALTER TABLE "users" ADD "version" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "version" DROP DEFAULT`);

    // Replace the unique index on email to allow soft deletes
    await queryRunner.query(`DROP INDEX "public"."UQ_users_email"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email") WHERE "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_users_email"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "version"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "version"`);
  }
}
