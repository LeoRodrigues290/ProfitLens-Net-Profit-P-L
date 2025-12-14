/**
 * COGS Manager Component
 * Manage product costs with manual entry and CSV import
 */

import React, { useState, useCallback, useEffect } from 'react';
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
    DropZone,
    Banner,
    BlockStack,
    InlineStack,
    Badge,
    Spinner,
    EmptyState,
    PageActions,
    Toast,
    Frame,
} from '@shopify/polaris';
import { callFunction } from '../firebase';
import { formatCurrency } from '../utils/formatters';

export default function COGSManager() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchValue, setSearchValue] = useState('');

    // Modal states
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [editCogs, setEditCogs] = useState('');

    // Import states
    const [importFile, setImportFile] = useState(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importResult, setImportResult] = useState(null);

    // Toast
    const [toastActive, setToastActive] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    // Fetch all COGS
    const fetchCogs = useCallback(async () => {
        setLoading(true);
        try {
            const getAllCogs = callFunction('getAllCogs');
            const result = await getAllCogs({});
            setProducts(result.data.products || []);
        } catch (error) {
            console.error('Fetch COGS error:', error);
            showToast('Erro ao carregar custos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCogs();
    }, [fetchCogs]);

    const showToast = (message) => {
        setToastMessage(message);
        setToastActive(true);
    };

    // Filter products by search
    const filteredProducts = products.filter((p) =>
        p.sku?.toLowerCase().includes(searchValue.toLowerCase()) ||
        p.productTitle?.toLowerCase().includes(searchValue.toLowerCase())
    );

    // Edit COGS
    const handleEdit = (product) => {
        setSelectedProduct(product);
        setEditCogs(product.cogs?.toString() || '');
        setEditModalOpen(true);
    };

    const handleSaveCogs = async () => {
        if (!selectedProduct || !editCogs) return;

        try {
            const setCogs = callFunction('setCogs');
            await setCogs({
                variantId: selectedProduct.variantId || selectedProduct.id,
                productId: selectedProduct.productId,
                sku: selectedProduct.sku,
                cogs: parseFloat(editCogs),
                productTitle: selectedProduct.productTitle,
            });

            showToast('Custo atualizado com sucesso');
            setEditModalOpen(false);
            fetchCogs();
        } catch (error) {
            console.error('Save COGS error:', error);
            showToast('Erro ao salvar custo');
        }
    };

    // Delete COGS
    const handleDelete = async (variantId) => {
        try {
            const deleteCogs = callFunction('deleteCogs');
            await deleteCogs({ variantId });
            showToast('Custo removido');
            fetchCogs();
        } catch (error) {
            console.error('Delete COGS error:', error);
            showToast('Erro ao remover custo');
        }
    };

    // CSV Import
    const handleDropZoneDrop = useCallback((_dropFiles, acceptedFiles) => {
        setImportFile(acceptedFiles[0]);
        setImportResult(null);
    }, []);

    const handleImport = async () => {
        if (!importFile) return;

        setImportLoading(true);
        setImportResult(null);

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const csvContent = e.target.result;

                // Validate first
                const validateCsv = callFunction('validateCogsCsv');
                const validation = await validateCsv({ csvContent });

                if (!validation.data.valid) {
                    setImportResult({
                        success: false,
                        message: validation.data.message,
                    });
                    setImportLoading(false);
                    return;
                }

                // Import
                const importFromCsv = callFunction('importCogsFromCsv');
                const result = await importFromCsv({
                    csvContent,
                    mapping: validation.data.mapping,
                });

                setImportResult({
                    success: true,
                    message: result.data.message,
                    results: result.data.results,
                });

                fetchCogs();
            };

            reader.readAsText(importFile);
        } catch (error) {
            console.error('Import error:', error);
            setImportResult({
                success: false,
                message: 'Erro ao importar arquivo',
            });
        } finally {
            setImportLoading(false);
        }
    };

    // Export COGS
    const handleExport = async () => {
        try {
            const exportCogs = callFunction('exportCogs');
            const result = await exportCogs({});

            const blob = new Blob([result.data.content], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.data.filename;
            a.click();
            URL.revokeObjectURL(url);

            showToast('Exportação concluída');
        } catch (error) {
            console.error('Export error:', error);
            showToast('Erro ao exportar');
        }
    };

    return (
        <Frame>
            <Page
                title="Custos de Produtos (COGS)"
                subtitle="Gerencie o custo dos seus produtos para cálculo preciso do lucro"
                primaryAction={{
                    content: 'Importar CSV',
                    onAction: () => setImportModalOpen(true),
                }}
                secondaryActions={[
                    { content: 'Exportar CSV', onAction: handleExport },
                ]}
            >
                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <TextField
                                    label=""
                                    labelHidden
                                    placeholder="Buscar por SKU ou nome do produto..."
                                    value={searchValue}
                                    onChange={setSearchValue}
                                    clearButton
                                    onClearButtonClick={() => setSearchValue('')}
                                />

                                {loading ? (
                                    <InlineStack align="center">
                                        <Spinner />
                                    </InlineStack>
                                ) : filteredProducts.length === 0 ? (
                                    <EmptyState
                                        heading="Nenhum custo cadastrado"
                                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                        action={{
                                            content: 'Importar CSV',
                                            onAction: () => setImportModalOpen(true),
                                        }}
                                    >
                                        <p>Importe um arquivo CSV com os custos dos seus produtos ou adicione manualmente.</p>
                                    </EmptyState>
                                ) : (
                                    <ResourceList
                                        resourceName={{ singular: 'produto', plural: 'produtos' }}
                                        items={filteredProducts}
                                        renderItem={(product) => (
                                            <ResourceItem
                                                id={product.id}
                                                name={product.productTitle || product.sku}
                                                shortcutActions={[
                                                    { content: 'Editar', onAction: () => handleEdit(product) },
                                                    { content: 'Remover', onAction: () => handleDelete(product.variantId || product.id) },
                                                ]}
                                            >
                                                <InlineStack align="space-between" blockAlign="center">
                                                    <BlockStack gap="100">
                                                        <Text variant="bodyMd" fontWeight="semibold">
                                                            {product.productTitle || 'Produto sem nome'}
                                                        </Text>
                                                        <Text variant="bodySm" tone="subdued">
                                                            SKU: {product.sku || 'N/A'}
                                                        </Text>
                                                    </BlockStack>
                                                    <Badge tone="success">
                                                        {formatCurrency(product.cogs || 0)}
                                                    </Badge>
                                                </InlineStack>
                                            </ResourceItem>
                                        )}
                                    />
                                )}
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                {/* Edit Modal */}
                <Modal
                    open={editModalOpen}
                    onClose={() => setEditModalOpen(false)}
                    title="Editar Custo"
                    primaryAction={{
                        content: 'Salvar',
                        onAction: handleSaveCogs,
                    }}
                    secondaryActions={[
                        { content: 'Cancelar', onAction: () => setEditModalOpen(false) },
                    ]}
                >
                    <Modal.Section>
                        <BlockStack gap="400">
                            <Text variant="bodyMd">
                                Produto: {selectedProduct?.productTitle || selectedProduct?.sku}
                            </Text>
                            <TextField
                                label="Custo (COGS)"
                                type="number"
                                value={editCogs}
                                onChange={setEditCogs}
                                prefix="R$"
                                autoComplete="off"
                            />
                        </BlockStack>
                    </Modal.Section>
                </Modal>

                {/* Import Modal */}
                <Modal
                    open={importModalOpen}
                    onClose={() => {
                        setImportModalOpen(false);
                        setImportFile(null);
                        setImportResult(null);
                    }}
                    title="Importar Custos via CSV"
                    primaryAction={{
                        content: 'Importar',
                        onAction: handleImport,
                        loading: importLoading,
                        disabled: !importFile,
                    }}
                    secondaryActions={[
                        { content: 'Cancelar', onAction: () => setImportModalOpen(false) },
                    ]}
                >
                    <Modal.Section>
                        <BlockStack gap="400">
                            <Text variant="bodyMd">
                                Faça upload de um arquivo CSV com as colunas: <strong>SKU</strong> (ou Variant ID) e <strong>Custo</strong>.
                            </Text>

                            <DropZone
                                accept=".csv"
                                type="file"
                                onDrop={handleDropZoneDrop}
                            >
                                {importFile ? (
                                    <BlockStack gap="200" inlineAlign="center">
                                        <Text variant="bodySm">Arquivo selecionado:</Text>
                                        <Text variant="bodyMd" fontWeight="semibold">{importFile.name}</Text>
                                    </BlockStack>
                                ) : (
                                    <DropZone.FileUpload actionHint="ou arraste um arquivo CSV" />
                                )}
                            </DropZone>

                            {importResult && (
                                <Banner
                                    title={importResult.success ? 'Importação concluída' : 'Erro na importação'}
                                    status={importResult.success ? 'success' : 'critical'}
                                >
                                    <p>{importResult.message}</p>
                                    {importResult.results && (
                                        <Text variant="bodySm">
                                            Importados: {importResult.results.success} | Ignorados: {importResult.results.skipped}
                                        </Text>
                                    )}
                                </Banner>
                            )}
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
