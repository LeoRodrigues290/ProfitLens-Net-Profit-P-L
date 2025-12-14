/**
 * Shopify Orders API Integration
 * Fetches and processes orders for profit calculation
 */

const axios = require('axios');
const { getConfig } = require('../config');
const { verifyShop, getShopifyHeaders } = require('./auth');

/**
 * Fetch orders from Shopify for a specific date range
 * @param {string} shopDomain - Shop domain
 * @param {string} accessToken - Decrypted access token
 * @param {Object} options - Query options
 * @returns {Array} - Orders array
 */
const fetchOrders = async (shopDomain, accessToken, options = {}) => {
    const config = getConfig();
    const {
        startDate,
        endDate,
        status = 'any',
        limit = 250,
        financialStatus = 'paid',
    } = options;

    const allOrders = [];
    let pageInfo = null;
    let hasNextPage = true;

    try {
        while (hasNextPage) {
            const params = new URLSearchParams();
            params.set('status', status);
            params.set('limit', limit.toString());
            params.set('financial_status', financialStatus);

            if (startDate) {
                params.set('created_at_min', new Date(startDate).toISOString());
            }
            if (endDate) {
                params.set('created_at_max', new Date(endDate + 'T23:59:59').toISOString());
            }
            if (pageInfo) {
                params.set('page_info', pageInfo);
            }

            const url = `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/orders.json?${params.toString()}`;

            const response = await axios.get(url, {
                headers: getShopifyHeaders(accessToken),
            });

            const orders = response.data.orders || [];
            allOrders.push(...orders);

            // Check for pagination
            const linkHeader = response.headers['link'];
            if (linkHeader && linkHeader.includes('rel="next"')) {
                const match = linkHeader.match(/page_info=([^>&]*)/);
                pageInfo = match ? match[1] : null;
                hasNextPage = !!pageInfo;
            } else {
                hasNextPage = false;
            }
        }

        return allOrders;

    } catch (error) {
        console.error('Fetch orders error:', error.response?.data || error.message);
        throw new Error(`Failed to fetch orders: ${error.message}`);
    }
};

/**
 * Fetch orders for a specific date
 * @param {string} shopDomain - Shop domain
 * @param {string} accessToken - Decrypted access token
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Array} - Orders array
 */
const fetchOrdersForDate = async (shopDomain, accessToken, date) => {
    return fetchOrders(shopDomain, accessToken, {
        startDate: date,
        endDate: date,
    });
};

/**
 * Fetch orders count for a date range
 * @param {string} shopDomain - Shop domain
 * @param {string} accessToken - Decrypted access token
 * @param {Object} options - Query options
 * @returns {number} - Order count
 */
const fetchOrdersCount = async (shopDomain, accessToken, options = {}) => {
    const config = getConfig();
    const { startDate, endDate, status = 'any' } = options;

    try {
        const params = new URLSearchParams();
        params.set('status', status);

        if (startDate) {
            params.set('created_at_min', new Date(startDate).toISOString());
        }
        if (endDate) {
            params.set('created_at_max', new Date(endDate + 'T23:59:59').toISOString());
        }

        const url = `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/orders/count.json?${params.toString()}`;

        const response = await axios.get(url, {
            headers: getShopifyHeaders(accessToken),
        });

        return response.data.count || 0;

    } catch (error) {
        console.error('Fetch orders count error:', error.response?.data || error.message);
        throw new Error(`Failed to fetch orders count: ${error.message}`);
    }
};

/**
 * Calculate order metrics
 * @param {Array} orders - Orders array
 * @returns {Object} - Calculated metrics
 */
const calculateOrderMetrics = (orders) => {
    let totalRevenue = 0;
    let totalTax = 0;
    let totalShipping = 0;
    let totalDiscounts = 0;
    let itemsSold = 0;

    for (const order of orders) {
        totalRevenue += parseFloat(order.total_price) || 0;
        totalTax += parseFloat(order.total_tax) || 0;
        totalShipping += parseFloat(order.total_shipping_price_set?.shop_money?.amount) || 0;
        totalDiscounts += parseFloat(order.total_discounts) || 0;

        for (const item of order.line_items || []) {
            itemsSold += item.quantity || 0;
        }
    }

    return {
        orderCount: orders.length,
        totalRevenue: totalRevenue.toFixed(2),
        totalTax: totalTax.toFixed(2),
        totalShipping: totalShipping.toFixed(2),
        totalDiscounts: totalDiscounts.toFixed(2),
        itemsSold,
        averageOrderValue: orders.length > 0
            ? (totalRevenue / orders.length).toFixed(2)
            : '0.00',
    };
};

/**
 * Extract line items from orders with variant IDs
 * @param {Array} orders - Orders array
 * @returns {Array} - Line items with quantity
 */
const extractLineItems = (orders) => {
    const items = [];

    for (const order of orders) {
        for (const item of order.line_items || []) {
            items.push({
                orderId: order.id,
                variantId: item.variant_id,
                productId: item.product_id,
                sku: item.sku,
                title: item.title,
                quantity: item.quantity,
                price: parseFloat(item.price) || 0,
                totalPrice: (parseFloat(item.price) || 0) * (item.quantity || 1),
            });
        }
    }

    return items;
};

/**
 * Extract payment gateway from orders
 * @param {Array} orders - Orders array
 * @returns {Object} - Gateway breakdown { gateway: amount }
 */
const extractGatewayBreakdown = (orders) => {
    const breakdown = {};

    for (const order of orders) {
        const gateway = order.gateway || order.payment_gateway_names?.[0] || 'unknown';
        const amount = parseFloat(order.total_price) || 0;

        if (!breakdown[gateway]) {
            breakdown[gateway] = { count: 0, total: 0 };
        }

        breakdown[gateway].count++;
        breakdown[gateway].total += amount;
    }

    return breakdown;
};

module.exports = {
    fetchOrders,
    fetchOrdersForDate,
    fetchOrdersCount,
    calculateOrderMetrics,
    extractLineItems,
    extractGatewayBreakdown,
};
