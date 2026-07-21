import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260716221545 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "comision_eje" ("id" text not null, "ambito" text check ("ambito" in ('marca', 'categoria', 'departamento')) not null, "ref" text not null, "habilitado" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "comision_eje_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_comision_eje_deleted_at" ON "comision_eje" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "comision_regla" ("id" text not null, "empleado_id" text not null, "ambito" text check ("ambito" in ('marca', 'categoria', 'departamento')) not null, "ref" text not null, "tasa" real not null default 0, "activa" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "comision_regla_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_comision_regla_deleted_at" ON "comision_regla" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "comision_eje" cascade;`);

    this.addSql(`drop table if exists "comision_regla" cascade;`);
  }

}
