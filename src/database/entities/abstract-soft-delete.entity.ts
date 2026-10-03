import { Column, DeleteDateColumn } from "typeorm";
import { AbstractAuditEntity } from "@/database/entities/abstract-audit.entity";

/** Soft-delete with who-deleted tracking — the full lifecycle entity.
 *  `AuditSubscriber` stamps `deletedBy` on soft-remove. */
export abstract class AbstractSoftDeleteEntity extends AbstractAuditEntity {
  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deletedAt: Date | null;

  @Column({ type: "uuid", nullable: true })
  deletedBy: string | null;
}
