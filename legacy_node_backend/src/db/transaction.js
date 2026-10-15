const { pool } = require('./pool');

/**
 * Executes a callback inside a PostgreSQL transaction using a dedicated client.
 * Automatically issues BEGIN, COMMIT on success, or ROLLBACK on error.
 *
 * @param {Function} callback - async (client) => result
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db-transaction] Error during ROLLBACK:', rollbackErr.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  withTransaction
};
