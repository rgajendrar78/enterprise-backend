import { PrimaryGeneratedColumn } from "typeorm";

/** Just the primary key — lookup tables, enums, config rows. */
export abstract class AbstractIdEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;
}
