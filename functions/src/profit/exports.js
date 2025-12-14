/**
 * Export functionality for reports
 * Generate CSV exports of profit data
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firestore if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Export profit report as CSV
 */
const exportProfitReport = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { startDate, endDate, format = 'csv' } = data;

    try {
        const snapshot = await db
            .collection('dailyMetrics')
            .doc(shopDomain)
            .collection('days')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .orderBy('date', 'asc')
            .get();

        const days = snapshot.docs.map(doc => doc.data());

        if (format === 'csv') {
            const csv = generateCsv(days);
            return {
                success: true,
                format: 'csv',
                content: csv,
                filename: `profit-report-${startDate}-to-${endDate}.csv`,
            };
        }

        // Return raw data for other formats
        return {
            success: true,
            format: 'json',
            data: days,
        };

    } catch (error) {
        console.error('Export error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Generate CSV string from data
 */
function generateCsv(days) {
    const headers = [
        'Date',
        'Revenue',
        'COGS',
        'Gross Profit',
        'Ad Spend',
        'Gateway Fees',
        'Fixed Costs',
        'Net Profit',
        'Profit Margin %',
        'Order Count',
    ];

    const rows = days.map(day => [
        day.date,
        day.revenue,
        day.cogs,
        day.grossProfit,
        day.adSpend,
        day.fees,
        day.fixedCosts,
        day.netProfit,
        day.profitMargin,
        day.orderCount,
    ]);

    // Add totals row
    const totals = calculateTotals(days);
    rows.push([
        'TOTAL',
        totals.revenue,
        totals.cogs,
        totals.grossProfit,
        totals.adSpend,
        totals.fees,
        totals.fixedCosts,
        totals.netProfit,
        totals.profitMargin,
        totals.orderCount,
    ]);

    // Convert to CSV string
    const csvRows = [headers.join(',')];
    for (const row of rows) {
        csvRows.push(row.map(escapeCSV).join(','));
    }

    return csvRows.join('\n');
}

/**
 * Calculate totals for summary row
 */
function calculateTotals(days) {
    const totals = {
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        adSpend: 0,
        fees: 0,
        fixedCosts: 0,
        netProfit: 0,
        orderCount: 0,
    };

    for (const day of days) {
        totals.revenue += parseFloat(day.revenue) || 0;
        totals.cogs += parseFloat(day.cogs) || 0;
        totals.grossProfit += parseFloat(day.grossProfit) || 0;
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
        revenue: totals.revenue.toFixed(2),
        cogs: totals.cogs.toFixed(2),
        grossProfit: totals.grossProfit.toFixed(2),
        adSpend: totals.adSpend.toFixed(2),
        fees: totals.fees.toFixed(2),
        fixedCosts: totals.fixedCosts.toFixed(2),
        netProfit: totals.netProfit.toFixed(2),
        profitMargin: profitMargin.toFixed(1),
        orderCount: totals.orderCount,
    };
}

/**
 * Escape CSV value
 */
function escapeCSV(value) {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Export COGS as CSV
 */
const exportCogs = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        const snapshot = await db
            .collection('productCosts')
            .doc(shopDomain)
            .collection('products')
            .orderBy('updatedAt', 'desc')
            .get();

        const products = snapshot.docs.map(doc => doc.data());

        const headers = ['SKU', 'Variant ID', 'Product Title', 'COGS'];
        const rows = products.map(p => [
            p.sku || '',
            p.variantId || '',
            p.productTitle || '',
            p.cogs || 0,
        ]);

        const csvRows = [headers.join(',')];
        for (const row of rows) {
            csvRows.push(row.map(escapeCSV).join(','));
        }

        return {
            success: true,
            format: 'csv',
            content: csvRows.join('\n'),
            filename: 'cogs-export.csv',
            count: products.length,
        };

    } catch (error) {
        console.error('Export COGS error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

module.exports = {
    exportProfitReport,
    exportCogs,
};
