import { Logger } from "@nestjs/common";
import { hash } from "bcryptjs";
import { ROLE } from "@/common/constants/app.constants";
import { PASSWORD_MESSAGE, PASSWORD_PATTERN, VALIDATION } from "@/common/constants/validation";
import dataSource from "@/database/data-source";
import { User } from "@/modules/users/entities/user.entity";
import { USERS } from "@/modules/users/users.constants";

const ADMIN_NAME = "Administrator";
const logger = new Logger("Seed");

/** No default credential, in any environment: a seeded admin whose password shipped in
 *  the repository is an account every reader of it owns. */
function credentials(): { email: string; password: string } {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required — see .env.example");
  }
  if (password.length < VALIDATION.PASSWORD_MIN || !PASSWORD_PATTERN.test(password)) {
    throw new Error(PASSWORD_MESSAGE);
  }
  return { email, password };
}

/** Idempotent: safe to run on every deploy. */
async function seed(): Promise<void> {
  const { email, password } = credentials();
  await dataSource.initialize();
  const users = dataSource.getRepository(User);

  if (await users.existsBy({ email })) {
    logger.warn(`Skipped: ${email} already exists`);
  } else {
    await users.save(
      users.create({
        email,
        role: ROLE.ADMIN,
        passwordHash: await hash(password, USERS.BCRYPT_ROUNDS),
        profile: {
          name: ADMIN_NAME,
        },
      }),
    );
    logger.log(`Seeded admin ${email}`);
  }

  await dataSource.destroy();
}

seed().catch((error: unknown) => {
  logger.error(error);
  process.exit(1);
});
