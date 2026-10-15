/**
 * Central Error Handler Middleware
 * Maps Postgres constraint errors to user-friendly messages.
 * Never leaks stack traces or SQL strings.
 */
function errorHandler(err, req, res, next) {
  // Log server errors internally without sensitive payload
  if (!err.statusCode || err.statusCode >= 500) {
    console.error(`[Server Error] [${req.method} ${req.url}]:`, err.message || err);
  }

  // Handle PostgreSQL specific constraint codes
  if (err.code) {
    switch (err.code) {
      case '23505': // unique_violation
        return res.status(409).json({
          success: false,
          error: 'A record with these unique details already exists.'
        });

      case '23503': // foreign_key_violation
        return res.status(400).json({
          success: false,
          error: 'Referenced entity does not exist or cannot be modified.'
        });

      case '23514': // check_violation
        return res.status(400).json({
          success: false,
          error: 'Validation failed: input violates database constraints.'
        });

      case '22P02': // invalid_text_representation
        return res.status(400).json({
          success: false,
          error: 'Invalid parameter format or data type provided.'
        });

      default:
        break;
    }
  }

  const statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
  const message = statusCode < 500 ? (err.message || 'Client error') : 'An unexpected internal error occurred.';

  res.status(statusCode).json({
    success: false,
    error: message
  });
}

module.exports = errorHandler;
