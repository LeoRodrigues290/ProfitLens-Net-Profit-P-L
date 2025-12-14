/**
 * Gateway Fee Calculations
 * Calculate payment processor fees for orders
 */

const { getConfig } = require('../config');

/**
 * Get fee configuration for a gateway
 * @param {string} gateway - Gateway name
 * @returns {Object} - { percentage, fixed }
 */
const getGatewayFees = (gateway) => {
    const config = getConfig();
    const normalizedGateway = normalizeGatewayName(gateway);

    return config.gatewayFees[normalizedGateway] || { percentage: 0.029, fixed: 0.30 };
};

/**
 * Normalize gateway name from Shopify
 */
const normalizeGatewayName = (gateway) => {
    if (!gateway) return 'unknown';

    const lower = gateway.toLowerCase().replace(/[^a-z]/g, '');

    // Map known gateways
    const mappings = {
        'shopifypayments': 'shopify_payments',
        'shopify_payments': 'shopify_payments',
        'stripe': 'stripe',
        'paypal': 'paypal',
        'paypalexpress': 'paypal',
        'paypalcommerce': 'paypal',
        'mercadopago': 'mercadopago',
        'mercadopagobasic': 'mercadopago',
    };

    return mappings[lower] || 'shopify_payments';
};

/**
 * Calculate fee for a single order
 * @param {number} orderTotal - Order total amount
 * @param {string} gateway - Payment gateway used
 * @returns {number} - Calculated fee
 */
const calculateOrderFee = (orderTotal, gateway) => {
    const { percentage, fixed } = getGatewayFees(gateway);
    const fee = (orderTotal * percentage) + fixed;
    return parseFloat(fee.toFixed(2));
};

/**
 * Calculate total fees for an array of orders
 * @param {Array} orders - Array of orders
 * @returns {Object} - { totalFees, breakdown }
 */
const calculateTotalFees = (orders) => {
    const breakdown = {};
    let totalFees = 0;

    for (const order of orders) {
        const gateway = order.gateway || order.payment_gateway_names?.[0] || 'shopify_payments';
        const orderTotal = parseFloat(order.total_price) || 0;
        const fee = calculateOrderFee(orderTotal, gateway);

        const normalizedGateway = normalizeGatewayName(gateway);

        if (!breakdown[normalizedGateway]) {
            breakdown[normalizedGateway] = {
                count: 0,
                orderTotal: 0,
                fees: 0,
            };
        }

        breakdown[normalizedGateway].count++;
        breakdown[normalizedGateway].orderTotal += orderTotal;
        breakdown[normalizedGateway].fees += fee;

        totalFees += fee;
    }

    // Round breakdown values
    for (const gateway in breakdown) {
        breakdown[gateway].orderTotal = parseFloat(breakdown[gateway].orderTotal.toFixed(2));
        breakdown[gateway].fees = parseFloat(breakdown[gateway].fees.toFixed(2));
    }

    return {
        totalFees: parseFloat(totalFees.toFixed(2)),
        breakdown,
    };
};

/**
 * Estimate fees for a given amount
 * @param {number} amount - Amount to calculate fees for
 * @param {string} gateway - Payment gateway
 * @returns {Object} - { amount, fee, net }
 */
const estimateFees = (amount, gateway = 'shopify_payments') => {
    const fee = calculateOrderFee(amount, gateway);
    return {
        amount: parseFloat(amount.toFixed(2)),
        fee,
        net: parseFloat((amount - fee).toFixed(2)),
    };
};

/**
 * Get fee rates for display
 * @returns {Object} - Gateway fee rates
 */
const getFeeRates = () => {
    const config = getConfig();

    const rates = {};
    for (const [gateway, fees] of Object.entries(config.gatewayFees)) {
        rates[gateway] = {
            percentage: `${(fees.percentage * 100).toFixed(1)}%`,
            fixed: `$${fees.fixed.toFixed(2)}`,
            formula: `${(fees.percentage * 100).toFixed(1)}% + $${fees.fixed.toFixed(2)}`,
        };
    }

    return rates;
};

module.exports = {
    getGatewayFees,
    normalizeGatewayName,
    calculateOrderFee,
    calculateTotalFees,
    estimateFees,
    getFeeRates,
};
