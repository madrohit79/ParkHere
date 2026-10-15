const { Pool, Client } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let embeddedPostgresInstance = null;

async function ensurePostgresRunning() {
  const testClient = new Client({ connectionString: config.databaseUrl });
  testClient.on('error', () => {});
  try {
    await testClient.connect();
    await testClient.end();
    return; // Already running
  } catch (err) {
    console.log('[db] External PostgreSQL not responding. Starting local PostgreSQL server...');
    try {
      const EmbeddedPostgres = require('embedded-postgres').default;
      const dbDir = path.resolve(__dirname, '../../data/db');
      embeddedPostgresInstance = new EmbeddedPostgres({
        databaseDir: dbDir,
        port: 5432,
        user: 'postgres',
        password: 'password',
        authMethod: 'trust',
        persistent: true
      });
      if (!fs.existsSync(dbDir)) {
        await embeddedPostgresInstance.initialise();
      }
      await embeddedPostgresInstance.start();
      console.log('[db] Local PostgreSQL instance running on port 5432.');
    } catch (e) {
      console.error('[db] Error launching embedded PostgreSQL:', e.message);
      throw err;
    }
  }
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[db-pool] Unexpected error on idle client:', err.message);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  ensurePostgresRunning,
  stopEmbedded: async () => {
    if (embeddedPostgresInstance) {
      await embeddedPostgresInstance.stop();
    }
  }
};
