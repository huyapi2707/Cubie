const path = require('path');

module.exports = {
  apps: [
    {
      name: 'VoiceWorker',
      script: './dist/index.js',
      cwd: path.resolve(__dirname, '../'),
      instances: 'max',
      exec_mode: 'cluster',
      error_file: '~/.pm2/logs/VoiceWorker-err.log',
      out_file: '~/.pm2/logs/VoiceWorker-out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
