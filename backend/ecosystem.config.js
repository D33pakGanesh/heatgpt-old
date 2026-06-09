module.exports = {
  apps: [{
    name: 'heatgpt-api',
    script: 'dist/index.js',
    cwd: '/var/www/heatgpt/backend',
    env: {
      NODE_OPTIONS: '--openssl-legacy-provider'
    }
  }]
}
