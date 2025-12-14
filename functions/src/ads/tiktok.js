/**
 * TikTok Ads Integration
 * OAuth and spend sync with TikTok Marketing API
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

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

/**
 * Initiate TikTok OAuth flow
 */
const connectTikTok = functions.https.onCall(async (data, context) => {
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
        platform: 'tiktok',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const redirectUri = `${config.app.url}/api/ads/tiktok/callback`;

    const authUrl = new URL('https://business-api.tiktok.com/portal/auth');
    authUrl.searchParams.set('app_id', config.adPlatforms.tiktok.appId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return {
        authUrl: authUrl.toString(),
    };
});

/**
 * Handle TikTok OAuth callback
 */
const tiktokCallback = functions.https.onRequest(async (req, res) => {
    const config = getConfig();
    const { auth_code, state } = req.query;

    if (!auth_code) {
        console.error('TikTok OAuth error: No auth code');
        return res.redirect(`${config.app.url}/settings/ads?error=tiktok_denied`);
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
        const tokenResponse = await axios.post(`${TIKTOK_API_BASE}/oauth2/access_token/`, {
            app_id: config.adPlatforms.tiktok.appId,
            secret: config.adPlatforms.tiktok.appSecret,
            auth_code,
        });

        if (tokenResponse.data.code !== 0) {
            throw new Error(tokenResponse.data.message || 'Token exchange failed');
        }

        const tokenData = tokenResponse.data.data;
        const { access_token, advertiser_ids } = tokenData;

        if (!advertiser_ids || advertiser_ids.length === 0) {
            return res.redirect(`${config.app.url}/settings/ads?error=no_tiktok_account`);
        }

        // Get advertiser details
        const advertiserId = advertiser_ids[0];
        const advertiserResponse = await axios.get(`${TIKTOK_API_BASE}/advertiser/info/`, {
            params: {
                advertiser_ids: JSON.stringify(advertiser_ids),
            },
            headers: {
                'Access-Token': access_token,
            },
        });

        const advertiserInfo = advertiserResponse.data.data?.list?.[0] || {};

        // Save encrypted tokens
        await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('tiktok')
            .set({
                accessToken: encrypt(access_token, config.adPlatforms.tiktok.appSecret),
                advertiserId,
                advertiserName: advertiserInfo.name || '',
                currency: advertiserInfo.currency || 'USD',
                connectedAt: admin.firestore.FieldValue.serverTimestamp(),
                availableAccounts: advertiser_ids.map(id => ({ id })),
            });

        console.log(`TikTok Ads connected for ${shopDomain}`);
        res.redirect(`${config.app.url}/settings/ads?success=tiktok`);

    } catch (error) {
        console.error('TikTok callback error:', error.response?.data || error.message);
        res.redirect(`${config.app.url}/settings/ads?error=tiktok_failed`);
    }
});

/**
 * Sync TikTok Ads spend
 * Called by cron job every 2 hours
 */
const syncTikTokAds = functions.https.onRequest(async (req, res) => {
    const config = getConfig();

    // Verify cron secret
    const secret = req.headers['x-secret-key'];
    if (secret !== config.cron.secret) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const shopsWithTikTok = await db
            .collectionGroup('platforms')
            .where(admin.firestore.FieldPath.documentId(), '==', 'tiktok')
            .get();

        const results = {
            total: shopsWithTikTok.size,
            success: 0,
            failed: 0,
        };

        for (const doc of shopsWithTikTok.docs) {
            const shopDomain = doc.ref.parent.parent.id;

            try {
                await syncTikTokSpend(shopDomain, doc.data(), config);
                results.success++;
            } catch (error) {
                console.error(`Failed to sync TikTok for ${shopDomain}:`, error.message);
                results.failed++;
            }
        }

        console.log('TikTok sync completed:', results);
        res.status(200).json({ success: true, results });

    } catch (error) {
        console.error('TikTok sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Sync spend for a single shop
 */
async function syncTikTokSpend(shopDomain, tokenData, config) {
    const { accessToken, advertiserId } = tokenData;
    const decryptedToken = decrypt(accessToken, config.adPlatforms.tiktok.appSecret);

    const today = new Date().toISOString().split('T')[0];

    try {
        const response = await axios.get(`${TIKTOK_API_BASE}/report/integrated/get/`, {
            params: {
                advertiser_id: advertiserId,
                report_type: 'BASIC',
                dimensions: JSON.stringify(['stat_time_day']),
                data_level: 'AUCTION_ADVERTISER',
                start_date: today,
                end_date: today,
                metrics: JSON.stringify(['spend', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr']),
            },
            headers: {
                'Access-Token': decryptedToken,
            },
        });

        if (response.data.code !== 0) {
            throw new Error(response.data.message || 'Failed to fetch report');
        }

        const reportData = response.data.data?.list?.[0]?.metrics || {};
        const spend = parseFloat(reportData.spend) || 0;

        await db
            .collection('adSpend')
            .doc(shopDomain)
            .collection('daily')
            .doc(`${today}-tiktok`)
            .set({
                platform: 'tiktok',
                date: today,
                spend,
                metrics: {
                    impressions: parseInt(reportData.impressions) || 0,
                    clicks: parseInt(reportData.clicks) || 0,
                    cpc: parseFloat(reportData.cpc) || 0,
                    cpm: parseFloat(reportData.cpm) || 0,
                    ctr: parseFloat(reportData.ctr) || 0,
                },
                syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

        console.log(`Synced TikTok Ads for ${shopDomain}: $${spend}`);

    } catch (error) {
        // Handle case where there's no data for today
        if (error.response?.data?.code === 40002) {
            console.log(`No TikTok Ads data for ${shopDomain} today`);
            return;
        }
        throw error;
    }
}

/**
 * Disconnect TikTok Ads
 */
const disconnectTikTok = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('tiktok')
            .delete();

        return { success: true, message: 'TikTok Ads disconnected' };

    } catch (error) {
        console.error('Disconnect TikTok error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get TikTok connection status
 */
const getTikTokStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        const doc = await db
            .collection('oauthTokens')
            .doc(shopDomain)
            .collection('platforms')
            .doc('tiktok')
            .get();

        if (!doc.exists) {
            return { connected: false };
        }

        const data = doc.data();
        return {
            connected: true,
            advertiserId: data.advertiserId,
            advertiserName: data.advertiserName,
            currency: data.currency,
            connectedAt: data.connectedAt,
        };

    } catch (error) {
        console.error('Get TikTok status error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

module.exports = {
    connectTikTok,
    tiktokCallback,
    syncTikTokAds,
    disconnectTikTok,
    getTikTokStatus,
};
