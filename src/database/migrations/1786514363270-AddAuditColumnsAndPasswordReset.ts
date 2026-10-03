import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditColumnsAndPasswordReset1786514363270 implements MigrationInterface {
  name = "AddAuditColumnsAndPasswordReset1786514363270";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "createdBy" uuid`);
    await queryRunner.query(`ALTER TABLE "users" ADD "updatedBy" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "passwordResetTokenHash" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "passwordResetExpiresAt" TIMESTAMP WITH TIME ZONE`,
    );
    // Reset lands as a lookup by hash; partial, because almost every row is null.
    await queryRunner.query(
      `CREATE INDEX "IDX_users_password_reset_token_hash" ON "users" ("passwordResetTokenHash") WHERE "passwordResetTokenHash" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_password_reset_token_hash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "passwordResetExpiresAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "passwordResetTokenHash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updatedBy"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "createdBy"`);
  }
}
