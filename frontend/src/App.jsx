/**
 * CFO de Bolso - Main App Component
 * React app with routing and Shopify Polaris providers
 */

import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
    AppProvider,
    Frame,
    Navigation,
    TopBar,
} from '@shopify/polaris';
import {
    HomeIcon,
    ProductIcon,
    CashDollarIcon,
    SettingsIcon,
    ChartVerticalFilledIcon,
} from '@shopify/polaris-icons';
import ptBR from '@shopify/polaris/locales/pt-BR.json';

// Components
import Dashboard from './components/Dashboard';
import COGSManager from './components/COGSManager';
import AdPlatforms from './components/AdPlatforms';
import FixedCosts from './components/FixedCosts';
import { AuthProvider } from './hooks/useAuth';

// Navigation items
const navigationItems = [
    {
        url: '/',
        label: 'Dashboard',
        icon: HomeIcon,
        exactMatch: true,
    },
    {
        url: '/cogs',
        label: 'Custos de Produtos',
        icon: ProductIcon,
    },
    {
        url: '/ads',
        label: 'Plataformas de Anúncios',
        icon: ChartVerticalFilledIcon,
    },
    {
        url: '/fixed-costs',
        label: 'Custos Fixos',
        icon: CashDollarIcon,
    },
];

function AppNavigation() {
    const location = useLocation();

    return (
        <Navigation location={location.pathname}>
            <Navigation.Section
                items={navigationItems.map((item) => ({
                    ...item,
                    selected: item.exactMatch
                        ? location.pathname === item.url
                        : location.pathname.startsWith(item.url),
                }))}
            />
        </Navigation>
    );
}

function AppFrame() {
    const logo = {
        width: 40,
        topBarSource: 'https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg',
        accessibilityLabel: 'CFO de Bolso',
    };

    const topBarMarkup = (
        <TopBar
            showNavigationToggle
            userMenu={
                <TopBar.UserMenu
                    name="Minha Loja"
                    initials="ML"
                    open={false}
                    onToggle={() => { }}
                />
            }
        />
    );

    return (
        <Frame
            logo={logo}
            topBar={topBarMarkup}
            navigation={<AppNavigation />}
        >
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cogs" element={<COGSManager />} />
                <Route path="/ads" element={<AdPlatforms />} />
                <Route path="/fixed-costs" element={<FixedCosts />} />
                <Route path="/settings/*" element={<SettingsRoutes />} />
            </Routes>
        </Frame>
    );
}

function SettingsRoutes() {
    return (
        <Routes>
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/ads" element={<AdPlatforms />} />
        </Routes>
    );
}

function BillingPage() {
    return (
        <div style={{ padding: '20px' }}>
            <h1>Planos e Faturamento</h1>
            <p>Em desenvolvimento...</p>
        </div>
    );
}

export default function App() {
    // Get shop from URL
    const urlParams = new URLSearchParams(window.location.search);
    const shop = urlParams.get('shop');

    return (
        <AppProvider i18n={ptBR}>
            <AuthProvider shopOrigin={shop}>
                <BrowserRouter>
                    <AppFrame />
                </BrowserRouter>
            </AuthProvider>
        </AppProvider>
    );
}
