import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260606220240 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "promocion" drop constraint if exists "promocion_tipo_check";`);

    this.addSql(`alter table if exists "promocion" add column if not exists "descuentos_articulo" jsonb null;`);
    this.addSql(`alter table if exists "promocion" add constraint "promocion_tipo_check" check("tipo" in ('porcentaje', 'nivel_precio', 'nxm', 'volumen', 'personalizado'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "promocion" drop constraint if exists "promocion_tipo_check";`);

    this.addSql(`alter table if exists "promocion" drop column if exists "descuentos_articulo";`);

    this.addSql(`alter table if exists "promocion" add constraint "promocion_tipo_check" check("tipo" in ('porcentaje', 'nivel_precio', 'nxm', 'volumen'));`);
  }

}
