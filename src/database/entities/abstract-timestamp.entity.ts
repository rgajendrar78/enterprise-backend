import { CreateDateColumn, UpdateDateColumn, VersionColumn } from "typeorm";
import { AbstractIdEntity } from "@/database/entities/abstract-id.entity";

/** Timestamps only — entities that track when but not who. */
export abstract class AbstractTimestampEntity extends AbstractIdEntity {
  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
