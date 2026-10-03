import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserImageUrl1787719545983 implements MigrationInterface {
  name = "AddUserImageUrl1787719545983";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "imageUrl" character varying(512)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "imageUrl"`);
  }
}
