import { DriveStep } from 'driver.js';
import { TourDefinition } from '../types';
import { BRAND } from '../../../config/brand';

export const dashboardTour: TourDefinition = {
  name: 'dashboard',
  getSteps: (t: (key: string, paramsOrFallback?: any, fallback?: string) => string, isRtl: boolean): DriveStep[] => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

    const steps: DriveStep[] = [
      // Step 1: Welcome & Dashboard KPI Ribbon
      {
        element: '#tour-dashboard-ribbon',
        popover: {
          title: t('onboarding.dashboard.welcome.title', `Welcome to ${BRAND.name}!`),
          description: t(
            'onboarding.dashboard.welcome.description',
            'Your integrated platform for apparel, inventory, and supply chain management. Track live stock levels, total inventory value, active variants, and periodic sales at a glance.'
          ),
          side: 'bottom',
          align: 'center',
        },
      },
      // Step 2: Quick Operational Actions
      {
        element: '#tour-quick-actions',
        popover: {
          title: t('onboarding.dashboard.quickActions.title', 'Quick Actions'),
          description: t(
            'onboarding.dashboard.quickActions.description',
            'One-click shortcuts to create sales orders, add new products, issue purchase orders, and manage daily store operations.'
          ),
          side: 'bottom',
          align: 'center',
        },
      },
    ];

    if (isMobile) {
      // Step 3 (Mobile): Mobile Navigation Hamburger Menu
      steps.push({
        element: '#tour-mobile-menu-btn',
        popover: {
          title: t('onboarding.dashboard.mobileNavigation.title', 'Navigation Menu'),
          description: t(
            'onboarding.dashboard.mobileNavigation.description',
            'Tap this menu on mobile to access Products & Catalog, Inventory, Orders, Accounting, Reports, and Settings.'
          ),
          side: 'bottom',
          align: isRtl ? 'start' : 'end',
        },
      });
    } else {
      // Step 3, 4, 5 (Desktop): Sidebar Menu Items
      steps.push(
        // Products & Catalog
        {
          element: '#tour-nav-products',
          popover: {
            title: t('onboarding.dashboard.products.title', 'Products & Apparel Catalog'),
            description: t(
              'onboarding.dashboard.products.description',
              'Manage color & size variant matrices, interactive size guides, attributes, categories, seasons, and brands tailored for fashion.'
            ),
            side: isRtl ? 'left' : 'right',
            align: 'start',
          },
        },
        // Inventory & Multi-Warehouse
        {
          element: '#tour-nav-inventory',
          popover: {
            title: t('onboarding.dashboard.inventory.title', 'Inventory, Stock & Barcodes'),
            description: t(
              'onboarding.dashboard.inventory.description',
              'Control multi-warehouse stock, inter-warehouse transfers, stock movement logs, low-stock alerts, and thermal barcode label printing.'
            ),
            side: isRtl ? 'left' : 'right',
            align: 'start',
          },
        },
        // Orders & Sales
        {
          element: '#tour-nav-orders',
          popover: {
            title: t('onboarding.dashboard.orders.title', 'Sales, Invoices & Customers'),
            description: t(
              'onboarding.dashboard.orders.description',
              'Create sales orders with instant stock deduction, cash/card POS settlements, customer ledger updates, and buyer profiles.'
            ),
            side: isRtl ? 'left' : 'right',
            align: 'start',
          },
        }
      );
    }

    // Common remaining steps: Analytics & Header Organization
    steps.push(
      // Analytics & Intelligence Charts
      {
        element: '#tour-analytics-charts',
        popover: {
          title: t('onboarding.dashboard.analytics.title', 'Smart Analytics & Charts'),
          description: t(
            'onboarding.dashboard.analytics.description',
            'Sales trends, inbound/outbound stock flow, category breakdown, and inventory health metrics for informed decisions.'
          ),
          side: 'top',
          align: 'center',
        },
      },
      // Organization & Cloud Sync
      {
        element: '#tour-header-org',
        popover: {
          title: t('onboarding.dashboard.settings.title', 'Organization, Team & Cloud Sync'),
          description: t(
            'onboarding.dashboard.settings.description',
            'Manage store profile, team access roles, one-click offline backups, and real-time Cloud Sync.'
          ),
          side: 'bottom',
          align: isRtl ? 'start' : 'end',
        },
      }
    );

    return steps;
  },
};
