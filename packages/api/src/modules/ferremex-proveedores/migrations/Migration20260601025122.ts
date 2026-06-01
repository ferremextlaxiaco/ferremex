import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260601025122 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "proveedor" drop constraint if exists "proveedor_num_proveedor_unique";`);
    this.addSql(`create table if not exists "proveedor" ("id" text not null, "num_proveedor" text not null, "nombre" text not null, "contacto" text null, "telefono" text null, "email" text null, "dias_credito" integer not null default 0, "limite_credito" integer not null default 0, "rfc" text null, "notas" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "proveedor_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_proveedor_num_proveedor_unique" ON "proveedor" ("num_proveedor") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_proveedor_deleted_at" ON "proveedor" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "proveedor_factura" ("id" text not null, "numero_factura" text not null, "fecha_emision" text not null, "dias_credito" integer not null, "monto" integer not null, "descripcion" text not null, "pagada" boolean not null default false, "proveedor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "proveedor_factura_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_proveedor_factura_proveedor_id" ON "proveedor_factura" ("proveedor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_proveedor_factura_deleted_at" ON "proveedor_factura" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "proveedor_factura" add constraint "proveedor_factura_proveedor_id_foreign" foreign key ("proveedor_id") references "proveedor" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "proveedor_factura" drop constraint if exists "proveedor_factura_proveedor_id_foreign";`);

    this.addSql(`drop table if exists "proveedor" cascade;`);

    this.addSql(`drop table if exists "proveedor_factura" cascade;`);
  }

}
