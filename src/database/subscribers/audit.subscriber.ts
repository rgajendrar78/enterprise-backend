import {
  EventSubscriber,
  type EntitySubscriberInterface,
  type InsertEvent,
  type SoftRemoveEvent,
  type UpdateEvent,
} from "typeorm";
import { currentUserId } from "@/common/context/request-context";
import { AbstractAuditEntity } from "@/database/entities/abstract-audit.entity";

/** Stamps `createdBy`/`updatedBy` on every write and `deletedBy` on soft-remove,
 *  so no service remembers to. On the data source, so CLI and seed writes are
 *  covered too — they just have no actor. */
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface<AbstractAuditEntity> {
  listenTo(): typeof AbstractAuditEntity {
    return AbstractAuditEntity;
  }

  beforeInsert({ entity }: InsertEvent<AbstractAuditEntity>): void {
    const userId = currentUserId();
    if (!userId) return;
    entity.createdBy ??= userId;
    entity.updatedBy ??= userId;
  }

  beforeUpdate({ entity }: UpdateEvent<AbstractAuditEntity>): void {
    const userId = currentUserId();
    // `entity` is undefined for criteria-based updates (`repo.update(id, …)`),
    // which is why services save entities rather than patch by criteria.
    if (userId && entity) entity.updatedBy = userId;
  }

  beforeSoftRemove({ entity }: SoftRemoveEvent<AbstractAuditEntity>): void {
    const userId = currentUserId();
    if (userId && entity && "deletedBy" in entity) {
      (entity as AbstractAuditEntity & { deletedBy: string | null }).deletedBy = userId;
    }
  }
}
