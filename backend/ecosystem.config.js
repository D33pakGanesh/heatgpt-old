require('dotenv').config({ path: __dirname + '/.env' })

module.exports = {
  apps: [{
    name: 'heatgpt-public-api',
    script: 'dist/index.js',
    cwd: '/var/www/heatgpt-public/backend',
    env: {
      NODE_OPTIONS: '--openssl-legacy-provider',
      PORT:             process.env.PORT,
      PGHOST:           process.env.PGHOST,
      PGPORT:           process.env.PGPORT,
      PGDATABASE:       process.env.PGDATABASE,
      PGUSER:           process.env.PGUSER,
      PGPASSWORD:       process.env.PGPASSWORD,
      EE_KEY_FILE:      process.env.EE_KEY_FILE,
      GEMINI_API_KEY:   process.env.GEMINI_API_KEY,
      FRONTEND_ORIGIN:  process.env.FRONTEND_ORIGIN,
    }
  }]
}
