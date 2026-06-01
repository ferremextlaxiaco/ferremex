import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260601072556 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "cartera_movimiento" add column if not exists "cancelado" boolean not null default false, add column if not exists "motivo_cancelacion" text null, add column if not exists "fecha_cancelacion" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "cartera_movimiento" drop column if exists "cancelado", drop column if exists "motivo_cancelacion", drop column if exists "fecha_cancelacion";`);
  }

}
