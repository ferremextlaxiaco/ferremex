import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import { DashboardModuleOptions } from '@mercurjs/types'
import path from 'path'
loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  admin: {
    disable: true
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      // @ts-expect-error: vendorCors is not defined in medusa config module
      vendorCors: process.env.VENDOR_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  featureFlags: {
    rbac: true,
    seller_registration: true
  },
  modules: [
    {
      resolve: "@medusajs/medusa/rbac",
    },
    {
      // Cartera de crédito del POS (movimientos, notas, historial de límite).
      // Enlazado por customer_id al Customer nativo. Ver src/modules/ferremex-cartera.
      resolve: "./src/modules/ferremex-cartera",
    },
    {
      // Catálogo de cajas físicas del POS (dato maestro compartido entre
      // terminales). Antes en localStorage. Ver src/modules/ferremex-cajas.
      resolve: "./src/modules/ferremex-cajas",
    },
    {
      // Proveedores del POS + sus facturas por pagar (cuentas por pagar).
      // Antes en localStorage. Ver src/modules/ferremex-proveedores.
      resolve: "./src/modules/ferremex-proveedores",
    },
    {
      // Historial de compras (recepciones de factura) + sus artículos.
      // Enlazado por proveedor_id al catálogo. Antes en localStorage
      // (pos_historial_compras). Ver src/modules/ferremex-compras.
      resolve: "./src/modules/ferremex-compras",
    },
    {
      // Promociones del POS (reglas de descuento por artículo: %, nivel de
      // precio, NxM, volumen + segmentación y promos cruzadas A→B). Dato maestro
      // compartido entre terminales. Se aplican en el carrito vía el motor del
      // frontend (apps/pos/src/lib/promociones.ts). Ver src/modules/ferremex-promociones.
      resolve: "./src/modules/ferremex-promociones",
    },
    {
      // Monedero Electrónico (programa de lealtad por puntos). Config global,
      // reglas de generación por marca/depto/categoría, niveles/tiers y los
      // movimientos de puntos por cliente (estado de cuenta auditable).
      // Devengo y canje son transaccionales en POST /caja/ventas. El cálculo
      // de puntos/nivel vive en apps/pos/src/lib/monedero.ts (compartido
      // backend/UI). Ver src/modules/ferremex-monedero.
      resolve: "./src/modules/ferremex-monedero",
    },
    {
      // Saldo facturable (doble inventario fiscal). Cada artículo lleva un
      // contador de piezas con respaldo de factura de compra + clave SAT,
      // independiente del stock físico. Sube al recibir compras "Con Factura",
      // baja solo al FACTURAR (no al vender). La factura global del día excluye
      // artículos sin respaldo. Ver src/modules/ferremex-facturable.
      resolve: "./src/modules/ferremex-facturable",
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              // upload_dir: default = path.join(cwd, "static") — correcto
              // backend_url debe incluir /static porque el proveedor hace path.join(pathname, fileKey)
              backend_url: `${process.env.BACKEND_URL || "http://localhost:9000"}/static`,
            },
          },
        ],
      },
    },
    {
      resolve: '@mercurjs/core-plugin/modules/admin-ui',
      options: {
        appDir: path.join(__dirname, '../../apps/admin/dist'),
        path: '/dashboard',
      } as DashboardModuleOptions
    },
    {
      resolve: '@mercurjs/core-plugin/modules/vendor-ui',
      options: {
        appDir: path.join(__dirname, '../../apps/vendor'),
        path: '/seller',
      } as DashboardModuleOptions
    },
    {
      resolve: '@mercurjs/core-plugin/modules/vendor-ui',
      options: {
        appDir: path.join(__dirname, '../../apps/pos'),
        path: '/pos',
        // @ts-expect-error: viteDevServerPort is supported but not typed
        viteDevServerPort: 7002,
      } as DashboardModuleOptions
    },
  ],
  plugins: [{
    resolve: "@mercurjs/core-plugin",
    options: {}
  }]
})
