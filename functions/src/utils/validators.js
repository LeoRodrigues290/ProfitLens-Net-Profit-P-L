/**
 * Input validation and sanitization utilities
 */

/**
 * Validate Shopify shop domain format
 * @param {string} shop - Shop domain to validate
 * @returns {boolean} - True if valid
 */
const isValidShopDomain = (shop) => {
    if (!shop || typeof shop !== 'string') return false;

    // Must be a valid myshopify.com domain
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    return shopRegex.test(shop);
};

/**
 * Sanitize shop domain (remove protocol, trailing slashes)
 * @param {string} shop - Shop domain to sanitize
 * @returns {string} - Sanitized domain
 */
const sanitizeShopDomain = (shop) => {
    if (!shop) return '';

    return shop
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .trim();
};

/**
 * Validate date format (YYYY-MM-DD)
 * @param {string} date - Date string to validate
 * @returns {boolean} - True if valid
 */
const isValidDate = (date) => {
    if (!date || typeof date !== 'string') return false;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return false;

    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
};

/**
 * Validate positive number
 * @param {any} value - Value to check
 * @returns {boolean} - True if positive number
 */
const isPositiveNumber = (value) => {
    return typeof value === 'number' && !isNaN(value) && value >= 0;
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validate HMAC signature from Shopify
 * @param {string} query - Query string from request
 * @param {string} signature - HMAC signature to verify
 * @param {string} secret - App secret
 * @returns {boolean} - True if valid
 */
const verifyShopifyHmac = (query, signature, secret) => {
    const crypto = require('crypto');

    // Remove hmac from query params
    const params = new URLSearchParams(query);
    params.delete('hmac');
    params.sort();

    const message = params.toString();
    const expectedHmac = crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedHmac)
    );
};

/**
 * Validate Shopify webhook signature
 * @param {string} body - Raw request body
 * @param {string} signature - X-Shopify-Hmac-SHA256 header
 * @param {string} secret - App secret
 * @returns {boolean} - True if valid
 */
const verifyWebhookSignature = (body, signature, secret) => {
    const crypto = require('crypto');

    const expectedHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedHmac)
    );
};

/**
 * Validate ad platform name
 * @param {string} platform - Platform name
 * @returns {boolean} - True if valid
 */
const isValidAdPlatform = (platform) => {
    const validPlatforms = ['facebook', 'google', 'tiktok'];
    return validPlatforms.includes(platform?.toLowerCase());
};

/**
 * Validate currency code (ISO 4217)
 * @param {string} currency - Currency code
 * @returns {boolean} - True if valid
 */
const isValidCurrency = (currency) => {
    const validCurrencies = ['USD', 'EUR', 'BRL', 'GBP', 'CAD', 'AUD'];
    return validCurrencies.includes(currency?.toUpperCase());
};

module.exports = {
    isValidShopDomain,
    sanitizeShopDomain,
    isValidDate,
    isPositiveNumber,
    isValidEmail,
    verifyShopifyHmac,
    verifyWebhookSignature,
    isValidAdPlatform,
    isValidCurrency,
};
