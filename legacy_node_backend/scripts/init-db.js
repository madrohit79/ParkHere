const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/parkhere';

function getAdminConnectionString(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    parsed.pathname = '/postgres';
    return parsed.toString();
  } catch (e) {
    return 'postgresql://postgres:postgres@localhost:5432/postgres';
  }
}

function getDatabaseName(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    return parsed.pathname.replace(/^\//, '') || 'parkhere';
  } catch (e) {
    return 'parkhere';
  }
}

async function ensurePostgresRunning() {
  const adminUrl = getAdminConnectionString(connectionString);
  let testClient = new Client({ connectionString: adminUrl });
  testClient.on('error', () => {});
  try {
    await testClient.connect();
    await testClient.end();
    return null; // Already running
  } catch (err) {
    console.log('[init-db] External PostgreSQL not detected on port 5432. Starting local PostgreSQL server...');
    try {
      const EmbeddedPostgres = require('embedded-postgres').default;
      const dbDir = path.resolve(__dirname, '../data/db');
      const ep = new EmbeddedPostgres({
        databaseDir: dbDir,
        port: 5432,
        user: 'postgres',
        password: 'password',
        authMethod: 'trust',
        persistent: true
      });
      if (!fs.existsSync(dbDir)) {
        console.log('[init-db] Initializing new database cluster in', dbDir);
        await ep.initialise();
      }
      await ep.start();
      console.log('[init-db] Local PostgreSQL instance started successfully on port 5432.');
      return ep;
    } catch (e) {
      console.error('[init-db] Could not start embedded PostgreSQL:', e.message);
      throw err;
    }
  }
}

async function run() {
  console.log('=== ParkHere Database Initialization ===');
  let embeddedServer = null;

  try {
    embeddedServer = await ensurePostgresRunning();

    const targetDb = getDatabaseName(connectionString);
    const adminUrl = getAdminConnectionString(connectionString);

    // 1. Connect to admin postgres DB to recreate target DB cleanly
    const adminClient = new Client({ connectionString: adminUrl });
    adminClient.on('error', () => {});
    await adminClient.connect();

    const checkDb = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDb]
    );

    if (checkDb.rowCount > 0) {
      console.log(`[init-db] Resetting existing database "${targetDb}" for a clean setup...`);
      await adminClient.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [targetDb]);
      await adminClient.query(`DROP DATABASE "${targetDb}"`);
    }

    console.log(`[init-db] Creating database "${targetDb}"...`);
    await adminClient.query(`CREATE DATABASE "${targetDb}"`);
    console.log(`[init-db] Database "${targetDb}" created.`);
    await adminClient.end();

    // 2. Connect to the clean parkhere database and execute parkhere.sql section by section
    console.log(`[init-db] Connecting to database "${targetDb}"...`);
    const dbClient = new Client({ connectionString });
    dbClient.on('error', () => {});
    await dbClient.connect();

    const sqlPath = path.resolve(__dirname, '../../database/parkhere.sql');
    console.log(`[init-db] Reading SQL script from ${sqlPath}...`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split by top-level section demarcations
    const sections = sql.split(/-- ============================================================================\s*\r?\n-- SECTION /);

    console.log('[init-db] Executing database/parkhere.sql sections...');
    for (let i = 1; i < sections.length; i++) {
      const sectionSql = '-- SECTION ' + sections[i];
      const sectionHeader = sectionSql.split('\n')[0].replace(/--\s*/, '').trim();
      process.stdout.write(`  [${i}/${sections.length - 1}] ${sectionHeader}... `);
      await dbClient.query(sectionSql);
      console.log('OK');
    }

    // Verify key counts
    const usersCount = await dbClient.query('SELECT COUNT(*) FROM users');
    const locationsCount = await dbClient.query('SELECT COUNT(*) FROM parking_locations');
    const orgMembersCount = await dbClient.query('SELECT COUNT(*) FROM org_members');
    const bookingsCount = await dbClient.query('SELECT COUNT(*) FROM bookings');

    console.log('----------------------------------------------------');
    console.log(`[init-db] Initialization completed successfully!`);
    console.log(`Users seeded:        ${usersCount.rows[0].count}`);
    console.log(`Locations seeded:    ${locationsCount.rows[0].count}`);
    console.log(`Org Members seeded:  ${orgMembersCount.rows[0].count}`);
    console.log(`Bookings seeded:     ${bookingsCount.rows[0].count}`);
    console.log('----------------------------------------------------');

    await dbClient.end();
  } catch (err) {
    console.error('[init-db] Error during database initialization:', err);
    process.exitCode = 1;
  } finally {
    if (embeddedServer) {
      await embeddedServer.stop();
      console.log('[init-db] Embedded PostgreSQL stopped after initialization.');
    }
  }
}

run();
