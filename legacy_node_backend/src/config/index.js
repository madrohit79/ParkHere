const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/parkhere',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_parkhere_college_dbms_2026_secure',
  codeHmacSecret: process.env.CODE_HMAC_SECRET || 'super_secret_arrival_code_hmac_secret_2026_secure_key',
  codeEncKey: process.env.CODE_ENC_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  arrivalWindowMinutes: parseInt(process.env.ARRIVAL_WINDOW_MINUTES, 10) || 15
};

module.exports = config;
