import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260711235838 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "cambio" drop constraint if exists "cambio_folio_cambio_unique";`);
    this.addSql(`create table if not exists "cambio" ("id" text not null, "folio_cambio" text not null, "venta_origen_folio" text not null, "fecha" text not null, "cajero" text not null, "caja_id" text null, "caja_name" text null, "vendedor" text null, "customer_id" text null, "cliente_nombre" text null, "valor_devuelto" integer not null, "valor_nuevo" integer not null, "diferencia" integer not null, "diferencia_cobrada" integer not null default 0, "saldo_generado" integer not null default 0, "venta_diferencia_folio" text null, "estado" text check ("estado" in ('completado', 'cancelado')) not null default 'completado', "motivo_cancelacion" text null, "fecha_cancelacion" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cambio_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cambio_folio_cambio_unique" ON "cambio" ("folio_cambio") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cambio_deleted_at" ON "cambio" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "cambio_linea_devuelta" ("id" text not null, "sku" text not null, "descripcion" text not null, "cantidad" integer not null, "precio_unitario" integer not null, "subtotal" integer not null, "cambio_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cambio_linea_devuelta_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cambio_linea_devuelta_cambio_id" ON "cambio_linea_devuelta" ("cambio_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cambio_linea_devuelta_deleted_at" ON "cambio_linea_devuelta" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "cambio_linea_nueva" ("id" text not null, "sku" text not null, "descripcion" text not null, "cantidad" integer not null, "precio_unitario" integer not null, "subtotal" integer not null, "cambio_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cambio_linea_nueva_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cambio_linea_nueva_cambio_id" ON "cambio_linea_nueva" ("cambio_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cambio_linea_nueva_deleted_at" ON "cambio_linea_nueva" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "cambio_linea_devuelta" add constraint "cambio_linea_devuelta_cambio_id_foreign" foreign key ("cambio_id") references "cambio" ("id") on update cascade;`);

    this.addSql(`alter table if exists "cambio_linea_nueva" add constraint "cambio_linea_nueva_cambio_id_foreign" foreign key ("cambio_id") references "cambio" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "cambio_linea_devuelta" drop constraint if exists "cambio_linea_devuelta_cambio_id_foreign";`);

    this.addSql(`alter table if exists "cambio_linea_nueva" drop constraint if exists "cambio_linea_nueva_cambio_id_foreign";`);

    this.addSql(`drop table if exists "cambio" cascade;`);

    this.addSql(`drop table if exists "cambio_linea_devuelta" cascade;`);

    this.addSql(`drop table if exists "cambio_linea_nueva" cascade;`);
  }

}
