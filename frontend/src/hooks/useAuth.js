/**
 * useAuth Hook
 * Manages authentication state with Shopify App Bridge
 */

import { useState, useEffect, useContext, createContext } from 'react';

// Auth context
const AuthContext = createContext(null);

// Auth provider component
export function AuthProvider({ children, shopOrigin }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [shop, setShop] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get shop from URL or App Bridge
        const urlParams = new URLSearchParams(window.location.search);
        const shopParam = urlParams.get('shop');

        if (shopParam) {
            setShop(shopParam);
            setIsAuthenticated(true);
        } else if (shopOrigin) {
            setShop(shopOrigin);
            setIsAuthenticated(true);
        }

        setLoading(false);
    }, [shopOrigin]);

    const value = {
        isAuthenticated,
        shop,
        loading,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook to access auth context
 */
export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
}

/**
 * Hook to get shop domain from URL
 */
export function useShopDomain() {
    const [shop, setShop] = useState(null);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const shopParam = urlParams.get('shop');

        if (shopParam) {
            setShop(shopParam);
        }
    }, []);

    return shop;
}

export default useAuth;
