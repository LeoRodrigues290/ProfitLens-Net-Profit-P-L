/**
 * Currency and date formatting utilities
 */

/**
 * Format number as currency
 * @param {number|string} value - Value to format
 * @param {string} currency - Currency code (default: BRL)
 * @returns {string} - Formatted currency string
 */
export const formatCurrency = (value, currency = 'BRL') => {
    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num)) return 'R$ 0,00';

    const formatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    return formatter.format(num);
};

/**
 * Format number as percentage
 * @param {number|string} value - Value to format
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} - Formatted percentage string
 */
export const formatPercent = (value, decimals = 1) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num)) return '0%';

    return `${num.toFixed(decimals)}%`;
};

/**
 * Format date to locale string
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date string
 */
export const formatDate = (date) => {
    const d = typeof date === 'string' ? new Date(date) : date;

    return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

/**
 * Format date to short format
 * @param {string|Date} date - Date to format
 * @returns {string} - Short date string (DD/MM)
 */
export const formatDateShort = (date) => {
    const d = typeof date === 'string' ? new Date(date) : date;

    return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
    });
};

/**
 * Get date range labels
 * @param {string} range - Range type (today, week, month)
 * @returns {Object} - { label, startDate, endDate }
 */
export const getDateRange = (range) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    switch (range) {
        case 'today':
            return {
                label: 'Hoje',
                startDate: todayStr,
                endDate: todayStr,
            };

        case 'week': {
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay() + 1);
            return {
                label: 'Esta Semana',
                startDate: weekStart.toISOString().split('T')[0],
                endDate: todayStr,
            };
        }

        case 'month': {
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            return {
                label: 'Este Mês',
                startDate: monthStart.toISOString().split('T')[0],
                endDate: todayStr,
            };
        }

        case 'last30': {
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(today.getDate() - 30);
            return {
                label: 'Últimos 30 Dias',
                startDate: thirtyDaysAgo.toISOString().split('T')[0],
                endDate: todayStr,
            };
        }

        default:
            return {
                label: 'Hoje',
                startDate: todayStr,
                endDate: todayStr,
            };
    }
};

/**
 * Format number with compact notation
 * @param {number} value - Value to format
 * @returns {string} - Formatted string (e.g., 1.2K, 3.5M)
 */
export const formatCompact = (value) => {
    const formatter = new Intl.NumberFormat('pt-BR', {
        notation: 'compact',
        compactDisplay: 'short',
    });

    return formatter.format(value);
};

/**
 * Get profit status color
 * @param {number} value - Profit value
 * @returns {string} - Polaris tone name
 */
export const getProfitTone = (value) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (num > 0) return 'success';
    if (num < 0) return 'critical';
    return 'subdued';
};
