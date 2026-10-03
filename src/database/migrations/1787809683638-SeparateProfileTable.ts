import type { MigrationInterface, QueryRunner } from "typeorm";

export class SeparateProfileTable1787809683638 implements MigrationInterface {
  name = "SeparateProfileTable1787809683638";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "profiles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "createdBy" uuid, "updatedBy" uuid, "deletedAt" TIMESTAMP WITH TIME ZONE, "deletedBy" uuid, "name" character varying(120) NOT NULL, "imageUrl" character varying(512), "userId" uuid, CONSTRAINT "REL_315ecd98bd1a42dcf2ec4e2e98" UNIQUE ("userId"), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD CONSTRAINT "FK_315ecd98bd1a42dcf2ec4e2e985" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Data Migration: copy name and imageUrl from users to profiles
    await queryRunner.query(
      `INSERT INTO "profiles" ("name", "imageUrl", "userId", "createdAt", "updatedAt", "deletedAt") SELECT "name", "imageUrl", "id", "createdAt", "updatedAt", "deletedAt" FROM "users"`,
    );

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "imageUrl"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "imageUrl" character varying(512)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "name" character varying(120)`);

    // Data Migration: copy name and imageUrl back from profiles to users
    await queryRunner.query(
      `UPDATE "users" u SET "name" = p."name", "imageUrl" = p."imageUrl" FROM "profiles" p WHERE u."id" = p."userId"`,
    );

    // Restore NOT NULL constraint on name after populating data
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL`);

    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT "FK_315ecd98bd1a42dcf2ec4e2e985"`,
    );
    await queryRunner.query(`DROP TABLE "profiles"`);
  }
}
