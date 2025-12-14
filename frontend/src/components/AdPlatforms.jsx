/**
 * Ad Platforms Component
 * Connect and manage ad platform integrations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Page,
    Layout,
    Card,
    Text,
    Button,
    Badge,
    BlockStack,
    InlineStack,
    Banner,
    Modal,
    Spinner,
    Box,
    Divider,
} from '@shopify/polaris';
import { callFunction } from '../firebase';

const PLATFORMS = [
    {
        id: 'facebook',
        name: 'Facebook Ads',
        icon: '📘',
        description: 'Sincronize gastos do Facebook e Instagram Ads automaticamente',
        connectFunction: 'connectFacebook',
        statusFunction: 'getFacebookStatus',
        disconnectFunction: 'disconnectFacebook',
    },
    {
        id: 'google',
        name: 'Google Ads',
        icon: '🔍',
        description: 'Sincronize gastos do Google Ads automaticamente',
        connectFunction: 'connectGoogle',
        statusFunction: 'getGoogleStatus',
        disconnectFunction: 'disconnectGoogle',
    },
    {
        id: 'tiktok',
        name: 'TikTok Ads',
        icon: '🎵',
        description: 'Sincronize gastos do TikTok Ads automaticamente',
        connectFunction: 'connectTikTok',
        statusFunction: 'getTikTokStatus',
        disconnectFunction: 'disconnectTikTok',
    },
];

export default function AdPlatforms() {
    const [statuses, setStatuses] = useState({});
    const [loading, setLoading] = useState(true);
    const [connectingPlatform, setConnectingPlatform] = useState(null);
    const [disconnectModal, setDisconnectModal] = useState(null);

    // Check URL for connection results
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const success = params.get('success');
        const error = params.get('error');

        if (success) {
            // Clear URL params
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        if (error) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    // Fetch all platform statuses
    const fetchStatuses = useCallback(async () => {
        setLoading(true);
        const newStatuses = {};

        for (const platform of PLATFORMS) {
            try {
                const getStatus = callFunction(platform.statusFunction);
                const result = await getStatus({});
                newStatuses[platform.id] = result.data;
            } catch (error) {
                console.error(`Error fetching ${platform.id} status:`, error);
                newStatuses[platform.id] = { connected: false, error: true };
            }
        }

        setStatuses(newStatuses);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchStatuses();
    }, [fetchStatuses]);

    // Connect to platform
    const handleConnect = async (platform) => {
        setConnectingPlatform(platform.id);

        try {
            const connect = callFunction(platform.connectFunction);
            const result = await connect({});

            if (result.data.authUrl) {
                // Redirect to OAuth
                window.location.href = result.data.authUrl;
            }
        } catch (error) {
            console.error(`Error connecting ${platform.id}:`, error);
            setConnectingPlatform(null);
        }
    };

    // Disconnect platform
    const handleDisconnect = async (platform) => {
        try {
            const disconnect = callFunction(platform.disconnectFunction);
            await disconnect({});

            setDisconnectModal(null);
            fetchStatuses();
        } catch (error) {
            console.error(`Error disconnecting ${platform.id}:`, error);
        }
    };

    return (
        <Page
            title="Plataformas de Anúncios"
            subtitle="Conecte suas contas de anúncios para sincronização automática"
        >
            <Layout>
                <Layout.Section>
                    <Banner status="info">
                        <p>
                            Os gastos com anúncios são sincronizados automaticamente a cada 2 horas.
                            Os dados são usados para calcular seu lucro líquido real.
                        </p>
                    </Banner>
                </Layout.Section>

                {loading ? (
                    <Layout.Section>
                        <Card>
                            <InlineStack align="center" blockAlign="center">
                                <Spinner size="large" />
                            </InlineStack>
                        </Card>
                    </Layout.Section>
                ) : (
                    PLATFORMS.map((platform) => {
                        const status = statuses[platform.id] || { connected: false };
                        const isConnecting = connectingPlatform === platform.id;

                        return (
                            <Layout.Section key={platform.id}>
                                <Card>
                                    <BlockStack gap="400">
                                        <InlineStack align="space-between" blockAlign="center">
                                            <InlineStack gap="300" blockAlign="center">
                                                <Box
                                                    padding="200"
                                                    background="bg-surface-secondary"
                                                    borderRadius="200"
                                                >
                                                    <Text variant="headingLg">{platform.icon}</Text>
                                                </Box>
                                                <BlockStack gap="100">
                                                    <Text variant="headingMd">{platform.name}</Text>
                                                    <Text variant="bodySm" tone="subdued">
                                                        {platform.description}
                                                    </Text>
                                                </BlockStack>
                                            </InlineStack>

                                            <InlineStack gap="300" blockAlign="center">
                                                {status.connected ? (
                                                    <>
                                                        <Badge tone="success">Conectado</Badge>
                                                        <Button
                                                            variant="plain"
                                                            tone="critical"
                                                            onClick={() => setDisconnectModal(platform)}
                                                        >
                                                            Desconectar
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button
                                                        variant="primary"
                                                        loading={isConnecting}
                                                        onClick={() => handleConnect(platform)}
                                                    >
                                                        Conectar
                                                    </Button>
                                                )}
                                            </InlineStack>
                                        </InlineStack>

                                        {status.connected && (
                                            <>
                                                <Divider />
                                                <BlockStack gap="200">
                                                    {status.adAccountName && (
                                                        <InlineStack gap="100">
                                                            <Text variant="bodySm" tone="subdued">Conta:</Text>
                                                            <Text variant="bodySm">{status.adAccountName}</Text>
                                                        </InlineStack>
                                                    )}
                                                    {status.customerId && (
                                                        <InlineStack gap="100">
                                                            <Text variant="bodySm" tone="subdued">ID:</Text>
                                                            <Text variant="bodySm">{status.customerId}</Text>
                                                        </InlineStack>
                                                    )}
                                                    {status.advertiserId && (
                                                        <InlineStack gap="100">
                                                            <Text variant="bodySm" tone="subdued">Advertiser:</Text>
                                                            <Text variant="bodySm">{status.advertiserName || status.advertiserId}</Text>
                                                        </InlineStack>
                                                    )}
                                                    {status.connectedAt && (
                                                        <InlineStack gap="100">
                                                            <Text variant="bodySm" tone="subdued">Conectado em:</Text>
                                                            <Text variant="bodySm">
                                                                {new Date(status.connectedAt._seconds * 1000).toLocaleDateString('pt-BR')}
                                                            </Text>
                                                        </InlineStack>
                                                    )}
                                                </BlockStack>
                                            </>
                                        )}
                                    </BlockStack>
                                </Card>
                            </Layout.Section>
                        );
                    })
                )}
            </Layout>

            {/* Disconnect Confirmation Modal */}
            <Modal
                open={disconnectModal !== null}
                onClose={() => setDisconnectModal(null)}
                title={`Desconectar ${disconnectModal?.name}`}
                primaryAction={{
                    content: 'Desconectar',
                    destructive: true,
                    onAction: () => handleDisconnect(disconnectModal),
                }}
                secondaryActions={[
                    { content: 'Cancelar', onAction: () => setDisconnectModal(null) },
                ]}
            >
                <Modal.Section>
                    <Text>
                        Tem certeza que deseja desconectar sua conta de {disconnectModal?.name}?
                        Os gastos não serão mais sincronizados automaticamente.
                    </Text>
                </Modal.Section>
            </Modal>
        </Page>
    );
}
