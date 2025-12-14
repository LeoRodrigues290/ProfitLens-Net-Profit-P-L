/**
 * CFO de Bolso - Cloud Functions Entry Point
 * Exports all Cloud Functions for Firebase deployment
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

// ============================================
// SHOPIFY AUTHENTICATION
// ============================================
const shopifyAuth = require('./shopify/auth');
exports.install = shopifyAuth.install;
exports.callback = shopifyAuth.callback;

// ============================================
// SHOPIFY WEBHOOKS (GDPR)
// ============================================
const shopifyWebhooks = require('./shopify/webhooks');
exports.webhooksCustomersDataRequest = shopifyWebhooks.customersDataRequest;
exports.webhooksCustomersRedact = shopifyWebhooks.customersRedact;
exports.webhooksShopRedact = shopifyWebhooks.shopRedact;
exports.webhooksAppUninstalled = shopifyWebhooks.appUninstalled;

// ============================================
// COGS MANAGEMENT
// ============================================
const cogsManual = require('./cogs/manual');
exports.setCogs = cogsManual.setCogs;
exports.getCogs = cogsManual.getCogs;
exports.getAllCogs = cogsManual.getAllCogs;
exports.setBulkCogs = cogsManual.setBulkCogs;
exports.deleteCogs = cogsManual.deleteCogs;

const cogsCsv = require('./cogs/csvImport');
exports.importCogsFromCsv = cogsCsv.importFromCsv;
exports.validateCogsCsv = cogsCsv.validateCsv;

// ============================================
// FIXED COSTS
// ============================================
const fixedCosts = require('./costs/fixedCosts');
exports.addFixedCost = fixedCosts.addFixedCost;
exports.getFixedCosts = fixedCosts.getFixedCosts;
exports.updateFixedCost = fixedCosts.updateFixedCost;
exports.deleteFixedCost = fixedCosts.deleteFixedCost;

// ============================================
// PROFIT CALCULATION
// ============================================
const profitCalculator = require('./profit/calculator');
exports.calculateProfit = profitCalculator.calculateProfit;
exports.calculateProfitRange = profitCalculator.calculateProfitRange;
exports.getDashboardSummary = profitCalculator.getDashboardSummary;

const profitExports = require('./profit/exports');
exports.exportProfitReport = profitExports.exportProfitReport;
exports.exportCogs = profitExports.exportCogs;

// ============================================
// AD PLATFORMS
// ============================================

// Facebook Ads
const facebookAds = require('./ads/facebook');
exports.connectFacebook = facebookAds.connectFacebook;
exports.facebookCallback = facebookAds.facebookCallback;
exports.syncFacebookAds = facebookAds.syncFacebookAds;
exports.disconnectFacebook = facebookAds.disconnectFacebook;
exports.getFacebookStatus = facebookAds.getFacebookStatus;

// Google Ads
const googleAds = require('./ads/google');
exports.connectGoogle = googleAds.connectGoogle;
exports.googleCallback = googleAds.googleCallback;
exports.syncGoogleAds = googleAds.syncGoogleAds;
exports.disconnectGoogle = googleAds.disconnectGoogle;
exports.getGoogleStatus = googleAds.getGoogleStatus;

// TikTok Ads
const tiktokAds = require('./ads/tiktok');
exports.connectTikTok = tiktokAds.connectTikTok;
exports.tiktokCallback = tiktokAds.tiktokCallback;
exports.syncTikTokAds = tiktokAds.syncTikTokAds;
exports.disconnectTikTok = tiktokAds.disconnectTikTok;
exports.getTikTokStatus = tiktokAds.getTikTokStatus;

// ============================================
// BILLING & SUBSCRIPTIONS
// ============================================
const billing = require('./billing/subscription');
exports.createSubscription = billing.createSubscription;
exports.billingCallback = billing.billingCallback;
exports.cancelSubscription = billing.cancelSubscription;
exports.getSubscriptionStatus = billing.getSubscriptionStatus;
exports.getPlans = billing.getPlans;

// ============================================
// HEALTH CHECK
// ============================================
const functions = require('firebase-functions');

exports.health = functions.https.onRequest((req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});
