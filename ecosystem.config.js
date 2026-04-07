module.exports = {
  apps: [
    {
      name: "ferremex-api",
      script: "C:/ferremex/start-api.bat",
      interpreter: "cmd",
      interpreter_args: "/c",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
