import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260605235559 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "promocion" ("id" text not null, "nombre" text not null, "activa" boolean not null default true, "inicio" text null, "fin" text null, "prioridad" integer not null default 0, "tipo" text check ("tipo" in ('porcentaje', 'nivel_precio', 'nxm', 'volumen')) not null, "porcentaje" integer null, "nivel_precio" integer null, "nxm_lleva" integer null, "nxm_paga" integer null, "volumen_min" integer null, "volumen_desc" integer null, "volumen_alcance" text check ("volumen_alcance" in ('todas', 'excedente')) null, "modo_articulos" text check ("modo_articulos" in ('mismos', 'cruzada')) not null default 'mismos', "skus_requeridos" jsonb not null, "skus_beneficiados" jsonb not null, "segmento" text check ("segmento" in ('todos', 'cliente', 'grupo')) not null default 'todos', "cliente_id" text null, "grupo" text null, "cantidad_minima" integer null, "max_unidades" integer null, "etiqueta" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "promocion_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_promocion_deleted_at" ON "promocion" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "promocion" cascade;`);
  }

}
