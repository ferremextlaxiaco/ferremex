import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260706155739 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "biometria_huella" ("id" text not null, "sujeto_tipo" text check ("sujeto_tipo" in ('empleado', 'cliente')) not null, "sujeto_ref" text not null, "dedo" text not null default 'indice_der', "plantilla" text not null, "calidad" integer not null default 0, "motor" text not null default 'dpfj', "formato" text not null default 'ANSI_378_2004', "version_plantilla" text not null default 'dpfj-3.5', "activa" boolean not null default true, "creado_en" text not null, "actualizado_en" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "biometria_huella_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_biometria_huella_deleted_at" ON "biometria_huella" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "biometria_verificacion" ("id" text not null, "accion" text check ("accion" in ('canje_puntos', 'cancelar_venta', 'descuento', 'abrir_cajon', 'gerencial', 'otro')) not null, "contexto_ref" text null, "resultado" text check ("resultado" in ('match', 'no_match', 'sin_permiso', 'degradado_pin', 'servicio_caido', 'cancelado', 'error')) not null, "sujeto_tipo" text check ("sujeto_tipo" in ('empleado', 'cliente')) null, "sujeto_ref" text null, "score" integer null, "umbral" integer null, "caja_id" text null, "cajero_id" text null, "detalle" text null, "fecha" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "biometria_verificacion_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_biometria_verificacion_deleted_at" ON "biometria_verificacion" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "biometria_huella" cascade;`);

    this.addSql(`drop table if exists "biometria_verificacion" cascade;`);
  }

}
