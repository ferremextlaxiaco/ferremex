import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260530012601 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "cartera_cliente" drop constraint if exists "cartera_cliente_customer_id_unique";`);
    this.addSql(`create table if not exists "cartera_cliente" ("id" text not null, "customer_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cartera_cliente_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cartera_cliente_customer_id_unique" ON "cartera_cliente" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cartera_cliente_deleted_at" ON "cartera_cliente" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "cartera_historial_limite" ("id" text not null, "fecha" text not null, "usuario" text not null, "anterior" integer not null, "nuevo" integer not null, "nota" text not null, "cartera_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cartera_historial_limite_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cartera_historial_limite_cartera_id" ON "cartera_historial_limite" ("cartera_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cartera_historial_limite_deleted_at" ON "cartera_historial_limite" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "cartera_movimiento" ("id" text not null, "tipo" text check ("tipo" in ('compra', 'pago')) not null, "monto" integer not null, "fecha" text not null, "folio" text null, "plazo" integer null, "descripcion" text not null, "nota" text null, "cartera_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cartera_movimiento_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cartera_movimiento_cartera_id" ON "cartera_movimiento" ("cartera_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cartera_movimiento_deleted_at" ON "cartera_movimiento" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "cartera_nota" ("id" text not null, "fecha" text not null, "hora" text not null, "autor" text not null, "texto" text not null, "cartera_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cartera_nota_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cartera_nota_cartera_id" ON "cartera_nota" ("cartera_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cartera_nota_deleted_at" ON "cartera_nota" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "cartera_historial_limite" add constraint "cartera_historial_limite_cartera_id_foreign" foreign key ("cartera_id") references "cartera_cliente" ("id") on update cascade;`);

    this.addSql(`alter table if exists "cartera_movimiento" add constraint "cartera_movimiento_cartera_id_foreign" foreign key ("cartera_id") references "cartera_cliente" ("id") on update cascade;`);

    this.addSql(`alter table if exists "cartera_nota" add constraint "cartera_nota_cartera_id_foreign" foreign key ("cartera_id") references "cartera_cliente" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "cartera_historial_limite" drop constraint if exists "cartera_historial_limite_cartera_id_foreign";`);

    this.addSql(`alter table if exists "cartera_movimiento" drop constraint if exists "cartera_movimiento_cartera_id_foreign";`);

    this.addSql(`alter table if exists "cartera_nota" drop constraint if exists "cartera_nota_cartera_id_foreign";`);

    this.addSql(`drop table if exists "cartera_cliente" cascade;`);

    this.addSql(`drop table if exists "cartera_historial_limite" cascade;`);

    this.addSql(`drop table if exists "cartera_movimiento" cascade;`);

    this.addSql(`drop table if exists "cartera_nota" cascade;`);
  }

}
