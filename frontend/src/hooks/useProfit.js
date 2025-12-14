/**
 * useProfit Hook
 * Fetches and caches profit data from Cloud Functions
 */

import { useState, useEffect, useCallback } from 'react';
import { callFunction } from '../firebase';

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Simple in-memory cache
const cache = new Map();

/**
 * Hook to fetch profit for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Object} - { data, loading, error, refetch }
 */
export function useProfit(date) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchProfit = useCallback(async (forceRefresh = false) => {
        const cacheKey = `profit-${date}`;

        // Check cache first
        if (!forceRefresh) {
            const cached = cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                setData(cached.data);
                setLoading(false);
                return cached.data;
            }
        }

        setLoading(true);
        setError(null);

        try {
            const calculateProfit = callFunction('calculateProfit');
            const result = await calculateProfit({ date });

            const profitData = result.data;

            // Update cache
            cache.set(cacheKey, {
                data: profitData,
                timestamp: Date.now(),
            });

            setData(profitData);
            return profitData;

        } catch (err) {
            console.error('Profit fetch error:', err);
            setError(err.message || 'Erro ao carregar dados');
            return null;

        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        if (date) {
            fetchProfit();
        }
    }, [date, fetchProfit]);

    const refetch = () => fetchProfit(true);

    return { data, loading, error, refetch };
}

/**
 * Hook to fetch profit for a date range
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Object} - { data, loading, error, refetch }
 */
export function useProfitRange(startDate, endDate) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchProfitRange = useCallback(async (forceRefresh = false) => {
        const cacheKey = `profit-range-${startDate}-${endDate}`;

        if (!forceRefresh) {
            const cached = cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                setData(cached.data);
                setLoading(false);
                return cached.data;
            }
        }

        setLoading(true);
        setError(null);

        try {
            const calculateProfitRange = callFunction('calculateProfitRange');
            const result = await calculateProfitRange({ startDate, endDate });

            const rangeData = result.data;

            cache.set(cacheKey, {
                data: rangeData,
                timestamp: Date.now(),
            });

            setData(rangeData);
            return rangeData;

        } catch (err) {
            console.error('Profit range fetch error:', err);
            setError(err.message || 'Erro ao carregar dados');
            return null;

        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        if (startDate && endDate) {
            fetchProfitRange();
        }
    }, [startDate, endDate, fetchProfitRange]);

    const refetch = () => fetchProfitRange(true);

    return { data, loading, error, refetch };
}

/**
 * Hook to fetch dashboard summary
 * @returns {Object} - { data, loading, error, refetch }
 */
export function useDashboardSummary() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSummary = useCallback(async (forceRefresh = false) => {
        const cacheKey = 'dashboard-summary';

        if (!forceRefresh) {
            const cached = cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                setData(cached.data);
                setLoading(false);
                return cached.data;
            }
        }

        setLoading(true);
        setError(null);

        try {
            const getDashboardSummary = callFunction('getDashboardSummary');
            const result = await getDashboardSummary({});

            const summaryData = result.data;

            cache.set(cacheKey, {
                data: summaryData,
                timestamp: Date.now(),
            });

            setData(summaryData);
            return summaryData;

        } catch (err) {
            console.error('Dashboard summary fetch error:', err);
            setError(err.message || 'Erro ao carregar resumo');
            return null;

        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    const refetch = () => fetchSummary(true);

    return { data, loading, error, refetch };
}

/**
 * Clear all cached data
 */
export function clearProfitCache() {
    cache.clear();
}

export default useProfit;
