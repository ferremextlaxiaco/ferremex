import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260618034453 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "saldo_facturable" drop constraint if exists "saldo_facturable_sku_unique";`);
    this.addSql(`alter table if exists "depto_facturable" drop constraint if exists "depto_facturable_departamento_unique";`);
    this.addSql(`create table if not exists "depto_facturable" ("id" text not null, "departamento" text not null, "facturable" boolean not null default true, "actualizado_el" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "depto_facturable_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_depto_facturable_departamento_unique" ON "depto_facturable" ("departamento") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_depto_facturable_deleted_at" ON "depto_facturable" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "movimiento_facturable" ("id" text not null, "sku" text not null, "tipo" text not null, "cantidad" integer not null default 0, "folio_ref" text null, "cfdi_ref" text null, "motivo" text null, "fecha" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "movimiento_facturable_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_movimiento_facturable_deleted_at" ON "movimiento_facturable" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "saldo_facturable" ("id" text not null, "sku" text not null, "saldo" integer not null default 0, "clave_sat" text null, "descripcion" text null, "departamento" text null, "actualizado_el" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "saldo_facturable_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_saldo_facturable_sku_unique" ON "saldo_facturable" ("sku") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_saldo_facturable_deleted_at" ON "saldo_facturable" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "depto_facturable" cascade;`);

    this.addSql(`drop table if exists "movimiento_facturable" cascade;`);

    this.addSql(`drop table if exists "saldo_facturable" cascade;`);
  }

}
