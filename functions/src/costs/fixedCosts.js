/**
 * Fixed Costs Management
 * Monthly recurring costs for profit calculation
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { isPositiveNumber } = require('../utils/validators');

// Initialize Firestore if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Add a fixed cost
 */
const addFixedCost = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { description, amount, frequency = 'monthly', category } = data;

    if (!description || typeof description !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Description is required');
    }

    if (!isPositiveNumber(amount)) {
        throw new functions.https.HttpsError('invalid-argument', 'Amount must be a positive number');
    }

    const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validFrequencies.includes(frequency)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid frequency');
    }

    try {
        const docRef = await db
            .collection('fixedCosts')
            .doc(shopDomain)
            .collection('costs')
            .add({
                description,
                amount: parseFloat(amount),
                frequency,
                category: category || 'other',
                active: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        return {
            success: true,
            id: docRef.id,
            message: 'Fixed cost added successfully',
        };

    } catch (error) {
        console.error('Add fixed cost error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get all fixed costs for a shop
 */
const getFixedCosts = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;

    try {
        const snapshot = await db
            .collection('fixedCosts')
            .doc(shopDomain)
            .collection('costs')
            .where('active', '==', true)
            .orderBy('createdAt', 'desc')
            .get();

        const costs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        // Calculate totals
        const totals = calculateTotals(costs);

        return {
            success: true,
            costs,
            totals,
        };

    } catch (error) {
        console.error('Get fixed costs error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Update a fixed cost
 */
const updateFixedCost = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { id, description, amount, frequency, category, active } = data;

    if (!id) {
        throw new functions.https.HttpsError('invalid-argument', 'Cost ID is required');
    }

    const updates = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (description !== undefined) updates.description = description;
    if (amount !== undefined) updates.amount = parseFloat(amount);
    if (frequency !== undefined) updates.frequency = frequency;
    if (category !== undefined) updates.category = category;
    if (active !== undefined) updates.active = active;

    try {
        await db
            .collection('fixedCosts')
            .doc(shopDomain)
            .collection('costs')
            .doc(id)
            .update(updates);

        return {
            success: true,
            message: 'Fixed cost updated successfully',
        };

    } catch (error) {
        console.error('Update fixed cost error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Delete (deactivate) a fixed cost
 */
const deleteFixedCost = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { id, permanent = false } = data;

    if (!id) {
        throw new functions.https.HttpsError('invalid-argument', 'Cost ID is required');
    }

    try {
        const docRef = db
            .collection('fixedCosts')
            .doc(shopDomain)
            .collection('costs')
            .doc(id);

        if (permanent) {
            await docRef.delete();
        } else {
            await docRef.update({
                active: false,
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return {
            success: true,
            message: 'Fixed cost deleted successfully',
        };

    } catch (error) {
        console.error('Delete fixed cost error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Calculate totals from costs array
 */
function calculateTotals(costs) {
    const totals = {
        daily: 0,
        monthly: 0,
        yearly: 0,
    };

    for (const cost of costs) {
        if (!cost.active) continue;

        const amount = cost.amount || 0;

        switch (cost.frequency) {
            case 'daily':
                totals.daily += amount;
                totals.monthly += amount * 30;
                totals.yearly += amount * 365;
                break;
            case 'weekly':
                totals.daily += amount / 7;
                totals.monthly += amount * 4.33;
                totals.yearly += amount * 52;
                break;
            case 'monthly':
                totals.daily += amount / 30;
                totals.monthly += amount;
                totals.yearly += amount * 12;
                break;
            case 'yearly':
                totals.daily += amount / 365;
                totals.monthly += amount / 12;
                totals.yearly += amount;
                break;
        }
    }

    return {
        daily: parseFloat(totals.daily.toFixed(2)),
        monthly: parseFloat(totals.monthly.toFixed(2)),
        yearly: parseFloat(totals.yearly.toFixed(2)),
    };
}

/**
 * Get daily fixed cost amount (for profit calculation)
 */
const getDailyFixedCost = async (shopDomain) => {
    const snapshot = await db
        .collection('fixedCosts')
        .doc(shopDomain)
        .collection('costs')
        .where('active', '==', true)
        .get();

    const costs = snapshot.docs.map(doc => doc.data());
    const totals = calculateTotals(costs);

    return totals.daily;
};

module.exports = {
    addFixedCost,
    getFixedCosts,
    updateFixedCost,
    deleteFixedCost,
    getDailyFixedCost,
};
