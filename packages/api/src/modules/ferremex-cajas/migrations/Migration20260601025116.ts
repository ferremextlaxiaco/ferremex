import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260601025116 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "caja" ("id" text not null, "nombre" text not null, "descripcion" text null, "activa" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "caja_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_caja_deleted_at" ON "caja" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "caja" cascade;`);
  }

}
