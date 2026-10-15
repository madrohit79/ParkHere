const crypto = require('crypto');
const config = require('../config');

/**
 * Generates a cryptographically secure 6-digit arrival code string.
 * @returns {string} e.g. "042918"
 */
function generateArrivalCode() {
  const num = crypto.randomInt(0, 1000000);
  return String(num).padStart(6, '0');
}

/**
 * Hashes an arrival code with HMAC-SHA256.
 * @param {string} code
 * @returns {string} 64-character hex hash
 */
function hashArrivalCode(code) {
  return crypto
    .createHmac('sha256', config.codeHmacSecret)
    .update(String(code).trim())
    .digest('hex');
}

/**
 * Encrypts an arrival code using AES-256-GCM.
 * @param {string} code
 * @returns {string} iv:tag:ciphertext (hex encoded)
 */
function encryptArrivalCode(code) {
  const key = Buffer.from(config.codeEncKey, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(String(code).trim(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted arrival code.
 * @param {string} encryptedString iv:tag:ciphertext
 * @returns {string|null} Plaintext code string or null if decryption fails
 */
function decryptArrivalCode(encryptedString) {
  if (!encryptedString) return null;
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, cipherHex] = parts;

    const key = Buffer.from(config.codeEncKey, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateArrivalCode,
  hashArrivalCode,
  encryptArrivalCode,
  decryptArrivalCode
};
