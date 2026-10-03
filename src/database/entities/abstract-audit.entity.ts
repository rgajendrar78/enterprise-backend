import { Column } from "typeorm";
import { AbstractTimestampEntity } from "@/database/entities/abstract-timestamp.entity";

/** Full audit trail — `AuditSubscriber` stamps `createdBy`/`updatedBy`, never set
 *  them by hand. Plain uuids, not relations, so no table needs users. */
export abstract class AbstractAuditEntity extends AbstractTimestampEntity {
  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;
}
