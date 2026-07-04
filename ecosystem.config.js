// PRODUCCIÓN (Etapa 2): el POS se sirve ESTÁTICO desde apps/pos/dist (lo sirve el
// API en /pos vía vendor-ui de Mercur). Por eso ya NO se arranca el dev server
// `ferremex-pos` aquí. Para aplicar una versión nueva del POS: `node actualizar-pos.js`.
//
// Para volver el POS a modo DESARROLLO (hot-reload): descomenta el bloque
// ferremex-pos de abajo, arráncalo (`pm2 start ecosystem.config.js`) y el vendor-ui
// detectará el dev server en 7002 y lo proxeará en vez de servir el dist.
module.exports = {
  apps: [
    {
      name: "ferremex-admin",
      script: "C:/ferremex/launch-admin.js",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
    },
    // --- POS en modo DESARROLLO (deshabilitado en producción; ver nota arriba) ---
    // {
    //   name: "ferremex-pos",
    //   script: "C:/ferremex/launch-pos.js",
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: "512M",
    // },
    {
      name: "ferremex-api",
      script: "C:/ferremex/launch-api.js",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
