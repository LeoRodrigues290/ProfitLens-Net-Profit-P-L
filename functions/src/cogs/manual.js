/**
 * Manual COGS (Cost of Goods Sold) Management
 * CRUD operations for product costs
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
 * Set COGS for a product variant
 * Callable function from frontend
 */
const setCogs = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
        );
    }

    const shopDomain = context.auth.token.shop;
    if (!shopDomain) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Invalid shop context'
        );
    }

    const { variantId, productId, sku, cogs, productTitle } = data;

    // Validate inputs
    if (!variantId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Variant ID is required'
        );
    }

    if (!isPositiveNumber(cogs)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'COGS must be a positive number'
        );
    }

    try {
        await db
            .collection('productCosts')
            .doc(shopDomain)
            .collection('products')
            .doc(variantId.toString())
            .set({
                variantId,
                productId: productId || null,
                sku: sku || '',
                cogs: parseFloat(cogs),
                productTitle: productTitle || '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

        return {
            success: true,
            message: 'COGS updated successfully',
            variantId,
            cogs: parseFloat(cogs),
        };

    } catch (error) {
        console.error('Set COGS error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get COGS for a specific variant
 */
const getCogs = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { variantId } = data;

    if (!variantId) {
        throw new functions.https.HttpsError('invalid-argument', 'Variant ID is required');
    }

    try {
        const doc = await db
            .collection('productCosts')
            .doc(shopDomain)
            .collection('products')
            .doc(variantId.toString())
            .get();

        if (!doc.exists) {
            return { exists: false, cogs: 0 };
        }

        return {
            exists: true,
            ...doc.data(),
        };

    } catch (error) {
        console.error('Get COGS error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get all COGS for a shop
 */
const getAllCogs = functions.https.onCall(async (data, context) => {
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

        const products = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        return {
            success: true,
            count: products.length,
            products,
        };

    } catch (error) {
        console.error('Get all COGS error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Bulk set COGS for multiple variants
 */
const setBulkCogs = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { products } = data;

    if (!Array.isArray(products) || products.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Products array is required');
    }

    if (products.length > 500) {
        throw new functions.https.HttpsError('invalid-argument', 'Maximum 500 products per batch');
    }

    try {
        const batch = db.batch();
        let validCount = 0;

        for (const product of products) {
            if (!product.variantId || !isPositiveNumber(product.cogs)) {
                continue;
            }

            const docRef = db
                .collection('productCosts')
                .doc(shopDomain)
                .collection('products')
                .doc(product.variantId.toString());

            batch.set(docRef, {
                variantId: product.variantId,
                productId: product.productId || null,
                sku: product.sku || '',
                cogs: parseFloat(product.cogs),
                productTitle: product.productTitle || '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            validCount++;
        }

        await batch.commit();

        return {
            success: true,
            message: `Updated ${validCount} products`,
            count: validCount,
        };

    } catch (error) {
        console.error('Bulk set COGS error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Delete COGS for a variant
 */
const deleteCogs = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { variantId } = data;

    if (!variantId) {
        throw new functions.https.HttpsError('invalid-argument', 'Variant ID is required');
    }

    try {
        await db
            .collection('productCosts')
            .doc(shopDomain)
            .collection('products')
            .doc(variantId.toString())
            .delete();

        return {
            success: true,
            message: 'COGS deleted successfully',
            variantId,
        };

    } catch (error) {
        console.error('Delete COGS error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get COGS map for batch lookup (internal use)
 */
const getCogsMap = async (shopDomain, variantIds) => {
    const cogsMap = {};

    // Firestore 'in' query supports max 10 items, so we batch
    const batches = [];
    for (let i = 0; i < variantIds.length; i += 10) {
        batches.push(variantIds.slice(i, i + 10));
    }

    for (const batch of batches) {
        const snapshot = await db
            .collection('productCosts')
            .doc(shopDomain)
            .collection('products')
            .where(admin.firestore.FieldPath.documentId(), 'in', batch.map(String))
            .get();

        for (const doc of snapshot.docs) {
            cogsMap[doc.id] = doc.data().cogs || 0;
        }
    }

    return cogsMap;
};

module.exports = {
    setCogs,
    getCogs,
    getAllCogs,
    setBulkCogs,
    deleteCogs,
    getCogsMap,
};
