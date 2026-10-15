/**
 * Simple in-memory sliding-window rate limiter.
 * No external dependencies.
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // default 15 minutes
  const max = options.max || 100; // default 100 requests per window
  const message = options.message || 'Too many requests, please try again later.';

  const hits = new Map();

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, records] of hits.entries()) {
      const valid = records.filter(timestamp => now - timestamp < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, Math.min(windowMs, 60000)).unref();

  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const timestamps = hits.get(key) || [];

    const recent = timestamps.filter(t => now - t < windowMs);

    if (recent.length >= max) {
      return res.status(429).json({
        success: false,
        error: message
      });
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

module.exports = {
  createRateLimiter,
  authLimiter: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Please try again after 15 minutes.' }),
  verifyLimiter: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many verification attempts. Please try again after 15 minutes.' })
};
