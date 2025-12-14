/**
 * Fixed Costs Component
 * Manage monthly recurring costs
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Page,
    Layout,
    Card,
    ResourceList,
    ResourceItem,
    Text,
    TextField,
    Button,
    Modal,
    Select,
    Badge,
    BlockStack,
    InlineStack,
    EmptyState,
    Spinner,
    Toast,
    Frame,
    Divider,
} from '@shopify/polaris';
import { callFunction } from '../firebase';
import { formatCurrency } from '../utils/formatters';

const FREQUENCY_OPTIONS = [
    { label: 'Diário', value: 'daily' },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensal', value: 'monthly' },
    { label: 'Anual', value: 'yearly' },
];

const CATEGORY_OPTIONS = [
    { label: 'Operacional', value: 'operational' },
    { label: 'Marketing', value: 'marketing' },
    { label: 'Ferramentas', value: 'tools' },
    { label: 'Pessoal', value: 'personnel' },
    { label: 'Outros', value: 'other' },
];

const FREQUENCY_LABELS = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
    yearly: 'Anual',
};

export default function FixedCosts() {
    const [costs, setCosts] = useState([]);
    const [totals, setTotals] = useState({ daily: 0, monthly: 0, yearly: 0 });
    const [loading, setLoading] = useState(true);

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCost, setEditingCost] = useState(null);
    const [formData, setFormData] = useState({
        description: '',
        amount: '',
        frequency: 'monthly',
        category: 'operational',
    });
    const [saving, setSaving] = useState(false);

    // Toast
    const [toastActive, setToastActive] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    const showToast = (message) => {
        setToastMessage(message);
        setToastActive(true);
    };

    // Fetch costs
    const fetchCosts = useCallback(async () => {
        setLoading(true);
        try {
            const getFixedCosts = callFunction('getFixedCosts');
            const result = await getFixedCosts({});
            setCosts(result.data.costs || []);
            setTotals(result.data.totals || { daily: 0, monthly: 0, yearly: 0 });
        } catch (error) {
            console.error('Fetch costs error:', error);
            showToast('Erro ao carregar custos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCosts();
    }, [fetchCosts]);

    // Open add modal
    const handleAdd = () => {
        setEditingCost(null);
        setFormData({
            description: '',
            amount: '',
            frequency: 'monthly',
            category: 'operational',
        });
        setModalOpen(true);
    };

    // Open edit modal
    const handleEdit = (cost) => {
        setEditingCost(cost);
        setFormData({
            description: cost.description || '',
            amount: cost.amount?.toString() || '',
            frequency: cost.frequency || 'monthly',
            category: cost.category || 'operational',
        });
        setModalOpen(true);
    };

    // Save cost
    const handleSave = async () => {
        if (!formData.description || !formData.amount) {
            showToast('Preencha todos os campos');
            return;
        }

        setSaving(true);
        try {
            if (editingCost) {
                const updateFixedCost = callFunction('updateFixedCost');
                await updateFixedCost({
                    id: editingCost.id,
                    ...formData,
                    amount: parseFloat(formData.amount),
                });
                showToast('Custo atualizado');
            } else {
                const addFixedCost = callFunction('addFixedCost');
                await addFixedCost({
                    ...formData,
                    amount: parseFloat(formData.amount),
                });
                showToast('Custo adicionado');
            }

            setModalOpen(false);
            fetchCosts();
        } catch (error) {
            console.error('Save cost error:', error);
            showToast('Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    // Delete cost
    const handleDelete = async (id) => {
        try {
            const deleteFixedCost = callFunction('deleteFixedCost');
            await deleteFixedCost({ id });
            showToast('Custo removido');
            fetchCosts();
        } catch (error) {
            console.error('Delete cost error:', error);
            showToast('Erro ao remover');
        }
    };

    return (
        <Frame>
            <Page
                title="Custos Fixos"
                subtitle="Gerencie seus custos recorrentes para cálculo preciso do lucro"
                primaryAction={{
                    content: 'Adicionar Custo',
                    onAction: handleAdd,
                }}
            >
                <Layout>
                    {/* Totals Summary */}
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd">Resumo de Custos</Text>
                                <InlineStack gap="800" align="start">
                                    <BlockStack gap="100">
                                        <Text variant="bodySm" tone="subdued">Custo Diário</Text>
                                        <Text variant="headingLg">{formatCurrency(totals.daily)}</Text>
                                    </BlockStack>
                                    <BlockStack gap="100">
                                        <Text variant="bodySm" tone="subdued">Custo Mensal</Text>
                                        <Text variant="headingLg">{formatCurrency(totals.monthly)}</Text>
                                    </BlockStack>
                                    <BlockStack gap="100">
                                        <Text variant="bodySm" tone="subdued">Custo Anual</Text>
                                        <Text variant="headingLg">{formatCurrency(totals.yearly)}</Text>
                                    </BlockStack>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    {/* Costs List */}
                    <Layout.Section>
                        <Card>
                            {loading ? (
                                <InlineStack align="center">
                                    <Spinner />
                                </InlineStack>
                            ) : costs.length === 0 ? (
                                <EmptyState
                                    heading="Nenhum custo cadastrado"
                                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                    action={{
                                        content: 'Adicionar Custo',
                                        onAction: handleAdd,
                                    }}
                                >
                                    <p>Adicione seus custos fixos como aluguel, ferramentas, salários, etc.</p>
                                </EmptyState>
                            ) : (
                                <ResourceList
                                    resourceName={{ singular: 'custo', plural: 'custos' }}
                                    items={costs}
                                    renderItem={(cost) => (
                                        <ResourceItem
                                            id={cost.id}
                                            name={cost.description}
                                            shortcutActions={[
                                                { content: 'Editar', onAction: () => handleEdit(cost) },
                                                { content: 'Remover', onAction: () => handleDelete(cost.id) },
                                            ]}
                                        >
                                            <InlineStack align="space-between" blockAlign="center">
                                                <BlockStack gap="100">
                                                    <Text variant="bodyMd" fontWeight="semibold">
                                                        {cost.description}
                                                    </Text>
                                                    <Text variant="bodySm" tone="subdued">
                                                        {FREQUENCY_LABELS[cost.frequency] || cost.frequency}
                                                    </Text>
                                                </BlockStack>
                                                <Badge>{formatCurrency(cost.amount)}</Badge>
                                            </InlineStack>
                                        </ResourceItem>
                                    )}
                                />
                            )}
                        </Card>
                    </Layout.Section>
                </Layout>

                {/* Add/Edit Modal */}
                <Modal
                    open={modalOpen}
                    onClose={() => setModalOpen(false)}
                    title={editingCost ? 'Editar Custo' : 'Adicionar Custo'}
                    primaryAction={{
                        content: 'Salvar',
                        onAction: handleSave,
                        loading: saving,
                    }}
                    secondaryActions={[
                        { content: 'Cancelar', onAction: () => setModalOpen(false) },
                    ]}
                >
                    <Modal.Section>
                        <BlockStack gap="400">
                            <TextField
                                label="Descrição"
                                value={formData.description}
                                onChange={(value) => setFormData({ ...formData, description: value })}
                                placeholder="Ex: Aluguel, Shopify, etc."
                                autoComplete="off"
                            />

                            <TextField
                                label="Valor"
                                type="number"
                                value={formData.amount}
                                onChange={(value) => setFormData({ ...formData, amount: value })}
                                prefix="R$"
                                autoComplete="off"
                            />

                            <Select
                                label="Frequência"
                                options={FREQUENCY_OPTIONS}
                                value={formData.frequency}
                                onChange={(value) => setFormData({ ...formData, frequency: value })}
                            />

                            <Select
                                label="Categoria"
                                options={CATEGORY_OPTIONS}
                                value={formData.category}
                                onChange={(value) => setFormData({ ...formData, category: value })}
                            />
                        </BlockStack>
                    </Modal.Section>
                </Modal>

                {/* Toast */}
                {toastActive && (
                    <Toast content={toastMessage} onDismiss={() => setToastActive(false)} />
                )}
            </Page>
        </Frame>
    );
}
