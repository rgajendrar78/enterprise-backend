import { Column, Entity, JoinColumn, OneToOne } from "typeorm";
import { CdnUrlTransformer } from "@/common/transformers/cdn-url.transformer";
import { AbstractSoftDeleteEntity } from "@/database/entities/abstract-soft-delete.entity";
import { User } from "@/modules/users/entities/user.entity";

@Entity("profiles")
export class Profile extends AbstractSoftDeleteEntity {
  @Column({ type: "varchar", length: 120 })
  name: string;

  @Column({ type: "varchar", length: 512, nullable: true, transformer: CdnUrlTransformer })
  imageUrl: string | null;

  @OneToOne(() => User, (user) => user.profile, { onDelete: "CASCADE" })
  @JoinColumn()
  user: User;
}
