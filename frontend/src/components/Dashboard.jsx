/**
 * Main Dashboard Component
 * Displays profit overview and key metrics
 */

import React, { useState } from 'react';
import {
    Page,
    Layout,
    Card,
    Text,
    Badge,
    BlockStack,
    InlineStack,
    SkeletonBodyText,
    SkeletonDisplayText,
    Banner,
    Select,
    Button,
    Icon,
    Divider,
    Box,
} from '@shopify/polaris';
import {
    ArrowUpIcon,
    ArrowDownIcon,
    RefreshIcon,
} from '@shopify/polaris-icons';
import { useProfit, useDashboardSummary } from '../hooks/useProfit';
import { formatCurrency, formatPercent, getProfitTone, getDateRange } from '../utils/formatters';
import ProfitChart from './ProfitChart';

export default function Dashboard() {
    const [dateRange, setDateRange] = useState('today');
    const { label, startDate, endDate } = getDateRange(dateRange);

    const today = new Date().toISOString().split('T')[0];
    const { data, loading, error, refetch } = useProfit(today);
    const { data: summaryData } = useDashboardSummary();

    const dateOptions = [
        { label: 'Hoje', value: 'today' },
        { label: 'Esta Semana', value: 'week' },
        { label: 'Este Mês', value: 'month' },
        { label: 'Últimos 30 Dias', value: 'last30' },
    ];

    if (loading) {
        return <DashboardSkeleton />;
    }

    if (error) {
        return (
            <Page title="CFO de Bolso">
                <Banner status="critical" title="Erro ao carregar dados">
                    <p>{error}</p>
                    <Button onClick={refetch}>Tentar novamente</Button>
                </Banner>
            </Page>
        );
    }

    const isProfitable = parseFloat(data?.netProfit || 0) >= 0;
    const profitTone = getProfitTone(data?.netProfit);

    return (
        <Page
            title="CFO de Bolso"
            subtitle="Seu lucro líquido real"
            primaryAction={{
                content: 'Atualizar',
                icon: RefreshIcon,
                onAction: refetch,
            }}
        >
            <Layout>
                {/* Alerts */}
                {data?.alerts?.length > 0 && (
                    <Layout.Section>
                        <BlockStack gap="300">
                            {data.alerts.map((alert, index) => (
                                <Banner
                                    key={index}
                                    status={alert.type === 'error' ? 'critical' : alert.type}
                                    title={alert.message}
                                >
                                    <p>{alert.action}</p>
                                </Banner>
                            ))}
                        </BlockStack>
                    </Layout.Section>
                )}

                {/* Main Profit Card */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <InlineStack align="space-between" blockAlign="center">
                                <Text variant="headingMd" as="h2">Lucro Líquido (Hoje)</Text>
                                <Select
                                    label=""
                                    labelHidden
                                    options={dateOptions}
                                    value={dateRange}
                                    onChange={setDateRange}
                                />
                            </InlineStack>

                            <InlineStack gap="400" blockAlign="center">
                                <Text variant="heading2xl" as="p" tone={profitTone}>
                                    {formatCurrency(data?.netProfit || 0)}
                                </Text>
                                <Badge tone={profitTone}>
                                    {formatPercent(data?.profitMargin || 0)} margem
                                </Badge>
                                {isProfitable ? (
                                    <Icon source={ArrowUpIcon} tone="success" />
                                ) : (
                                    <Icon source={ArrowDownIcon} tone="critical" />
                                )}
                            </InlineStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* Metrics Cards */}
                <Layout.Section variant="oneHalf">
                    <Card>
                        <BlockStack gap="200">
                            <Text variant="headingMd" as="h3">Receita Bruta</Text>
                            <Text variant="headingXl" as="p">
                                {formatCurrency(data?.revenue || 0)}
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                                {data?.orderCount || 0} pedidos • {data?.itemsSold || 0} itens
                            </Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section variant="oneHalf">
                    <Card>
                        <BlockStack gap="200">
                            <Text variant="headingMd" as="h3">Lucro Bruto</Text>
                            <Text variant="headingXl" as="p">
                                {formatCurrency(data?.grossProfit || 0)}
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                                {formatPercent(data?.grossMargin || 0)} margem bruta
                            </Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* Cost Breakdown */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h2">Distribuição de Custos</Text>
                            <Divider />

                            <InlineStack align="space-between">
                                <Text>Custo de Produtos (COGS)</Text>
                                <Text variant="bodyMd" fontWeight="semibold">
                                    {formatCurrency(data?.cogs || 0)}
                                </Text>
                            </InlineStack>

                            {parseFloat(data?.cogsMatchRate || 0) < 100 && (
                                <Banner status="warning" hideIcon>
                                    <Text variant="bodySm">
                                        Apenas {data?.cogsMatchRate}% dos produtos têm custo cadastrado
                                    </Text>
                                </Banner>
                            )}

                            <InlineStack align="space-between">
                                <Text>Gastos com Anúncios</Text>
                                <Text variant="bodyMd" fontWeight="semibold">
                                    {formatCurrency(data?.adSpend || 0)}
                                </Text>
                            </InlineStack>

                            {data?.adSpendByPlatform && Object.keys(data.adSpendByPlatform).length > 0 && (
                                <Box paddingInlineStart="400">
                                    <BlockStack gap="100">
                                        {Object.entries(data.adSpendByPlatform).map(([platform, spend]) => (
                                            <InlineStack key={platform} align="space-between">
                                                <Text variant="bodySm" tone="subdued">
                                                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                                                </Text>
                                                <Text variant="bodySm" tone="subdued">
                                                    {formatCurrency(spend)}
                                                </Text>
                                            </InlineStack>
                                        ))}
                                    </BlockStack>
                                </Box>
                            )}

                            <InlineStack align="space-between">
                                <Text>Taxas de Gateway</Text>
                                <Text variant="bodyMd" fontWeight="semibold">
                                    {formatCurrency(data?.fees || 0)}
                                </Text>
                            </InlineStack>

                            <InlineStack align="space-between">
                                <Text>Custos Fixos (diário)</Text>
                                <Text variant="bodyMd" fontWeight="semibold">
                                    {formatCurrency(data?.fixedCosts || 0)}
                                </Text>
                            </InlineStack>

                            <Divider />

                            <InlineStack align="space-between">
                                <Text variant="headingMd">Lucro Líquido</Text>
                                <Text variant="headingMd" tone={profitTone} fontWeight="bold">
                                    {formatCurrency(data?.netProfit || 0)}
                                </Text>
                            </InlineStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* Weekly Summary */}
                {summaryData && (
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">Resumo</Text>
                                <InlineStack gap="400" align="space-between">
                                    <SummaryCard
                                        title="Esta Semana"
                                        profit={summaryData.thisWeek?.netProfit}
                                        orders={summaryData.thisWeek?.orderCount}
                                    />
                                    <SummaryCard
                                        title="Este Mês"
                                        profit={summaryData.thisMonth?.netProfit}
                                        orders={summaryData.thisMonth?.orderCount}
                                    />
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                )}

                {/* Chart */}
                <Layout.Section>
                    <ProfitChart />
                </Layout.Section>
            </Layout>
        </Page>
    );
}

function SummaryCard({ title, profit, orders }) {
    const profitValue = parseFloat(profit || 0);
    const profitTone = getProfitTone(profitValue);

    return (
        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="200">
                <Text variant="bodyMd" tone="subdued">{title}</Text>
                <Text variant="headingLg" tone={profitTone}>
                    {formatCurrency(profit || 0)}
                </Text>
                <Text variant="bodySm" tone="subdued">{orders || 0} pedidos</Text>
            </BlockStack>
        </Box>
    );
}

function DashboardSkeleton() {
    return (
        <Page title="CFO de Bolso">
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <SkeletonDisplayText size="medium" />
                            <SkeletonBodyText lines={2} />
                        </BlockStack>
                    </Card>
                </Layout.Section>
                <Layout.Section variant="oneHalf">
                    <Card>
                        <SkeletonBodyText lines={3} />
                    </Card>
                </Layout.Section>
                <Layout.Section variant="oneHalf">
                    <Card>
                        <SkeletonBodyText lines={3} />
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
