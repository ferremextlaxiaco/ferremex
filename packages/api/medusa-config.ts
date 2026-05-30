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
