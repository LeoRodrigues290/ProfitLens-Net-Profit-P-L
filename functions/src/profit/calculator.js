/**
 * Profit Calculator
 * Main engine that combines all cost sources to calculate net profit
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { verifyShop } = require('../shopify/auth');
const { fetchOrdersForDate, extractLineItems, calculateOrderMetrics } = require('../shopify/orders');
const { getCogsMap } = require('../cogs/manual');
const { getDailyFixedCost } = require('../costs/fixedCosts');
const { calculateTotalFees } = require('../costs/gatewayFees');
const { isValidDate } = require('../utils/validators');

// Initialize Firestore if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Calculate profit for a specific date
 * Main callable function from frontend
 */
const calculateProfit = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { date } = data;

    // Default to today if no date provided
    const targetDate = date || new Date().toISOString().split('T')[0];

    if (!isValidDate(targetDate)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid date format. Use YYYY-MM-DD');
    }

    try {
        // Verify shop and get access token
        const shopData = await verifyShop(shopDomain);
        if (!shopData) {
            throw new functions.https.HttpsError('not-found', 'Shop not found or not authenticated');
        }

        // 1. Fetch orders for the date
        const orders = await fetchOrdersForDate(shopDomain, shopData.accessToken, targetDate);
        const orderMetrics = calculateOrderMetrics(orders);

        // 2. Calculate COGS
        const lineItems = extractLineItems(orders);
        const variantIds = [...new Set(lineItems.map(i => i.variantId).filter(Boolean))];
        const cogsMap = await getCogsMap(shopDomain, variantIds);

        let totalCogs = 0;
        let cogsMatchedItems = 0;
        let cogsMissingItems = 0;

        for (const item of lineItems) {
            const itemCogs = cogsMap[item.variantId?.toString()] || 0;
            if (itemCogs > 0) {
                totalCogs += itemCogs * item.quantity;
                cogsMatchedItems++;
            } else {
                cogsMissingItems++;
            }
        }

        // 3. Get ad spend
        const adSpendSnapshot = await db
            .collection('adSpend')
            .doc(shopDomain)
            .collection('daily')
            .where('date', '==', targetDate)
            .get();

        const adSpendByPlatform = {};
        let totalAdSpend = 0;

        for (const doc of adSpendSnapshot.docs) {
            const data = doc.data();
            adSpendByPlatform[data.platform] = data.spend;
            totalAdSpend += data.spend || 0;
        }

        // 4. Calculate gateway fees
        const { totalFees, breakdown: feeBreakdown } = calculateTotalFees(orders);

        // 5. Get daily fixed costs
        const dailyFixedCosts = await getDailyFixedCost(shopDomain);

        // 6. Calculate profit
        const revenue = parseFloat(orderMetrics.totalRevenue);
        const grossProfit = revenue - totalCogs;
        const netProfit = grossProfit - totalAdSpend - totalFees - dailyFixedCosts;
        const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

        // 7. Prepare result
        const result = {
            date: targetDate,
            currency: shopData.currency || 'USD',

            // Revenue
            revenue: revenue.toFixed(2),
            orderCount: orders.length,
            itemsSold: orderMetrics.itemsSold,
            averageOrderValue: orderMetrics.averageOrderValue,

            // Costs
            cogs: totalCogs.toFixed(2),
            cogsMatchRate: lineItems.length > 0
                ? ((cogsMatchedItems / lineItems.length) * 100).toFixed(1)
                : '100',
            adSpend: totalAdSpend.toFixed(2),
            adSpendByPlatform,
            fees: totalFees.toFixed(2),
            feeBreakdown,
            fixedCosts: dailyFixedCosts.toFixed(2),

            // Profit
            grossProfit: grossProfit.toFixed(2),
            grossMargin: grossMargin.toFixed(1),
            netProfit: netProfit.toFixed(2),
            profitMargin: profitMargin.toFixed(1),

            // Status
            isProfitable: netProfit >= 0,
            alerts: generateAlerts({
                cogsMissingItems,
                cogsMatchedItems,
                lineItems: lineItems.length,
                profitMargin,
                adSpend: totalAdSpend,
                revenue,
            }),
        };

        // 8. Cache the result in dailyMetrics
        await db
            .collection('dailyMetrics')
            .doc(shopDomain)
            .collection('days')
            .doc(targetDate)
            .set({
                ...result,
                calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

        return result;

    } catch (error) {
        console.error('Profit calculation error:', error);
        throw new functions.https.HttpsError('internal', `Calculation failed: ${error.message}`);
    }
});

/**
 * Calculate profit for a date range
 */
