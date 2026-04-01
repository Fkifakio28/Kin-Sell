// PM2 Ecosystem Configuration for Kin-Sell API
// Usage: pm2 start ecosystem.config.cjs
// Scale: pm2 scale kinsell-api +2 (add 2 instances)

module.exports = {
  apps: [
    {
      name: "kinsell-api",
      script: "node_modules/.bin/tsx",
      args: "src/index.ts",
      cwd: "./apps/api",
      instances: 2, // Start with 2 — scale with: pm2 scale kinsell-api +1
      exec_mode: "cluster",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      // Auto-restart on failure
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 1000,
      // Log rotation
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      merge_logs: true,
    },
  ],
};
