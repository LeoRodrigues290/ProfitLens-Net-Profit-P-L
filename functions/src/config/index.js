/**
 * CFO de Bolso - Cloud Functions Configuration
 * Centralized configuration management
 */

const functions = require('firebase-functions');

// Get config from Firebase Functions environment or .env
const getConfig = () => {
  // Firebase Functions config (production)
  const functionsConfig = functions.config();
  
  return {
    // Shopify Configuration
    shopify: {
      apiKey: functionsConfig.shopify?.api_key || process.env.SHOPIFY_API_KEY,
      apiSecret: functionsConfig.shopify?.api_secret || process.env.SHOPIFY_API_SECRET,
      scopes: 'read_orders,read_products,read_customers',
      apiVersion: '2024-01',
    },
    
    // App Configuration
    app: {
      url: functionsConfig.app?.url || process.env.APP_URL || 'https://cfo-de-bolso.web.app',
      name: 'CFO de Bolso',
    },
    
    // Security
    cron: {
      secret: functionsConfig.cron?.secret || process.env.CRON_SECRET,
    },
    
    // Gateway Fee Rates
    gatewayFees: {
      shopify_payments: { percentage: 0.029, fixed: 0.30 },
      stripe: { percentage: 0.029, fixed: 0.30 },
      paypal: { percentage: 0.0349, fixed: 0.49 },
      mercadopago: { percentage: 0.0499, fixed: 0.00 },
    },
    
    // Ad Platforms
    adPlatforms: {
      facebook: {
        appId: functionsConfig.facebook?.app_id || process.env.FACEBOOK_APP_ID,
        appSecret: functionsConfig.facebook?.app_secret || process.env.FACEBOOK_APP_SECRET,
        apiVersion: 'v18.0',
      },
      google: {
        clientId: functionsConfig.google?.client_id || process.env.GOOGLE_CLIENT_ID,
        clientSecret: functionsConfig.google?.client_secret || process.env.GOOGLE_CLIENT_SECRET,
      },
      tiktok: {
        appId: functionsConfig.tiktok?.app_id || process.env.TIKTOK_APP_ID,
        appSecret: functionsConfig.tiktok?.app_secret || process.env.TIKTOK_APP_SECRET,
      },
    },
  };
};

module.exports = { getConfig };
