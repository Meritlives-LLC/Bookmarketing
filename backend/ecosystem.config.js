module.exports = {
  apps: [
    {
      name: 'bookmarketingos-api',
      script: 'dist/app.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'bookmarketingos-worker-audit',
      script: 'dist/workers/scraper.worker.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'bookmarketingos-worker-ai',
      script: 'dist/workers/ai.worker.js',
      instances: 2,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'bookmarketingos-worker-email',
      script: 'dist/workers/email.worker.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'bookmarketingos-worker-analytics',
      script: 'dist/workers/analytics.worker.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'bookmarketingos-cron',
      script: 'dist/cron/index.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
  ],
};
