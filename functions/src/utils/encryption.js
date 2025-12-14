/**
 * Encryption utilities for secure token storage
 * Uses AES-256-GCM for authenticated encryption
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from secret (derives a 32-byte key)
 */
const getKey = (secret) => {
    return crypto.scryptSync(secret, 'cfo-de-bolso-salt', 32);
};

/**
 * Encrypt a plaintext string
 * @param {string} text - Text to encrypt
 * @param {string} secret - Secret key for encryption
 * @returns {string} - Encrypted text (base64 encoded)
 */
const encrypt = (text, secret) => {
    if (!text || !secret) {
        throw new Error('Text and secret are required for encryption');
    }

    const key = getKey(secret);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV + AuthTag + Encrypted data
    const combined = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encrypted, 'base64'),
    ]);

    return combined.toString('base64');
};

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - Encrypted text (base64 encoded)
 * @param {string} secret - Secret key for decryption
 * @returns {string} - Decrypted plaintext
 */
const decrypt = (encryptedText, secret) => {
    if (!encryptedText || !secret) {
        throw new Error('Encrypted text and secret are required for decryption');
    }

    const key = getKey(secret);
    const combined = Buffer.from(encryptedText, 'base64');

    // Extract IV, AuthTag, and Encrypted data
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
};

/**
 * Generate a secure random token
 * @param {number} length - Token length in bytes
 * @returns {string} - Random hex token
 */
const generateToken = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash a string using SHA-256
 * @param {string} text - Text to hash
 * @returns {string} - Hashed value (hex)
 */
const hash = (text) => {
    return crypto.createHash('sha256').update(text).digest('hex');
};

module.exports = {
    encrypt,
    decrypt,
    generateToken,
    hash,
};
