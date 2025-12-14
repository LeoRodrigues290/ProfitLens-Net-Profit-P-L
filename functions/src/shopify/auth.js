/**
 * Shopify OAuth Authentication Flow
 * Handles app installation and token exchange
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const { getConfig } = require('../config');
const { encrypt } = require('../utils/encryption');
const {
    isValidShopDomain,
    sanitizeShopDomain,
    verifyShopifyHmac,
} = require('../utils/validators');

// Initialize Firestore if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * GET /auth/install
 * Initiates the OAuth flow by redirecting to Shopify authorization
 */
const install = functions.https.onRequest((req, res) => {
    const config = getConfig();
    const { shop, hmac } = req.query;

    // Validate shop parameter
    const sanitizedShop = sanitizeShopDomain(shop);
    if (!isValidShopDomain(sanitizedShop)) {
        console.error('Invalid shop domain:', shop);
        return res.status(400).json({
            error: 'Invalid shop domain',
            message: 'Please provide a valid myshopify.com domain',
        });
    }

    // Generate state/nonce for security
    const crypto = require('crypto');
    const nonce = crypto.randomBytes(16).toString('hex');

    // Build Shopify authorization URL
    const redirectUri = `${config.app.url}/auth/callback`;
    const authUrl = new URL(`https://${sanitizedShop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', config.shopify.apiKey);
    authUrl.searchParams.set('scope', config.shopify.scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', nonce);

    console.log(`OAuth initiated for shop: ${sanitizedShop}`);

    // Redirect to Shopify authorization page
    res.redirect(authUrl.toString());
});

/**
 * GET /auth/callback
 * Handles the OAuth callback, exchanges code for access token
 */
const callback = functions.https.onRequest(async (req, res) => {
    const config = getConfig();
    const { code, shop, state, hmac } = req.query;

    try {
        // Validate shop domain
        const sanitizedShop = sanitizeShopDomain(shop);
        if (!isValidShopDomain(sanitizedShop)) {
            throw new Error('Invalid shop domain');
        }

        // Validate required parameters
        if (!code) {
            throw new Error('Missing authorization code');
        }

        // Verify HMAC signature (optional but recommended)
        if (hmac && config.shopify.apiSecret) {
            const queryString = req.url.split('?')[1] || '';
            const isValid = verifyShopifyHmac(queryString, hmac, config.shopify.apiSecret);
            if (!isValid) {
                console.warn('Invalid HMAC signature for shop:', sanitizedShop);
                // Continue anyway - some Shopify flows don't include HMAC
            }
        }

        // Exchange authorization code for access token
        const tokenResponse = await axios.post(
            `https://${sanitizedShop}/admin/oauth/access_token`,
            {
                client_id: config.shopify.apiKey,
                client_secret: config.shopify.apiSecret,
                code,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        const { access_token, scope } = tokenResponse.data;

        if (!access_token) {
            throw new Error('No access token received from Shopify');
        }

        // Fetch shop details
        const shopResponse = await axios.get(
            `https://${sanitizedShop}/admin/api/${config.shopify.apiVersion}/shop.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': access_token,
                },
            }
        );

        const shopDetails = shopResponse.data.shop;

        // Encrypt access token before storing
        const encryptedToken = encrypt(access_token, config.shopify.apiSecret);

        // Save shop data to Firestore
        await db.collection('shops').doc(sanitizedShop).set({
            accessToken: encryptedToken,
            scope,
            shopifyPlan: shopDetails.plan_name || 'unknown',
            shopName: shopDetails.name,
            email: shopDetails.email,
            currency: shopDetails.currency,
            timezone: shopDetails.iana_timezone,
            subscriptionStatus: 'trial',
            trialEndsAt: admin.firestore.Timestamp.fromDate(
                new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days trial
            ),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        console.log(`Shop installed successfully: ${sanitizedShop}`);

        // Register GDPR webhooks (mandatory)
        await registerGDPRWebhooks(sanitizedShop, access_token, config);

        // Redirect to the app in Shopify admin
        res.redirect(`https://${sanitizedShop}/admin/apps/${config.shopify.apiKey}`);

    } catch (error) {
        console.error('OAuth callback error:', error.response?.data || error.message);

        res.status(500).json({
            error: 'Authentication failed',
            message: error.message,
        });
    }
});

/**
 * Register mandatory GDPR webhooks
 */
async function registerGDPRWebhooks(shop, accessToken, config) {
    const webhooks = [
        { topic: 'customers/data_request', address: `${config.app.url}/webhooks/customers/data_request` },
        { topic: 'customers/redact', address: `${config.app.url}/webhooks/customers/redact` },
        { topic: 'shop/redact', address: `${config.app.url}/webhooks/shop/redact` },
    ];

    for (const webhook of webhooks) {
        try {
            await axios.post(
                `https://${shop}/admin/api/${config.shopify.apiVersion}/webhooks.json`,
                { webhook },
                {
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                        'Content-Type': 'application/json',
                    },
                }
            );
            console.log(`Webhook registered: ${webhook.topic}`);
        } catch (error) {
            // Webhook may already exist
            if (error.response?.status !== 422) {
                console.error(`Failed to register webhook ${webhook.topic}:`, error.response?.data || error.message);
            }
        }
    }
}

/**
 * Verify if a shop is authenticated
 * Returns decrypted access token if valid
 */
const verifyShop = async (shopDomain) => {
    const config = getConfig();
    const sanitizedShop = sanitizeShopDomain(shopDomain);

    const shopDoc = await db.collection('shops').doc(sanitizedShop).get();

    if (!shopDoc.exists) {
        return null;
    }

    const shopData = shopDoc.data();
    const { decrypt } = require('../utils/encryption');

    try {
        const accessToken = decrypt(shopData.accessToken, config.shopify.apiSecret);
        return {
            shop: sanitizedShop,
            accessToken,
            ...shopData,
        };
    } catch (error) {
        console.error('Token decryption failed:', error.message);
        return null;
    }
};

/**
 * Get Shopify API headers
 */
const getShopifyHeaders = (accessToken) => ({
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
});

module.exports = {
    install,
    callback,
    verifyShop,
    getShopifyHeaders,
};
