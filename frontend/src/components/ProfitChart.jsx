/**
 * Profit Chart Component
 * Displays profit trends over time
 */

import React, { useState, useMemo } from 'react';
import {
    Card,
    BlockStack,
    InlineStack,
    Text,
    Select,
    SkeletonBodyText,
} from '@shopify/polaris';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from 'recharts';
import { useProfitRange } from '../hooks/useProfit';
import { formatCurrency, formatDateShort, getDateRange } from '../utils/formatters';

export default function ProfitChart() {
    const [range, setRange] = useState('week');
    const { startDate, endDate } = getDateRange(range);
    const { data, loading, error } = useProfitRange(startDate, endDate);

    const rangeOptions = [
        { label: 'Última Semana', value: 'week' },
        { label: 'Últimos 30 Dias', value: 'last30' },
        { label: 'Este Mês', value: 'month' },
    ];

    const chartData = useMemo(() => {
        if (!data?.days) return [];

        return data.days.map(day => ({
            date: formatDateShort(day.date),
            fullDate: day.date,
            revenue: parseFloat(day.revenue) || 0,
            profit: parseFloat(day.netProfit) || 0,
            cogs: parseFloat(day.cogs) || 0,
            adSpend: parseFloat(day.adSpend) || 0,
        }));
    }, [data]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;

        return (
            <div style={{
                backgroundColor: 'white',
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}>
                <Text variant="headingSm">{label}</Text>
                <BlockStack gap="100">
                    {payload.map((entry, index) => (
                        <Text key={index} variant="bodySm" tone={entry.name === 'Lucro' ? (entry.value >= 0 ? 'success' : 'critical') : undefined}>
                            {entry.name}: {formatCurrency(entry.value)}
                        </Text>
                    ))}
                </BlockStack>
            </div>
        );
    };

    if (loading) {
        return (
            <Card>
                <BlockStack gap="400">
                    <Text variant="headingMd">Evolução do Lucro</Text>
                    <SkeletonBodyText lines={8} />
                </BlockStack>
            </Card>
        );
    }

    if (error || !chartData.length) {
        return (
            <Card>
                <BlockStack gap="400">
                    <InlineStack align="space-between">
                        <Text variant="headingMd">Evolução do Lucro</Text>
                        <Select
                            label=""
                            labelHidden
                            options={rangeOptions}
                            value={range}
                            onChange={setRange}
                        />
                    </InlineStack>
                    <Text tone="subdued">
                        Sem dados disponíveis para o período selecionado
                    </Text>
                </BlockStack>
            </Card>
        );
    }

    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd">Evolução do Lucro</Text>
                    <Select
                        label=""
                        labelHidden
                        options={rangeOptions}
                        value={range}
                        onChange={setRange}
                    />
                </InlineStack>

                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <AreaChart
                            data={chartData}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#008060" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#008060" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#5c6ac4" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#5c6ac4" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 12 }}
                                tickLine={false}
                                axisLine={{ stroke: '#e0e0e0' }}
                            />
                            <YAxis
                                tickFormatter={(value) => formatCurrency(value).replace('R$', '')}
                                tick={{ fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="revenue"
                                name="Receita"
                                stroke="#5c6ac4"
                                fillOpacity={1}
                                fill="url(#colorRevenue)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="profit"
                                name="Lucro"
                                stroke="#008060"
                                fillOpacity={1}
                                fill="url(#colorProfit)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Summary below chart */}
                {data?.totals && (
                    <InlineStack align="space-between">
                        <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued">Receita Total</Text>
                            <Text variant="headingSm">{formatCurrency(data.totals.revenue)}</Text>
                        </BlockStack>
                        <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued">Lucro Total</Text>
                            <Text variant="headingSm" tone={parseFloat(data.totals.netProfit) >= 0 ? 'success' : 'critical'}>
                                {formatCurrency(data.totals.netProfit)}
                            </Text>
                        </BlockStack>
                        <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued">Margem Média</Text>
                            <Text variant="headingSm">{data.totals.profitMargin}%</Text>
                        </BlockStack>
                    </InlineStack>
                )}
            </BlockStack>
        </Card>
    );
}
