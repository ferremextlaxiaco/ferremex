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
      // Biometría (huella dactilar). Plantillas FMD (base64) de empleados y
      // clientes + log auditable de verificaciones. El motor nativo dpfj corre
      // en un servicio local por caja (FerremexBiometriaService, 127.0.0.1:52700,
      // ver C:/ferremex/caja-biometria); aquí solo se persisten las plantillas y
      // el log. La huella nunca sale de la caja. Ver src/modules/ferremex-biometria.
      resolve: "./src/modules/ferremex-biometria",
    },
    {
      // Cambio de artículo (devolución con cambio, NO reembolso). Registro
      // auditable de venta_origen → líneas devueltas/nuevas + diferencia. Ver
      // src/modules/ferremex-cambios.
      resolve: "./src/modules/ferremex-cambios",
    },
    {
      // Saldo a favor por cambio de mercancía (independiente del Monedero de
      // lealtad). Se genera cuando el artículo nuevo vale menos que el
      // devuelto; se consume como método de pago en una compra futura. Ver
      // src/modules/ferremex-saldo-cambio.
      resolve: "./src/modules/ferremex-saldo-cambio",
    },
    {
      // Comisiones de venta por empleado. ComisionEje = qué ámbitos de la
      // taxonomía (marca/categoría/departamento) admiten comisión (toggle
      // global, se activa desde Catálogos). ComisionRegla = % que cada
      // empleado recibe de un ámbito ya habilitado (se asigna desde
      // Empleados y permisos). Ver src/modules/ferremex-comisiones.
      resolve: "./src/modules/ferremex-comisiones",
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
        // Producción: sirve el build estático del POS. El build se emite en
        // dist/pos/ (outDir en vite.config) y appDir apunta a dist (el padre): el
        // vendor-ui NO recorta el prefijo /pos, así que express.static(dist) + la
        // URL /pos/assets/... resuelve a dist/pos/assets/... (existe). Ver Etapa 2.
        appDir: path.join(__dirname, '../../apps/pos/dist'),
        path: '/pos',
        // @ts-ignore: viteDevServerPort is supported at runtime; su presencia en
        // el tipo difiere entre dev y build, así que usamos ts-ignore (no expect-error).
        viteDevServerPort: 7002,
      } as DashboardModuleOptions
    },
  ],
  plugins: [{
    resolve: "@mercurjs/core-plugin",
    options: {}
  }]
})
