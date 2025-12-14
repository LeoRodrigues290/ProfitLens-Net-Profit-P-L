/**
 * Shopify Products API Integration
 * Fetches products and variants for COGS matching
 */

const axios = require('axios');
const { getConfig } = require('../config');
const { getShopifyHeaders } = require('./auth');

/**
 * Fetch all products from Shopify
 * @param {string} shopDomain - Shop domain
 * @param {string} accessToken - Decrypted access token
 * @param {Object} options - Query options
 * @returns {Array} - Products array
 */
const fetchProducts = async (shopDomain, accessToken, options = {}) => {
    const config = getConfig();
    const { limit = 250, fields = 'id,title,variants,images' } = options;

    const allProducts = [];
    let pageInfo = null;
    let hasNextPage = true;

    try {
        while (hasNextPage) {
            const params = new URLSearchParams();
            params.set('limit', limit.toString());
            params.set('fields', fields);

            if (pageInfo) {
                params.set('page_info', pageInfo);
            }

            const url = `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/products.json?${params.toString()}`;

            const response = await axios.get(url, {
                headers: getShopifyHeaders(accessToken),
            });

            const products = response.data.products || [];
            allProducts.push(...products);

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

        return allProducts;

    } catch (error) {
        console.error('Fetch products error:', error.response?.data || error.message);
        throw new Error(`Failed to fetch products: ${error.message}`);
    }
};

/**
 * Fetch a single product by ID
 * @param {string} shopDomain - Shop domain
 * @param {string} accessToken - Decrypted access token
 * @param {string} productId - Product ID
 * @returns {Object} - Product object
 */
const fetchProduct = async (shopDomain, accessToken, productId) => {
    const config = getConfig();

    try {
        const url = `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/products/${productId}.json`;

        const response = await axios.get(url, {
            headers: getShopifyHeaders(accessToken),
        });

        return response.data.product;

    } catch (error) {
        console.error('Fetch product error:', error.response?.data || error.message);
        throw new Error(`Failed to fetch product: ${error.message}`);
    }
};

/**
 * Fetch product count
 * @param {string} shopDomain - Shop domain
 * @param {string} accessToken - Decrypted access token
 * @returns {number} - Product count
 */
const fetchProductCount = async (shopDomain, accessToken) => {
    const config = getConfig();

    try {
        const url = `https://${shopDomain}/admin/api/${config.shopify.apiVersion}/products/count.json`;

        const response = await axios.get(url, {
            headers: getShopifyHeaders(accessToken),
        });

        return response.data.count || 0;

    } catch (error) {
        console.error('Fetch product count error:', error.response?.data || error.message);
        throw new Error(`Failed to fetch product count: ${error.message}`);
    }
};

/**
 * Extract all variants from products with their details
 * @param {Array} products - Products array
 * @returns {Array} - Variants with product info
 */
const extractVariants = (products) => {
    const variants = [];

    for (const product of products) {
        for (const variant of product.variants || []) {
            variants.push({
                variantId: variant.id,
                productId: product.id,
                productTitle: product.title,
                variantTitle: variant.title,
                sku: variant.sku || '',
                price: parseFloat(variant.price) || 0,
                compareAtPrice: parseFloat(variant.compare_at_price) || null,
                inventoryQuantity: variant.inventory_quantity || 0,
                imageUrl: product.images?.[0]?.src || null,
            });
        }
    }

    return variants;
};

/**
 * Search for a variant by SKU
 * @param {Array} products - Products array
 * @param {string} sku - SKU to search for
 * @returns {Object|null} - Matching variant or null
 */
const findVariantBySku = (products, sku) => {
    if (!sku) return null;

    for (const product of products) {
        for (const variant of product.variants || []) {
            if (variant.sku?.toLowerCase() === sku.toLowerCase()) {
                return {
                    variantId: variant.id,
                    productId: product.id,
                    productTitle: product.title,
                    variantTitle: variant.title,
                    sku: variant.sku,
                    price: parseFloat(variant.price) || 0,
                };
            }
        }
    }

    return null;
};

/**
 * Create a variant lookup map for faster COGS matching
 * @param {Array} products - Products array
 * @returns {Object} - Map of variantId -> variant details
 */
const createVariantLookup = (products) => {
    const lookup = {};

    for (const product of products) {
        for (const variant of product.variants || []) {
            lookup[variant.id] = {
                variantId: variant.id,
                productId: product.id,
                productTitle: product.title,
                variantTitle: variant.title,
                sku: variant.sku || '',
                price: parseFloat(variant.price) || 0,
            };

            // Also index by SKU if available
            if (variant.sku) {
                lookup[`sku:${variant.sku.toLowerCase()}`] = lookup[variant.id];
            }
        }
    }

    return lookup;
};

module.exports = {
    fetchProducts,
    fetchProduct,
    fetchProductCount,
    extractVariants,
    findVariantBySku,
    createVariantLookup,
};
