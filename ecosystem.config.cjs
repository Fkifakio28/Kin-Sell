// PM2 Ecosystem Configuration for Kin-Sell API
// Usage: pm2 start ecosystem.config.cjs
// Scale: pm2 scale kinsell-api +2 (add 2 instances)

module.exports = {
  apps: [
    {
      name: "kinsell-api",
      script: "dist/index.js",
      cwd: "./apps/api",
      // Keep a single instance until Socket.IO adapter (Redis) is added.
      // In cluster mode without shared adapter, call signaling can fail across workers.
      instances: 1,
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
