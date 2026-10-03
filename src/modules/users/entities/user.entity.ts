import { Column, Entity, Index, OneToOne } from "typeorm";
import { ROLE, type Role } from "@/common/constants/app.constants";
import { AbstractSoftDeleteEntity } from "@/database/entities/abstract-soft-delete.entity";
import { Profile } from "@/modules/users/entities/profile.entity";

@Entity("users")
export class User extends AbstractSoftDeleteEntity {
  @Index("UQ_users_email", ["email"], { unique: true, where: '"deletedAt" IS NULL' })
  @Column({ type: "varchar", length: 180 })
  email: string;

  /** `select: false` keeps the hash out of every query that does not ask for it. */
  @Column({ type: "varchar", length: 120, select: false })
  passwordHash: string;

  @Column({ type: "enum", enum: ROLE, default: ROLE.USER })
  role: Role;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @OneToOne(() => Profile, (profile) => profile.user, { cascade: true, eager: true })
  profile: Profile;

  /** SHA-256 of the token, never the token — a leaked row is not a reset link. Cleared
   *  on use, which makes it single-use. No bcrypt: 256 random bits are not guessable. */
  @Index("IDX_users_password_reset_token_hash", { where: '"passwordResetTokenHash" IS NOT NULL' })
  @Column({ type: "varchar", length: 64, nullable: true, select: false })
  passwordResetTokenHash: string | null;

  @Column({ type: "timestamptz", nullable: true, select: false })
  passwordResetExpiresAt: Date | null;
}
