/**
 * Shopify Billing API Integration
 * Handle app subscriptions and charges
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const { getConfig } = require('../config');
const { verifyShop, getShopifyHeaders } = require('../shopify/auth');

// Initialize Firestore if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// Subscription plans
const PLANS = {
    free: {
        name: 'Free',
        price: 0,
        features: {
            ordersPerMonth: 100,
            adPlatforms: 0,
            historyDays: 7,
        },
    },
    starter: {
        name: 'Starter',
        price: 9.99,
        features: {
            ordersPerMonth: 500,
            adPlatforms: 1,
            historyDays: 30,
        },
    },
    professional: {
        name: 'Professional',
        price: 29.99,
        features: {
            ordersPerMonth: 5000,
            adPlatforms: 3,
            historyDays: 90,
        },
    },
    enterprise: {
        name: 'Enterprise',
        price: 99.99,
        features: {
            ordersPerMonth: -1, // Unlimited
            adPlatforms: 3,
            historyDays: 365,
        },
    },
};

/**
 * Create a recurring subscription charge
 */
const createSubscription = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { planId } = data;

    const plan = PLANS[planId];
    if (!plan || plan.price === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid plan');
    }

    const config = getConfig();

    try {
        const shopData = await verifyShop(shopDomain);
        if (!shopData) {
            throw new Error('Shop not found');
        }

        // Create recurring application charge
        const response = await axios.post(
            `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/recurring_application_charges.json`,
            {
                recurring_application_charge: {
                    name: `CFO de Bolso - ${plan.name}`,
                    price: plan.price,
                    return_url: `${config.app.url}/billing/callback`,
                    trial_days: 14,
                    test: process.env.NODE_ENV !== 'production',
                },
            },
            {
                headers: getShopifyHeaders(shopData.accessToken),
            }
        );

        const charge = response.data.recurring_application_charge;

        // Store pending charge
        await db.collection('shops').doc(shopDomain).update({
            pendingCharge: {
                id: charge.id,
                planId,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
        });

        return {
            success: true,
            confirmationUrl: charge.confirmation_url,
        };

    } catch (error) {
        console.error('Create subscription error:', error.response?.data || error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Handle billing callback after merchant confirms
 */
const billingCallback = functions.https.onRequest(async (req, res) => {
    const config = getConfig();
    const { charge_id } = req.query;
    const shopDomain = req.headers['x-shopify-shop-domain'] || req.query.shop;

    try {
        const shopData = await verifyShop(shopDomain);
        if (!shopData) {
            return res.redirect(`${config.app.url}?error=shop_not_found`);
        }

        // Get charge status
        const response = await axios.get(
            `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/recurring_application_charges/${charge_id}.json`,
            {
                headers: getShopifyHeaders(shopData.accessToken),
            }
        );

        const charge = response.data.recurring_application_charge;

        if (charge.status === 'accepted') {
            // Activate the charge
            await axios.post(
                `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/recurring_application_charges/${charge_id}/activate.json`,
                {},
                {
                    headers: getShopifyHeaders(shopData.accessToken),
                }
            );

            // Update shop subscription status
            const shopDoc = await db.collection('shops').doc(shopDomain).get();
            const pendingCharge = shopDoc.data()?.pendingCharge;

            await db.collection('shops').doc(shopDomain).update({
                subscriptionStatus: 'active',
                subscriptionPlan: pendingCharge?.planId || 'professional',
                chargeId: charge_id,
                billingOn: admin.firestore.Timestamp.fromDate(new Date(charge.billing_on)),
                activatedAt: admin.firestore.FieldValue.serverTimestamp(),
                pendingCharge: admin.firestore.FieldValue.delete(),
            });

            console.log(`Subscription activated for ${shopDomain}`);
            res.redirect(`${config.app.url}/settings/billing?success=subscribed`);

        } else if (charge.status === 'declined') {
            await db.collection('shops').doc(shopDomain).update({
                pendingCharge: admin.firestore.FieldValue.delete(),
            });

            res.redirect(`${config.app.url}/settings/billing?error=declined`);

        } else {
            res.redirect(`${config.app.url}/settings/billing?status=${charge.status}`);
        }

    } catch (error) {
        console.error('Billing callback error:', error);
        res.redirect(`${config.app.url}/settings/billing?error=callback_failed`);
    }
});

/**
 * Cancel subscription
 */
const cancelSubscription = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const config = getConfig();

    try {
        const shopData = await verifyShop(shopDomain);
        if (!shopData) {
            throw new Error('Shop not found');
        }

        const shopDoc = await db.collection('shops').doc(shopDomain).get();
        const chargeId = shopDoc.data()?.chargeId;

        if (chargeId) {
            // Cancel the charge
            await axios.delete(
                `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/recurring_application_charges/${chargeId}.json`,
                {
                    headers: getShopifyHeaders(shopData.accessToken),
                }
            );
        }

        // Update shop status
        await db.collection('shops').doc(shopDomain).update({
            subscriptionStatus: 'cancelled',
            chargeId: admin.firestore.FieldValue.delete(),
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { success: true, message: 'Subscription cancelled' };

    } catch (error) {
        console.error('Cancel subscription error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get current subscription status
 */
const getSubscriptionStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        const shopDoc = await db.collection('shops').doc(shopDomain).get();
        const shopData = shopDoc.data() || {};

        const status = shopData.subscriptionStatus || 'trial';
        const planId = shopData.subscriptionPlan || 'free';
        const plan = PLANS[planId] || PLANS.free;

        return {
            status,
            planId,
            plan: {
                name: plan.name,
                price: plan.price,
                features: plan.features,
            },
            trialEndsAt: shopData.trialEndsAt,
            billingOn: shopData.billingOn,
            activatedAt: shopData.activatedAt,
        };

    } catch (error) {
        console.error('Get subscription status error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get available plans
 */
const getPlans = functions.https.onCall(async (data, context) => {
    return {
        plans: Object.entries(PLANS).map(([id, plan]) => ({
            id,
            ...plan,
        })),
    };
});

/**
 * Check if shop can use a feature based on plan
 */
const checkFeatureAccess = async (shopDomain, feature) => {
    const shopDoc = await db.collection('shops').doc(shopDomain).get();
    const shopData = shopDoc.data() || {};

    const status = shopData.subscriptionStatus || 'trial';
    const planId = shopData.subscriptionPlan || 'free';
    const plan = PLANS[planId] || PLANS.free;

    // Trial has full access
    if (status === 'trial') {
        const trialEndsAt = shopData.trialEndsAt?.toDate() || new Date();
        if (trialEndsAt > new Date()) {
            return { allowed: true, reason: 'trial' };
        }
    }

    // Check specific feature
    if (feature === 'adPlatforms') {
        return {
            allowed: plan.features.adPlatforms > 0,
            limit: plan.features.adPlatforms,
        };
    }

    if (feature === 'ordersPerMonth') {
        return {
            allowed: plan.features.ordersPerMonth === -1 || true,
            limit: plan.features.ordersPerMonth,
        };
    }

    return { allowed: status === 'active' };
};

module.exports = {
    createSubscription,
    billingCallback,
    cancelSubscription,
    getSubscriptionStatus,
    getPlans,
    checkFeatureAccess,
    PLANS,
};
