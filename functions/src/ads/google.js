/**
 * Google Ads Integration
 * OAuth and spend sync with Google Ads API
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const { getConfig } = require('../config');
const { encrypt, decrypt } = require('../utils/encryption');

// Initialize Firestore if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Initiate Google OAuth flow
 */
const connectGoogle = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const config = getConfig();
    const shopDomain = context.auth.token.shop;

    // Generate state
    const crypto = require('crypto');
    const state = crypto.randomBytes(16).toString('hex');

    await db.collection('oauthStates').doc(state).set({
        shop: shopDomain,
        platform: 'google',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const redirectUri = `${config.app.url}/api/ads/google/callback`;
    const scopes = [
        'https://www.googleapis.com/auth/adwords',
    ];

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', config.adPlatforms.google.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    return {
        authUrl: authUrl.toString(),
    };
});

/**
 * Handle Google OAuth callback
 */
const googleCallback = functions.https.onRequest(async (req, res) => {
    const config = getConfig();
    const { code, state, error } = req.query;

    if (error) {
        console.error('Google OAuth error:', error);
        return res.redirect(`${config.app.url}/settings/ads?error=google_denied`);
    }

    try {
        // Verify state
        const stateDoc = await db.collection('oauthStates').doc(state).get();
        if (!stateDoc.exists) {
            throw new Error('Invalid state parameter');
        }

        const { shop: shopDomain } = stateDoc.data();
        await db.collection('oauthStates').doc(state).delete();

        // Exchange code for tokens
        const redirectUri = `${config.app.url}/api/ads/google/callback`;
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: config.adPlatforms.google.clientId,
            client_secret: config.adPlatforms.google.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        });

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        // Get accessible customer accounts
        const customersResponse = await axios.get(
            'https://googleads.googleapis.com/v15/customers:listAccessibleCustomers',
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'developer-token': config.adPlatforms.google.developerToken || '',
                },
            }
        );

        const customerIds = customersResponse.data.resourceNames || [];
        const customerId = customerIds[0]?.replace('customers/', '') || null;

        if (!customerId) {
            return res.redirect(`${config.app.url}/settings/ads?error=no_google_account`);
        }

        // Save encrypted tokens
        await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('google')
            .set({
                accessToken: encrypt(access_token, config.adPlatforms.google.clientSecret),
                refreshToken: encrypt(refresh_token, config.adPlatforms.google.clientSecret),
                customerId,
                expiresAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + expires_in * 1000)
                ),
                connectedAt: admin.firestore.FieldValue.serverTimestamp(),
                availableAccounts: customerIds.map(id => id.replace('customers/', '')),
            });

        console.log(`Google Ads connected for ${shopDomain}`);
        res.redirect(`${config.app.url}/settings/ads?success=google`);

    } catch (error) {
        console.error('Google callback error:', error.response?.data || error.message);
        res.redirect(`${config.app.url}/settings/ads?error=google_failed`);
    }
});

/**
 * Sync Google Ads spend
 * Called by cron job every 2 hours
 */
const syncGoogleAds = functions.https.onRequest(async (req, res) => {
    const config = getConfig();

    // Verify cron secret
    const secret = req.headers['x-secret-key'];
    if (secret !== config.cron.secret) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const shopsWithGoogle = await db
            .collectionGroup('platforms')
            .where(admin.firestore.FieldPath.documentId(), '==', 'google')
            .get();

        const results = {
            total: shopsWithGoogle.size,
            success: 0,
            failed: 0,
        };

        for (const doc of shopsWithGoogle.docs) {
            const shopDomain = doc.ref.parent.parent.id;

            try {
                await syncGoogleSpend(shopDomain, doc.data(), config);
                results.success++;
            } catch (error) {
                console.error(`Failed to sync Google for ${shopDomain}:`, error.message);
                results.failed++;
            }
        }

        console.log('Google sync completed:', results);
        res.status(200).json({ success: true, results });

    } catch (error) {
        console.error('Google sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Sync spend for a single shop
 */
async function syncGoogleSpend(shopDomain, tokenData, config) {
    let { accessToken, refreshToken, customerId, expiresAt } = tokenData;

    // Check if token needs refresh
    if (expiresAt.toDate() < new Date()) {
        const newTokens = await refreshGoogleToken(refreshToken, config);
        accessToken = encrypt(newTokens.access_token, config.adPlatforms.google.clientSecret);

        await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('google')
            .update({
                accessToken,
                expiresAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + newTokens.expires_in * 1000)
                ),
            });
    }

    const decryptedToken = decrypt(accessToken, config.adPlatforms.google.clientSecret);
    const today = new Date().toISOString().split('T')[0];

    // Query for today's spend using Google Ads Query Language
    const query = `
    SELECT 
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.average_cpc
    FROM customer
    WHERE segments.date = '${today}'
  `;

    try {
        const response = await axios.post(
            `https://googleads.googleapis.com/v15/customers/${customerId}/googleAds:searchStream`,
            { query },
            {
                headers: {
                    'Authorization': `Bearer ${decryptedToken}`,
                    'developer-token': config.adPlatforms.google.developerToken || '',
                    'login-customer-id': customerId,
                },
            }
        );

        const results = response.data[0]?.results?.[0] || {};
        const costMicros = parseInt(results.metrics?.costMicros) || 0;
        const spend = costMicros / 1000000; // Convert micros to currency

        await db
            .collection('adSpend')
            .doc(shopDomain)
            .collection('daily')
            .doc(`${today}-google`)
            .set({
                platform: 'google',
                date: today,
                spend,
                metrics: {
                    impressions: parseInt(results.metrics?.impressions) || 0,
                    clicks: parseInt(results.metrics?.clicks) || 0,
                    averageCpc: (parseInt(results.metrics?.averageCpc) || 0) / 1000000,
                },
                syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

        console.log(`Synced Google Ads for ${shopDomain}: $${spend}`);

    } catch (error) {
        // Handle case where there's no data for today
        if (error.response?.status === 400) {
            console.log(`No Google Ads data for ${shopDomain} today`);
            return;
        }
        throw error;
    }
}

/**
 * Refresh Google access token
 */
async function refreshGoogleToken(encryptedRefreshToken, config) {
    const refreshToken = decrypt(encryptedRefreshToken, config.adPlatforms.google.clientSecret);

    const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: config.adPlatforms.google.clientId,
        client_secret: config.adPlatforms.google.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
    });

    return response.data;
}

/**
 * Disconnect Google Ads
 */
const disconnectGoogle = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('google')
            .delete();

        return { success: true, message: 'Google Ads disconnected' };

    } catch (error) {
        console.error('Disconnect Google error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get Google connection status
 */
const getGoogleStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        const doc = await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('google')
            .get();

        if (!doc.exists) {
            return { connected: false };
        }

        const data = doc.data();
        return {
            connected: true,
            customerId: data.customerId,
            connectedAt: data.connectedAt,
            expiresAt: data.expiresAt,
        };

    } catch (error) {
        console.error('Get Google status error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

module.exports = {
    connectGoogle,
    googleCallback,
    syncGoogleAds,
    disconnectGoogle,
    getGoogleStatus,
};
