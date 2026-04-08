module.exports = {
  apps: [
    {
      name: "ferremex-admin",
      script: "C:/ferremex/launch-admin.js",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
    },
    {
      name: "ferremex-api",
      script: "C:/ferremex/launch-api.js",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
