// PM2 process definition for the FinXAI web app on the Contabo VPS.
// Start:   pm2 start ecosystem.config.js
// Reload:  pm2 reload finxai-web
module.exports = {
  apps: [
    {
      name: 'finxai-web',
      cwd: '/var/www/finxai/apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3011',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: '3011',
      },
    },
  ],
};
