import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeletedByColumn1787805743022 implements MigrationInterface {
  name = "AddDeletedByColumn1787805743022";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "deletedBy" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedBy"`);
  }
}