const calculateProfitRange = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { startDate, endDate } = data;

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid date format');
    }

    try {
        // Fetch cached results from dailyMetrics
        const snapshot = await db
            .collection('dailyMetrics')
            .doc(shopDomain)
            .collection('days')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .orderBy('date', 'asc')
            .get();

        const days = snapshot.docs.map(doc => doc.data());

        // Calculate aggregates
        const totals = {
            revenue: 0,
            cogs: 0,
            adSpend: 0,
            fees: 0,
            fixedCosts: 0,
            netProfit: 0,
            orderCount: 0,
        };

        for (const day of days) {
            totals.revenue += parseFloat(day.revenue) || 0;
            totals.cogs += parseFloat(day.cogs) || 0;
            totals.adSpend += parseFloat(day.adSpend) || 0;
            totals.fees += parseFloat(day.fees) || 0;
            totals.fixedCosts += parseFloat(day.fixedCosts) || 0;
            totals.netProfit += parseFloat(day.netProfit) || 0;
            totals.orderCount += day.orderCount || 0;
        }

        const profitMargin = totals.revenue > 0
            ? (totals.netProfit / totals.revenue) * 100
            : 0;

        return {
            startDate,
            endDate,
            daysCount: days.length,
            days,
            totals: {
                revenue: totals.revenue.toFixed(2),
                cogs: totals.cogs.toFixed(2),
                adSpend: totals.adSpend.toFixed(2),
                fees: totals.fees.toFixed(2),
                fixedCosts: totals.fixedCosts.toFixed(2),
                netProfit: totals.netProfit.toFixed(2),
                profitMargin: profitMargin.toFixed(1),
                orderCount: totals.orderCount,
                isProfitable: totals.netProfit >= 0,
            },
        };

    } catch (error) {
        console.error('Profit range calculation error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Generate alerts based on metrics
 */
function generateAlerts(metrics) {
    const alerts = [];

    // COGS coverage alert
    if (metrics.lineItems > 0) {
        const coverage = (metrics.cogsMatchedItems / metrics.lineItems) * 100;
        if (coverage < 50) {
            alerts.push({
                type: 'warning',
                message: `Only ${coverage.toFixed(0)}% of products have COGS configured`,
                action: 'Add product costs for accurate profit calculation',
            });
        }
    }

    // Negative profit alert
    if (metrics.profitMargin < 0) {
        alerts.push({
            type: 'error',
            message: 'You are losing money today',
            action: 'Review your costs and pricing strategy',
        });
    }

    // High ad spend alert
    if (metrics.revenue > 0) {
        const adRatio = (metrics.adSpend / metrics.revenue) * 100;
        if (adRatio > 30) {
            alerts.push({
                type: 'warning',
                message: `Ad spend is ${adRatio.toFixed(0)}% of revenue`,
                action: 'Consider optimizing your ad campaigns',
            });
        }
    }

    // Low margin alert
    if (metrics.profitMargin > 0 && metrics.profitMargin < 10) {
        alerts.push({
            type: 'info',
            message: 'Profit margin is below 10%',
            action: 'Consider increasing prices or reducing costs',
        });
    }

    return alerts;
}

/**
 * Get dashboard summary (today + this week + this month)
 */
const getDashboardSummary = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        const today = new Date().toISOString().split('T')[0];

        // Get today's metrics (calculate fresh)
        const todayResult = await calculateProfitInternal(shopDomain, today);

        // Get week dates
        const weekStart = getWeekStart(new Date());
        const weekSnapshot = await db
            .collection('dailyMetrics')
            .doc(shopDomain)
            .collection('days')
            .where('date', '>=', weekStart)
            .where('date', '<=', today)
            .get();

        const weekData = aggregateDays(weekSnapshot.docs.map(d => d.data()));

        // Get month dates
        const monthStart = getMonthStart(new Date());
        const monthSnapshot = await db
            .collection('dailyMetrics')
            .doc(shopDomain)
            .collection('days')
            .where('date', '>=', monthStart)
            .where('date', '<=', today)
            .get();

        const monthData = aggregateDays(monthSnapshot.docs.map(d => d.data()));

        return {
            today: todayResult,
            thisWeek: weekData,
            thisMonth: monthData,
        };

    } catch (error) {
        console.error('Dashboard summary error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Internal profit calculation (without auth check for internal use)
 */
async function calculateProfitInternal(shopDomain, date) {
    // This is a simplified version for internal calls
    const cached = await db
        .collection('dailyMetrics')
        .doc(shopDomain)
        .collection('days')
        .doc(date)
        .get();

    if (cached.exists) {
        return cached.data();
    }

    // If not cached, return empty result
    return {
        date,
        revenue: '0.00',
        netProfit: '0.00',
        profitMargin: '0.0',
        orderCount: 0,
    };
}

/**
 * Aggregate multiple days of data
 */
function aggregateDays(days) {
    const totals = {
        revenue: 0,
        cogs: 0,
        adSpend: 0,
        fees: 0,
        fixedCosts: 0,
        netProfit: 0,
        orderCount: 0,
    };

    for (const day of days) {
        totals.revenue += parseFloat(day.revenue) || 0;
        totals.cogs += parseFloat(day.cogs) || 0;
        totals.adSpend += parseFloat(day.adSpend) || 0;
        totals.fees += parseFloat(day.fees) || 0;
        totals.fixedCosts += parseFloat(day.fixedCosts) || 0;
        totals.netProfit += parseFloat(day.netProfit) || 0;
        totals.orderCount += day.orderCount || 0;
    }

    const profitMargin = totals.revenue > 0
        ? (totals.netProfit / totals.revenue) * 100
        : 0;

    return {
        daysCount: days.length,
        revenue: totals.revenue.toFixed(2),
        cogs: totals.cogs.toFixed(2),
        adSpend: totals.adSpend.toFixed(2),
        fees: totals.fees.toFixed(2),
        fixedCosts: totals.fixedCosts.toFixed(2),
        netProfit: totals.netProfit.toFixed(2),
        profitMargin: profitMargin.toFixed(1),
        orderCount: totals.orderCount,
        isProfitable: totals.netProfit >= 0,
    };
}

/**
 * Date helpers
 */
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
}

function getMonthStart(date) {
    const d = new Date(date);
    d.setDate(1);
    return d.toISOString().split('T')[0];
}

module.exports = {
    calculateProfit,
    calculateProfitRange,
    getDashboardSummary,
};
