import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260608073632 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "monedero_config" ("id" text not null, "valor_punto" integer not null default 1, "tasa_base" integer not null default 1, "max_canje_pct" integer not null default 50, "min_puntos_canje" integer not null default 100, "vencimiento_meses" integer not null default 0, "confirmar_huella" boolean not null default false, "confirmar_codigo" boolean not null default false, "redondeo" text check ("redondeo" in ('abajo', 'normal', 'ninguno')) not null default 'abajo', "periodo_nivel_meses" integer not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "monedero_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_monedero_config_deleted_at" ON "monedero_config" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "monedero_movimiento" ("id" text not null, "customer_id" text not null, "tipo" text check ("tipo" in ('ganado', 'canjeado', 'ajuste', 'vencido', 'reset')) not null, "puntos" integer not null, "folio" text null, "descripcion" text not null, "fecha" text not null, "cancelado" boolean not null default false, "motivo_cancelacion" text null, "fecha_cancelacion" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "monedero_movimiento_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_monedero_movimiento_deleted_at" ON "monedero_movimiento" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "monedero_nivel" ("id" text not null, "nombre" text not null, "orden" integer not null default 0, "umbral_periodo" integer not null default 0, "multiplicador" integer not null default 1, "valor_punto_bonus" integer null, "nivel_precio" integer null, "color" text null, "activo" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "monedero_nivel_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_monedero_nivel_deleted_at" ON "monedero_nivel" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "monedero_regla" ("id" text not null, "ambito" text check ("ambito" in ('marca', 'departamento', 'categoria')) not null, "ref" text not null, "tasa" integer not null default 0, "activa" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "monedero_regla_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_monedero_regla_deleted_at" ON "monedero_regla" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "monedero_config" cascade;`);

    this.addSql(`drop table if exists "monedero_movimiento" cascade;`);

    this.addSql(`drop table if exists "monedero_nivel" cascade;`);

    this.addSql(`drop table if exists "monedero_regla" cascade;`);
  }

}
