const app = require('./app');
const config = require('./config');
const { query, ensurePostgresRunning, stopEmbedded } = require('./db/pool');

let expiryJobInterval = null;

async function startServer() {
  try {
    console.log('[server] Initializing database connection...');
    await ensurePostgresRunning();

    // Verify DB connectivity
    const testRes = await query('SELECT NOW() as current_time');
    console.log('[server] Connected to PostgreSQL. DB time:', testRes.rows[0].current_time);

    // Initial overdue expiry sweep
    await query('SELECT expire_overdue_bookings()');

    // Run expiration sweep every 30 seconds as required by Section 4.8
    expiryJobInterval = setInterval(async () => {
      try {
        const sweepRes = await query('SELECT expire_overdue_bookings()');
        const count = sweepRes.rows[0].expire_overdue_bookings;
        if (count > 0) {
          console.log(`[expiry-sweep] Expired ${count} overdue pending booking(s).`);
        }
      } catch (err) {
        console.error('[expiry-sweep] Error during automated expiration sweep:', err.message);
      }
    }, 30000);

    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[server] ParkHere backend listening on http://localhost:${config.port}`);
    });

    const shutdown = async () => {
      console.log('[server] Gracefully shutting down...');
      if (expiryJobInterval) clearInterval(expiryJobInterval);
      server.close(async () => {
        await stopEmbedded();
        console.log('[server] Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('[server] Fatal error during startup:', err);
    process.exit(1);
  }
}

startServer();
