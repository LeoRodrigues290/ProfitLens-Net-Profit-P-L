/**
 * CSV Import for COGS
 * Parse and import product costs from CSV files
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { parse } = require('csv-parse/sync');
const { isPositiveNumber } = require('../utils/validators');

// Initialize Firestore if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * Expected CSV format:
 * sku,cogs,product_title (optional)
 * OR
 * variant_id,cogs,product_title (optional)
 */

/**
 * Import COGS from CSV content
 * Callable function from frontend
 */
const importFromCsv = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const shopDomain = context.auth.token.shop;
    const { csvContent, mapping } = data;

    if (!csvContent) {
        throw new functions.https.HttpsError('invalid-argument', 'CSV content is required');
    }

    try {
        // Parse CSV
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
        });

        if (records.length === 0) {
            throw new functions.https.HttpsError('invalid-argument', 'CSV is empty');
        }

        if (records.length > 5000) {
            throw new functions.https.HttpsError('invalid-argument', 'Maximum 5000 rows per import');
        }

        // Detect column mapping
        const columnMapping = mapping || detectColumnMapping(Object.keys(records[0]));

        const results = {
            total: records.length,
            success: 0,
            skipped: 0,
            errors: [],
        };

        // Process in batches of 500
        const batches = [];
        for (let i = 0; i < records.length; i += 500) {
            batches.push(records.slice(i, i + 500));
        }

        for (const batch of batches) {
            const firestoreBatch = db.batch();
            let batchCount = 0;

            for (let i = 0; i < batch.length; i++) {
                const record = batch[i];
                const rowIndex = i + 1;

                try {
                    const identifier = getIdentifier(record, columnMapping);
                    const cogs = getCogs(record, columnMapping);
                    const productTitle = record[columnMapping.productTitle] || '';

                    if (!identifier) {
                        results.skipped++;
                        results.errors.push({
                            row: rowIndex,
                            error: 'Missing SKU or Variant ID',
                        });
                        continue;
                    }

                    if (!isPositiveNumber(cogs)) {
                        results.skipped++;
                        results.errors.push({
                            row: rowIndex,
                            error: 'Invalid COGS value',
                        });
                        continue;
                    }

                    // Use variant_id if available, otherwise use sku as identifier
                    const docId = columnMapping.variantId && record[columnMapping.variantId]
                        ? record[columnMapping.variantId].toString()
                        : `sku:${record[columnMapping.sku]}`;

                    const docRef = db
                        .collection('productCosts')
                        .doc(shopDomain)
                        .collection('products')
                        .doc(docId);

                    firestoreBatch.set(docRef, {
                        sku: record[columnMapping.sku] || '',
                        variantId: record[columnMapping.variantId] || null,
                        cogs,
                        productTitle,
                        importedAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });

                    batchCount++;

                } catch (error) {
                    results.skipped++;
                    results.errors.push({
                        row: rowIndex,
                        error: error.message,
                    });
                }
            }

            if (batchCount > 0) {
                await firestoreBatch.commit();
                results.success += batchCount;
            }
        }

        return {
            success: true,
            message: `Imported ${results.success} of ${results.total} products`,
            results,
        };

    } catch (error) {
        console.error('CSV import error:', error);

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError('internal', `Import failed: ${error.message}`);
    }
});

/**
 * Detect column mapping from CSV headers
 */
function detectColumnMapping(headers) {
    const mapping = {
        sku: null,
        variantId: null,
        cogs: null,
        productTitle: null,
    };

    const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    for (let i = 0; i < headers.length; i++) {
        const lower = lowerHeaders[i];
        const original = headers[i];

        if (['sku', 'productsku', 'variantsku'].includes(lower)) {
            mapping.sku = original;
        } else if (['variantid', 'variant_id', 'id'].includes(lower)) {
            mapping.variantId = original;
        } else if (['cogs', 'cost', 'costprice', 'productcost', 'unitcost'].includes(lower)) {
            mapping.cogs = original;
        } else if (['title', 'producttitle', 'name', 'productname'].includes(lower)) {
            mapping.productTitle = original;
        }
    }

    return mapping;
}

/**
 * Get identifier from record
 */
function getIdentifier(record, mapping) {
    if (mapping.variantId && record[mapping.variantId]) {
        return record[mapping.variantId];
    }
    if (mapping.sku && record[mapping.sku]) {
        return record[mapping.sku];
    }
    return null;
}

/**
 * Get COGS value from record
 */
function getCogs(record, mapping) {
    if (!mapping.cogs || !record[mapping.cogs]) {
        return null;
    }

    const value = record[mapping.cogs]
        .replace(/[^0-9.,]/g, '')
        .replace(',', '.');

    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Validate CSV structure before import
 */
const validateCsv = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { csvContent } = data;

    if (!csvContent) {
        throw new functions.https.HttpsError('invalid-argument', 'CSV content is required');
    }

    try {
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            to: 5, // Parse only first 5 rows for validation
        });

        if (records.length === 0) {
            return {
                valid: false,
                message: 'CSV is empty or has no valid rows',
            };
        }

        const headers = Object.keys(records[0]);
        const mapping = detectColumnMapping(headers);

        const hasIdentifier = mapping.sku || mapping.variantId;
        const hasCogs = mapping.cogs;

        if (!hasIdentifier) {
            return {
                valid: false,
                message: 'CSV must have a SKU or Variant ID column',
                headers,
            };
        }

        if (!hasCogs) {
            return {
                valid: false,
                message: 'CSV must have a COGS/Cost column',
                headers,
            };
        }

        return {
            valid: true,
            message: 'CSV structure is valid',
            headers,
            mapping,
            preview: records.slice(0, 3),
        };

    } catch (error) {
        return {
            valid: false,
            message: `Parse error: ${error.message}`,
        };
    }
});

module.exports = {
    importFromCsv,
    validateCsv,
};
