import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260601033324 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "compra" ("id" text not null, "folio" text not null, "proveedor" text not null, "proveedor_id" text null, "fecha" text not null, "tipo" text not null default 'Factura', "estado" text not null default 'Recibida', "subtotal" integer not null default 0, "iva" integer not null default 0, "total" integer not null default 0, "cancelada_el" text null, "motivo_cancelacion" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compra_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_compra_deleted_at" ON "compra" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "compra_articulo" ("id" text not null, "codigo" text not null default '', "nombre" text not null default '', "cantidad" integer not null default 0, "precio_unit" integer not null default 0, "categoria" text null, "departamento" text null, "marca" text null, "compra_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "compra_articulo_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_compra_articulo_compra_id" ON "compra_articulo" ("compra_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_compra_articulo_deleted_at" ON "compra_articulo" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "compra_articulo" add constraint "compra_articulo_compra_id_foreign" foreign key ("compra_id") references "compra" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "compra_articulo" drop constraint if exists "compra_articulo_compra_id_foreign";`);

    this.addSql(`drop table if exists "compra" cascade;`);

    this.addSql(`drop table if exists "compra_articulo" cascade;`);
  }

}
