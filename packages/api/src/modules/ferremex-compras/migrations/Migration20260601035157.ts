import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260601035157 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "compra" drop constraint if exists "compra_folio_unique";`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_compra_folio_unique" ON "compra" ("folio") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_compra_folio_unique";`);
  }

}
