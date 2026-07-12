import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260711235839 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "saldo_cambio_movimiento" ("id" text not null, "customer_id" text not null, "tipo" text check ("tipo" in ('generado', 'consumido', 'ajuste')) not null, "monto" integer not null, "fecha" text not null, "origen_cambio_folio" text null, "venta_consumo_folio" text null, "descripcion" text not null, "cancelado" boolean not null default false, "motivo_cancelacion" text null, "fecha_cancelacion" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "saldo_cambio_movimiento_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_saldo_cambio_movimiento_deleted_at" ON "saldo_cambio_movimiento" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "saldo_cambio_movimiento" cascade;`);
  }

}
