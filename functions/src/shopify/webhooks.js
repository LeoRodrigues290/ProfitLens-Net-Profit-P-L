/**
 * Shopify GDPR Webhooks
 * Required for Shopify App Store compliance
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getConfig } = require('../config');
const { verifyWebhookSignature, sanitizeShopDomain } = require('../utils/validators');

// Initialize Firestore if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Middleware to verify Shopify webhook signature
 */
const verifyWebhook = (req, res, next) => {
    const config = getConfig();
    const hmac = req.headers['x-shopify-hmac-sha256'];

    if (!hmac) {
        console.error('Missing HMAC header');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, hmac, config.shopify.apiSecret)) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

/**
 * POST /webhooks/customers/data_request
 * Customer requests their data
 * Required by GDPR - returns customer data
 */
const customersDataRequest = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { shop_domain, customer, orders_requested } = req.body;
        const sanitizedShop = sanitizeShopDomain(shop_domain);

        console.log(`Customer data request from ${sanitizedShop}:`, {
            customerId: customer?.id,
            email: customer?.email,
            ordersRequested: orders_requested?.length || 0,
        });

        // We don't store customer data beyond order info
        // Respond with acknowledgment
        res.status(200).json({
            message: 'Data request received',
            shop: sanitizedShop,
            customerData: {
                note: 'CFO de Bolso only stores aggregated order data for profit calculations. No personal customer data is stored beyond what Shopify provides.',
            },
        });

    } catch (error) {
        console.error('Customer data request error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /webhooks/customers/redact
 * Customer data must be deleted
 * Required by GDPR
 */
const customersRedact = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { shop_domain, customer, orders_to_redact } = req.body;
        const sanitizedShop = sanitizeShopDomain(shop_domain);

        console.log(`Customer redact request from ${sanitizedShop}:`, {
            customerId: customer?.id,
            email: customer?.email,
            ordersToRedact: orders_to_redact?.length || 0,
        });

        // We don't store identifiable customer data
        // Just acknowledge the request
        res.status(200).json({
            message: 'Customer data redacted',
            shop: sanitizedShop,
            note: 'No personal customer data was stored',
        });

    } catch (error) {
        console.error('Customer redact error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /webhooks/shop/redact
 * Shop is uninstalling - delete all shop data
 * Required by GDPR - 48 hours deadline
 */
const shopRedact = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { shop_domain } = req.body;
        const sanitizedShop = sanitizeShopDomain(shop_domain);

        console.log(`Shop redact request: ${sanitizedShop}`);

        // Delete all shop data from all collections
        const batch = db.batch();

        // Collections to delete
        const collections = [
            'shops',
            'productCosts',
            'adSpend',
            'oauthTokens',
            'fixedCosts',
            'shopStats',
            'dailyMetrics',
        ];

        for (const collection of collections) {
            const docRef = db.collection(collection).doc(sanitizedShop);

            // Check if it's a document with subcollections
            if (['productCosts', 'adSpend', 'oauthTokens', 'fixedCosts', 'dailyMetrics'].includes(collection)) {
                // Delete subcollections recursively
                await deleteCollection(docRef);
            }

            batch.delete(docRef);
        }

        await batch.commit();

        console.log(`Shop data deleted: ${sanitizedShop}`);

        res.status(200).json({
            message: 'Shop data redacted successfully',
            shop: sanitizedShop,
        });

    } catch (error) {
        console.error('Shop redact error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Recursively delete a collection
 */
async function deleteCollection(docRef) {
    const subcollections = await docRef.listCollections();

    for (const subcollection of subcollections) {
        const docs = await subcollection.listDocuments();

        for (const doc of docs) {
            await deleteCollection(doc); // Recurse for nested subcollections
            await doc.delete();
        }
    }
}

/**
 * POST /webhooks/app/uninstalled
 * App is being uninstalled from the store
 */
const appUninstalled = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const shopDomain = req.headers['x-shopify-shop-domain'];
        const sanitizedShop = sanitizeShopDomain(shopDomain);

        console.log(`App uninstalled: ${sanitizedShop}`);

        // Mark shop as uninstalled (data will be deleted via shop/redact)
        await db.collection('shops').doc(sanitizedShop).update({
            subscriptionStatus: 'uninstalled',
            uninstalledAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.status(200).json({ message: 'Uninstall recorded' });

    } catch (error) {
        console.error('App uninstall error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = {
    customersDataRequest,
    customersRedact,
    shopRedact,
    appUninstalled,
};
