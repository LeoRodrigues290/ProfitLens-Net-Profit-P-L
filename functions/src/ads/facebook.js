/**
 * Facebook Ads Integration
 * OAuth and spend sync with Facebook Marketing API
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
 * Initiate Facebook OAuth flow
 * Called when user clicks "Connect Facebook Ads"
 */
const connectFacebook = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const config = getConfig();
    const shopDomain = context.auth.token.shop;

    // Generate state parameter for security
    const crypto = require('crypto');
    const state = crypto.randomBytes(16).toString('hex');

    // Store state for verification in callback
    await db.collection('oauthStates').doc(state).set({
        shop: shopDomain,
        platform: 'facebook',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Build Facebook OAuth URL
    const redirectUri = `${config.app.url}/api/ads/facebook/callback`;
    const scopes = ['ads_read', 'ads_management', 'business_management'];

    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', config.adPlatforms.facebook.appId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', scopes.join(','));
    authUrl.searchParams.set('response_type', 'code');

    return {
        authUrl: authUrl.toString(),
    };
});

/**
 * Handle Facebook OAuth callback
 */
const facebookCallback = functions.https.onRequest(async (req, res) => {
    const config = getConfig();
    const { code, state, error } = req.query;

    if (error) {
        console.error('Facebook OAuth error:', error);
        return res.redirect(`${config.app.url}/settings/ads?error=facebook_denied`);
    }

    try {
        // Verify state
        const stateDoc = await db.collection('oauthStates').doc(state).get();
        if (!stateDoc.exists) {
            throw new Error('Invalid state parameter');
        }

        const { shop: shopDomain } = stateDoc.data();
        await db.collection('oauthStates').doc(state).delete();

        // Exchange code for access token
        const redirectUri = `${config.app.url}/api/ads/facebook/callback`;
        const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                client_id: config.adPlatforms.facebook.appId,
                client_secret: config.adPlatforms.facebook.appSecret,
                redirect_uri: redirectUri,
                code,
            },
        });

        const { access_token, expires_in } = tokenResponse.data;

        // Get long-lived token
        const longLivedResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: config.adPlatforms.facebook.appId,
                client_secret: config.adPlatforms.facebook.appSecret,
                fb_exchange_token: access_token,
            },
        });

        const longLivedToken = longLivedResponse.data.access_token;
        const longLivedExpires = longLivedResponse.data.expires_in || 5184000; // 60 days default

        // Get ad accounts
        const adAccountsResponse = await axios.get('https://graph.facebook.com/v18.0/me/adaccounts', {
            params: {
                access_token: longLivedToken,
                fields: 'id,name,account_status,currency',
            },
        });

        const adAccounts = adAccountsResponse.data.data || [];

        // Use first active ad account (user can change later)
        const activeAccount = adAccounts.find(a => a.account_status === 1) || adAccounts[0];

        if (!activeAccount) {
            return res.redirect(`${config.app.url}/settings/ads?error=no_ad_account`);
        }

        // Save encrypted token
        await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('facebook')
            .set({
                accessToken: encrypt(longLivedToken, config.adPlatforms.facebook.appSecret),
                adAccountId: activeAccount.id.replace('act_', ''),
                adAccountName: activeAccount.name,
                currency: activeAccount.currency,
                expiresAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + longLivedExpires * 1000)
                ),
                connectedAt: admin.firestore.FieldValue.serverTimestamp(),
                availableAccounts: adAccounts.map(a => ({
                    id: a.id.replace('act_', ''),
                    name: a.name,
                    status: a.account_status,
                })),
            });

        console.log(`Facebook Ads connected for ${shopDomain}`);
        res.redirect(`${config.app.url}/settings/ads?success=facebook`);

    } catch (error) {
        console.error('Facebook callback error:', error.response?.data || error.message);
        res.redirect(`${config.app.url}/settings/ads?error=facebook_failed`);
    }
});

/**
 * Sync Facebook Ads spend
 * Called by cron job every 2 hours
 */
const syncFacebookAds = functions.https.onRequest(async (req, res) => {
    const config = getConfig();

    // Verify cron secret
    const secret = req.headers['x-secret-key'];
    if (secret !== config.cron.secret) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        // Get all shops with Facebook connected
        const shopsWithFacebook = await db
            .collectionGroup('platforms')
            .where(admin.firestore.FieldPath.documentId(), '==', 'facebook')
            .get();

        const results = {
            total: shopsWithFacebook.size,
            success: 0,
            failed: 0,
        };

        for (const doc of shopsWithFacebook.docs) {
            const shopDomain = doc.ref.parent.parent.id;

            try {
                await syncFacebookSpend(shopDomain, doc.data(), config);
                results.success++;
            } catch (error) {
                console.error(`Failed to sync Facebook for ${shopDomain}:`, error.message);
                results.failed++;
            }
        }

        console.log('Facebook sync completed:', results);
        res.status(200).json({ success: true, results });

    } catch (error) {
        console.error('Facebook sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Sync spend for a single shop
 */
async function syncFacebookSpend(shopDomain, tokenData, config) {
    const { accessToken, adAccountId } = tokenData;

    const decryptedToken = decrypt(accessToken, config.adPlatforms.facebook.appSecret);

    // Get today's spend
    const today = new Date().toISOString().split('T')[0];

    const response = await axios.get(
        `https://graph.facebook.com/v18.0/act_${adAccountId}/insights`,
        {
            params: {
                access_token: decryptedToken,
                date_preset: 'today',
                fields: 'spend,impressions,clicks,cpc,cpm,ctr',
                time_increment: 1,
            },
        }
    );

    const data = response.data.data?.[0] || {};
    const spend = parseFloat(data.spend) || 0;

    // Save to Firestore
    await db
        .collection('adSpend')
        .doc(shopDomain)
        .collection('daily')
        .doc(`${today}-facebook`)
        .set({
            platform: 'facebook',
            date: today,
            spend,
            metrics: {
                impressions: parseInt(data.impressions) || 0,
                clicks: parseInt(data.clicks) || 0,
                cpc: parseFloat(data.cpc) || 0,
                cpm: parseFloat(data.cpm) || 0,
                ctr: parseFloat(data.ctr) || 0,
            },
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

    console.log(`Synced Facebook Ads for ${shopDomain}: $${spend}`);
}

/**
 * Disconnect Facebook Ads
 */
const disconnectFacebook = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('facebook')
            .delete();

        return { success: true, message: 'Facebook Ads disconnected' };

    } catch (error) {
        console.error('Disconnect Facebook error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get Facebook connection status
 */
const getFacebookStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        const doc = await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('facebook')
            .get();

        if (!doc.exists) {
            return { connected: false };
        }

        const data = doc.data();
        return {
            connected: true,
            adAccountName: data.adAccountName,
            adAccountId: data.adAccountId,
            currency: data.currency,
            connectedAt: data.connectedAt,
            expiresAt: data.expiresAt,
        };

    } catch (error) {
        console.error('Get Facebook status error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

module.exports = {
    connectFacebook,
    facebookCallback,
    syncFacebookAds,
    disconnectFacebook,
    getFacebookStatus,
};
