import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { useOrganization } from '../../context/OrganizationContext';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { useTheme } from '../../context/ThemeContext';
import { isTauriEnvironment } from '../../storage';
import {
  Search,
  X,
  LayoutDashboard,
  PackagePlus,
  ShoppingCart,
  Users,
  ClipboardList,
  Barcode,
  ArrowLeftRight,
  Warehouse as WarehouseIcon,
  MapPin,
  ShoppingBag,
  Shirt,
  Ruler,
  Layers,
  Bookmark,
  Award,
  Sun,
  Palette,
  FolderTree,
  Tag,
  Truck,
  Boxes,
  Calculator,
  BarChart3,
  Receipt,
  Wallet,
  CheckSquare,
  Scale,
  FileText,
  FileSpreadsheet,
  Globe,
  Clock,
  Settings,
  Building2,
  HardDrive,
  ArrowUpCircle,
  Moon,
  Monitor,
  RefreshCw,
  Plus,
  CornerDownLeft,
  SlidersHorizontal,
  MessageSquare,
  Scissors,
} from 'lucide-react';

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
  onSyncNow?: () => void;
  onOpenCreateOrg?: () => void;
  onOpenFeedback?: () => void;
}

interface SearchableItem {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
  route?: string;
  action?: () => void;
  badge?: string;
  visible?: boolean;
}

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSyncNow,
  onOpenCreateOrg,
  onOpenFeedback,
}) => {
  const { t, locale } = useTranslation();
  const { permissions, isOwner } = useOrganization();
  const { hasAccess } = useModuleAccess();
  const { setTheme } = useTheme();
  const isDesktop = isTauriEnvironment();
  const isRtl = false;

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasBarcode = hasAccess('barcode');
  const hasAccounting = hasAccess('accounting');
  const hasWooCommerce = hasAccess('woocommerce');
  const hasProduction = hasAccess('production') || hasAccess('produce');

  const isItalian = locale === 'it';

  // Build the complete searchable catalog
  const allItems: SearchableItem[] = useMemo(() => {
    return [
      // 1. Dashboard
      {
        id: 'nav_dashboard',
        title: t('navigation.dashboard', 'Dashboard'),
        category: t('navigation.dashboard', 'Dashboard'),
        keywords: ['dashboard', 'home', 'main', 'overview', 'stats', 'panoramica', 'bacheca'],
        icon: LayoutDashboard,
        route: 'dashboard',
        visible: true,
      },

      // 2. Orders & Customers
      {
        id: 'nav_order_create',
        title: t('navigation.createOrder', 'Create Order'),
        category: t('navigation.ordersGroup', 'Orders & Sales'),
        keywords: ['order', 'create', 'invoice', 'pos', 'sale', 'nuovo ordine', 'vendita', 'cassa'],
        icon: PackagePlus,
        route: 'orders/create',
        visible: permissions.canCreateOrders,
      },
      {
        id: 'nav_order_all',
        title: t('navigation.allOrders', 'All Orders'),
        category: t('navigation.ordersGroup', 'Orders & Sales'),
        keywords: ['orders', 'sales', 'invoices', 'ordini', 'vendite', 'fatture'],
        icon: ShoppingCart,
        route: 'orders/all',
        visible: permissions.canViewOrders,
      },
      {
        id: 'nav_customers',
        title: t('navigation.allCustomers', 'Customers'),
        category: t('navigation.ordersGroup', 'Orders & Sales'),
        keywords: ['customers', 'clients', 'buyers', 'clienti'],
        icon: Users,
        route: 'customers/all',
        visible: permissions.canViewCustomers,
      },

      // 3. Inventory & Warehouses
      {
        id: 'nav_inv_overview',
        title: t('navigation.inventoryOverview', 'Inventory Overview'),
        category: t('navigation.inventoryGroup', 'Inventory & Warehouses'),
        keywords: ['inventory', 'stock', 'warehouse', 'inventario', 'magazzino', 'giacenze'],
        icon: ClipboardList,
        route: 'inventory/overview',
        visible: permissions.canViewInventory,
      },
      {
        id: 'nav_inv_barcodes',
        title: t('navigation.barcodePrint', 'Barcode & Label Printing'),
        category: t('navigation.inventoryGroup', 'Inventory & Warehouses'),
        keywords: ['barcode', 'print', 'label', 'tag', 'codice a barre', 'stampa', 'etichette'],
        icon: Barcode,
        route: 'inventory/barcodes',
        badge: !hasBarcode ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewInventory,
      },
      {
        id: 'nav_inv_movements',
        title: t('navigation.stockMovements', 'Stock Movements'),
        category: t('navigation.inventoryGroup', 'Inventory & Warehouses'),
        keywords: ['movements', 'logs', 'history', 'movimenti', 'carico', 'scarico'],
        icon: ClipboardList,
        route: 'inventory/movements',
        visible: permissions.canViewInventory,
      },
      {
        id: 'nav_inv_transfers',
        title: t('navigation.stockTransfers', 'Stock Transfers'),
        category: t('navigation.inventoryGroup', 'Inventory & Warehouses'),
        keywords: ['transfer', 'transfers', 'trasferimenti', 'spostamento'],
        icon: ArrowLeftRight,
        route: 'inventory/transfers',
        visible: permissions.canManageInventory,
      },
      {
        id: 'nav_inv_warehouses',
        title: t('navigation.warehouses', 'Warehouses & Stores'),
        category: t('navigation.inventoryGroup', 'Inventory & Warehouses'),
        keywords: ['warehouses', 'stores', 'branches', 'magazzini', 'negozi'],
        icon: WarehouseIcon,
        route: 'inventory/warehouses',
        visible: permissions.canManageInventory,
      },
      {
        id: 'nav_inv_locations',
        title: t('navigation.warehouseLocations', 'Warehouse Locations'),
        category: t('navigation.inventoryGroup', 'Inventory & Warehouses'),
        keywords: ['locations', 'racks', 'shelves', 'bins', 'ubicazioni', 'scaffali'],
        icon: MapPin,
        route: 'inventory/locations',
        visible: permissions.canManageInventory,
      },

      // 4. Products & Catalog
      {
        id: 'nav_prod_all',
        title: t('navigation.allProducts', 'All Products'),
        category: t('navigation.productsGroup', 'Products & Catalog'),
        keywords: ['products', 'items', 'apparel', 'fashion', 'prodotti', 'articoli', 'catalogo'],
        icon: ShoppingBag,
        route: 'products/all',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_prod_variants',
        title: t('navigation.variants', 'Variants (Color & Size)'),
        category: t('navigation.productsGroup', 'Products & Catalog'),
        keywords: ['variants', 'skus', 'color', 'size', 'varianti', 'taglie', 'colori'],
        icon: Shirt,
        route: 'products/variants',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_prod_sizeguides',
        title: t('navigation.sizeGuides', 'Size Guides'),
        category: t('navigation.productsGroup', 'Products & Catalog'),
        keywords: ['size guide', 'measurements', 'fit', 'guida taglie', 'misure'],
        icon: Ruler,
        route: 'products/size-guides',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_cat_categories',
        title: t('navigation.categories', 'Categories'),
        category: t('navigation.catalogAttributes', 'Catalog Attributes'),
        keywords: ['categories', 'groups', 'categorie'],
        icon: Layers,
        route: 'products/categories',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_cat_collections',
        title: t('navigation.collections', 'Collections'),
        category: t('navigation.catalogAttributes', 'Catalog Attributes'),
        keywords: ['collections', 'series', 'collezioni'],
        icon: Bookmark,
        route: 'products/collections',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_cat_brands',
        title: t('navigation.brands', 'Brands'),
        category: t('navigation.catalogAttributes', 'Catalog Attributes'),
        keywords: ['brands', 'labels', 'marchi'],
        icon: Award,
        route: 'products/brands',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_cat_seasons',
        title: t('navigation.seasons', 'Seasons'),
        category: t('navigation.catalogAttributes', 'Catalog Attributes'),
        keywords: ['seasons', 'spring', 'summer', 'autumn', 'winter', 'stagioni'],
        icon: Sun,
        route: 'products/seasons',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_cat_colors',
        title: t('navigation.colors', 'Colors'),
        category: t('navigation.catalogAttributes', 'Catalog Attributes'),
        keywords: ['colors', 'palette', 'colori'],
        icon: Palette,
        route: 'products/colors',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_cat_sizegroups',
        title: t('navigation.sizeGroups', 'Size Groups'),
        category: t('navigation.catalogAttributes', 'Catalog Attributes'),
        keywords: ['size groups', 'gruppi taglie'],
        icon: FolderTree,
        route: 'products/size-groups',
        visible: permissions.canViewProducts,
      },
      {
        id: 'nav_cat_sizes',
        title: t('navigation.sizes', 'Sizes'),
        category: t('navigation.catalogAttributes', 'Catalog Attributes'),
        keywords: ['sizes', 'small', 'medium', 'large', 'taglie'],
        icon: Tag,
        route: 'products/sizes',
        visible: permissions.canViewProducts,
      },

      // 4.5 Production & Manufacturing
      {
        id: 'nav_production_overview',
        title: t('navigation.productionOverview', 'Production Overview'),
        category: t('navigation.productionGroup', 'Production & Manufacturing'),
        keywords: ['production', 'manufacturing', 'overview', 'produzione', 'laboratorio'],
        icon: Scissors,
        route: 'production/overview',
        badge: !hasProduction ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: true,
      },
      {
        id: 'nav_production_materials',
        title: t('navigation.rawMaterials', 'Raw Materials'),
        category: t('navigation.productionGroup', 'Production & Manufacturing'),
        keywords: ['raw materials', 'fabric', 'trims', 'materie prime', 'tessuti'],
        icon: Boxes,
        route: 'production/materials',
        badge: !hasProduction ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: true,
      },
      {
        id: 'nav_production_boms',
        title: t('navigation.boms', 'Bill of Materials (BOM)'),
        category: t('navigation.productionGroup', 'Production & Manufacturing'),
        keywords: ['bom', 'bill of materials', 'recipe', 'distinta base'],
        icon: FileText,
        route: 'production/boms',
        badge: !hasProduction ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: true,
      },
      {
        id: 'nav_production_orders',
        title: t('navigation.productionOrders', 'Production Orders'),
        category: t('navigation.productionGroup', 'Production & Manufacturing'),
        keywords: ['work order', 'cut order', 'production order', 'ordini produzione'],
        icon: Shirt,
        route: 'production/orders',
        badge: !hasProduction ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: true,
      },
      {
        id: 'nav_production_contractors',
        title: t('navigation.contractors', 'Contractors'),
        category: t('navigation.productionGroup', 'Production & Manufacturing'),
        keywords: ['contractors', 'tailors', 'workshops', 'terzisti', 'sarti'],
        icon: Users,
        route: 'production/contractors',
        badge: !hasProduction ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: true,
      },

      // 5. Purchasing & Suppliers
      {
        id: 'nav_pur_orders',
        title: t('navigation.purchaseOrders', 'Purchase Orders'),
        category: t('navigation.purchasingGroup', 'Purchasing & Procurement'),
        keywords: ['purchase', 'procurement', 'po', 'acquisti', 'ordini acquisto'],
        icon: Truck,
        route: 'purchasing/orders',
        visible: permissions.canViewPurchasing,
      },
      {
        id: 'nav_pur_suppliers',
        title: t('navigation.suppliers', 'Suppliers'),
        category: t('navigation.purchasingGroup', 'Purchasing & Procurement'),
        keywords: ['suppliers', 'vendors', 'fornitori'],
        icon: Boxes,
        route: 'purchasing/suppliers',
        visible: permissions.canViewPurchasing,
      },

      // 6. Accounting & Finance Suite
      {
        id: 'nav_acc_dash',
        title: t('navigation.accountingDashboard', 'Financial Dashboard & P&L'),
        category: t('navigation.accountingGroup', 'Accounting & Finance'),
        keywords: ['p&l', 'accounting', 'finance', 'profit', 'loss', 'contabilita', 'bilancio'],
        icon: BarChart3,
        route: 'accounting/dashboard',
        badge: !hasAccounting ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewFinancials,
      },
      {
        id: 'nav_acc_expenses',
        title: t('navigation.expenses', 'Expenses'),
        category: t('navigation.accountingGroup', 'Accounting & Finance'),
        keywords: ['expenses', 'costs', 'bills', 'spese', 'costi'],
        icon: Receipt,
        route: 'accounting/expenses',
        badge: !hasAccounting ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewFinancials,
      },
      {
        id: 'nav_acc_persons',
        title: t('navigation.personAccounts', 'Customer & Supplier Ledgers'),
        category: t('navigation.accountingGroup', 'Accounting & Finance'),
        keywords: ['ledger', 'balance', 'receivables', 'payables', 'partitari', 'saldi'],
        icon: Users,
        route: 'accounting/persons',
        badge: !hasAccounting ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewFinancials,
      },
      {
        id: 'nav_acc_accounts',
        title: t('navigation.financialAccounts', 'Bank Accounts & Cashboxes'),
        category: t('navigation.accountingGroup', 'Accounting & Finance'),
        keywords: ['accounts', 'cashbox', 'bank', 'pos', 'treasury', 'banche', 'casse', 'tesoreria'],
        icon: Wallet,
        route: 'accounting/accounts',
        badge: !hasAccounting ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewFinancials,
      },
      {
        id: 'nav_acc_landed',
        title: t('navigation.landedCosts', 'Landed Costs'),
        category: t('navigation.accountingGroup', 'Accounting & Finance'),
        keywords: ['landed cost', 'freight', 'customs', 'costi accessori', 'spedizione'],
        icon: Scale,
        route: 'accounting/landed-costs',
        badge: !hasAccounting ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewFinancials,
      },
      {
        id: 'nav_acc_tax',
        title: t('navigation.taxReports', 'VAT & Tax Reports'),
        category: t('navigation.accountingGroup', 'Accounting & Finance'),
        keywords: ['tax', 'vat', 'iva', 'report fiscali'],
        icon: FileText,
        route: 'accounting/tax',
        badge: !hasAccounting ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewFinancials,
      },
      {
        id: 'nav_acc_export',
        title: t('navigation.accountingExport', 'Accounting Export'),
        category: t('navigation.accountingGroup', 'Accounting & Finance'),
        keywords: ['export', 'csv', 'journal', 'esportazione', 'prima nota'],
        icon: FileSpreadsheet,
        route: 'accounting/export',
        badge: !hasAccounting ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewFinancials,
      },

      // 7. Reports
      {
        id: 'nav_reports_apparel',
        title: t('navigation.apparelReports', 'Reports & Analytics'),
        category: t('navigation.reportsGroup', 'Reports & Analytics'),
        keywords: ['reports', 'analytics', 'charts', 'report', 'analisi'],
        icon: BarChart3,
        route: 'reports/apparel',
        visible: permissions.canViewOrders || permissions.canViewFinancials,
      },

      // 8. WooCommerce Integration
      {
        id: 'nav_wc_overview',
        title: t('navigation.wcOverview', 'WooCommerce Sync Overview'),
        category: t('navigation.woocommerceGroup', 'WooCommerce Store'),
        keywords: ['woocommerce', 'sync', 'online store', 'wordpress'],
        icon: Globe,
        route: 'sales/woocommerce',
        badge: !hasWooCommerce ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewOrders,
      },
      {
        id: 'nav_wc_mappings',
        title: t('navigation.wcMappings', 'Product & Variant Mappings'),
        category: t('navigation.woocommerceGroup', 'WooCommerce Store'),
        keywords: ['mappings', 'sku', 'mappatura'],
        icon: Layers,
        route: 'sales/woocommerce/mappings',
        badge: !hasWooCommerce ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewOrders,
      },
      {
        id: 'nav_wc_logs',
        title: t('navigation.wcLogs', 'WooCommerce Sync Logs'),
        category: t('navigation.woocommerceGroup', 'WooCommerce Store'),
        keywords: ['logs', 'webhooks', 'registro'],
        icon: Clock,
        route: 'sales/woocommerce/logs',
        badge: !hasWooCommerce ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewOrders,
      },
      {
        id: 'nav_wc_settings',
        title: t('navigation.wcSettings', 'WooCommerce API Settings'),
        category: t('navigation.woocommerceGroup', 'WooCommerce Store'),
        keywords: ['api', 'woocommerce settings', 'impostazioni woocommerce'],
        icon: Settings,
        route: 'sales/woocommerce/settings',
        badge: !hasWooCommerce ? t('navigation.moduleBadge', 'Add-on') : undefined,
        visible: permissions.canViewOrders,
      },

      // 9. Settings
      {
        id: 'nav_set_org',
        title: t('navigation.settingsGeneral', 'Organization & Store Profile'),
        category: t('navigation.settingsGroup', 'Settings'),
        keywords: ['settings', 'org', 'organization', 'currency', 'euro', 'impostazioni', 'azienda'],
        icon: Building2,
        route: 'settings/org',
        visible: true,
      },
      {
        id: 'nav_set_members',
        title: t('navigation.settingsMembers', 'Team Members & Roles'),
        category: t('navigation.settingsGroup', 'Settings'),
        keywords: ['members', 'users', 'roles', 'permissions', 'team', 'utenti', 'ruoli'],
        icon: Users,
        route: 'settings/members',
        visible: permissions.canManageUsers || isOwner,
      },
      {
        id: 'nav_set_modules',
        title: t('navigation.settingsModules', 'Modules, Licenses & Subscription'),
        category: t('navigation.settingsGroup', 'Settings'),
        keywords: ['modules', 'pro', 'subscription', 'license', 'moduli', 'abbonamento'],
        icon: Boxes,
        route: 'settings/modules',
        visible: true,
      },
      {
        id: 'nav_set_sync',
        title: t('navigation.settingsSync', 'Database, Sync & Backup'),
        category: t('navigation.settingsGroup', 'Settings'),
        keywords: ['sqlite', 'sync', 'backup', 'restore', 'json', 'sincronizzazione'],
        icon: HardDrive,
        route: 'settings/sync',
        visible: true,
      },
      {
        id: 'nav_set_appearance',
        title: t('navigation.settingsAppearance', 'Appearance, Theme & Language'),
        category: t('navigation.settingsGroup', 'Settings'),
        keywords: ['appearance', 'theme', 'dark', 'light', 'language', 'aspetto', 'tema', 'lingua'],
        icon: Palette,
        route: 'settings/appearance',
        visible: true,
      },
      ...(isDesktop
        ? [
            {
              id: 'nav_set_updater',
              title: t('navigation.settingsUpdater', 'Desktop App Updates'),
              category: t('navigation.settingsGroup', 'Settings'),
              keywords: ['update', 'version', 'aggiornamenti'],
              icon: ArrowUpCircle,
              route: 'settings/updater',
              visible: true,
            },
          ]
        : []),

      // 10. Quick Actions
      {
        id: 'act_theme_light',
        title: t('settings.themeLight', 'Switch to Light Mode'),
        category: t('common.quickSearchQuickActions', 'Quick Actions'),
        keywords: ['light theme', 'light mode', 'tema chiaro'],
        icon: Sun,
        action: () => setTheme('light'),
        visible: true,
      },
      {
        id: 'act_theme_dark',
        title: t('settings.themeDark', 'Switch to Dark Mode'),
        category: t('common.quickSearchQuickActions', 'Quick Actions'),
        keywords: ['dark theme', 'dark mode', 'tema scuro'],
        icon: Moon,
        action: () => setTheme('dark'),
        visible: true,
      },
      {
        id: 'act_theme_system',
        title: t('settings.themeSystem', 'Use System Theme'),
        category: t('common.quickSearchQuickActions', 'Quick Actions'),
        keywords: ['system theme', 'auto', 'tema di sistema'],
        icon: Monitor,
        action: () => setTheme('system'),
        visible: true,
      },
      ...(onSyncNow
        ? [
            {
              id: 'act_sync_now',
              title: t('common.syncNow', 'Sync with Cloud Now'),
              category: t('common.quickSearchQuickActions', 'Quick Actions'),
              keywords: ['sync now', 'cloud sync', 'sincronizza'],
              icon: RefreshCw,
              action: onSyncNow,
              visible: true,
            },
          ]
        : []),
      ...(onOpenCreateOrg
        ? [
            {
              id: 'act_create_org',
              title: t('common.createNewOrg', 'Create New Organization / Branch'),
              category: t('common.quickSearchQuickActions', 'Quick Actions'),
              keywords: ['new org', 'create organization', 'branch', 'nuova azienda'],
              icon: Plus,
              action: onOpenCreateOrg,
              visible: true,
            },
          ]
        : []),
      ...(onOpenFeedback
        ? [
            {
              id: 'act_send_feedback',
              title: t('common.feedback', 'Send Feedback'),
              category: t('common.quickSearchQuickActions', 'Quick Actions'),
              keywords: ['feedback', 'bug', 'suggestion', 'support', 'segnalazione'],
              icon: MessageSquare,
              action: onOpenFeedback,
              visible: true,
            },
          ]
        : []),
    ].filter((item) => item.visible !== false);
  }, [t, permissions, isOwner, hasBarcode, hasAccounting, hasWooCommerce, hasProduction, isDesktop, setTheme, onSyncNow, onOpenCreateOrg, onOpenFeedback]);

  // String normalizer for search
  const normalize = (str: string) => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Filter items based on query
  const filteredItems = useMemo(() => {
    const q = normalize(query);
    if (!q) {
      // Default: show popular/essential navigation items
      return allItems.slice(0, 10);
    }

    return allItems.filter((item) => {
      const matchTitle = normalize(item.title).includes(q);
      const matchCategory = normalize(item.category).includes(q);
      const matchKeywords = item.keywords.some((kw) => normalize(kw).includes(q));
      return matchTitle || matchCategory || matchKeywords;
    });
  }, [allItems, query]);

  // Focus input and reset query on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleSelect(filteredItems[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  // Auto scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = (item: SearchableItem) => {
    onClose();
    if (item.action) {
      item.action();
    } else if (item.route) {
      onNavigate(item.route);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-14 sm:pt-20 px-4 pb-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-900/60 dark:bg-black/80 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#14161c] rounded-2xl shadow-2xl border border-neutral-200/90 dark:border-neutral-800 overflow-hidden z-10 animate-scale-up text-neutral-800 dark:text-neutral-200">
        {/* Search Header Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-200/80 dark:border-neutral-800">
          <Search className="w-5 h-5 text-neutral-400 dark:text-neutral-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t('common.quickSearchPlaceholder', isItalian ? 'Cerca una pagina o azione...' : 'Search pages or actions...')}
            className="w-full bg-transparent text-sm sm:text-base font-medium text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-[380px] sm:max-h-[440px] overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 mx-auto flex items-center justify-center mb-3">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-300">
                {t('common.quickSearchNoResults', isItalian ? 'Nessuna pagina o azione trovata' : 'No matching pages or actions found')}
              </p>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                {isItalian
                  ? 'Prova parole come "inventario", "ordini", "prodotti", "codice a barre", "contabilità" o "impostazioni".'
                  : 'Try keywords like "inventory", "orders", "products", "barcode", "accounting", or "settings".'}
              </p>
            </div>
          ) : (
            <>
              {!query && (
                <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  {t('common.quickSearchRecentPages', isItalian ? 'Pagine frequenti' : 'Popular Pages')}
                </div>
              )}
              {filteredItems.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={item.id}
                    data-index={index}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-start transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950 shadow-sm'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/80 text-neutral-700 dark:text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-white/15 dark:bg-neutral-900/15 text-white dark:text-neutral-900'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs sm:text-sm font-semibold truncate leading-tight">
                            {item.title}
                          </p>
                          {item.badge && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                                isSelected
                                  ? 'bg-white/20 dark:bg-neutral-900/20 text-white dark:text-neutral-900'
                                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-[10px] truncate mt-0.5 ${
                            isSelected
                              ? 'text-neutral-300 dark:text-neutral-600'
                              : 'text-neutral-400 dark:text-neutral-500'
                          }`}
                        >
                          {item.category}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ps-2">
                      {isSelected ? (
                        <div className="flex items-center gap-1 text-[11px] font-medium opacity-90">
                          <span className="hidden sm:inline">{t('common.quickSearchNavigateHint', isItalian ? 'Apri' : 'Open')}</span>
                          <CornerDownLeft className="w-3.5 h-3.5" />
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-4 py-2.5 bg-neutral-50 dark:bg-[#101217] border-t border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-[10px]">
                ↑↓
              </kbd>
              <span>{isItalian ? 'Naviga' : 'Navigate'}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-[10px]">
                ↵ Enter
              </kbd>
              <span>{isItalian ? 'Seleziona' : 'Select'}</span>
            </span>
          </div>

          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-[10px]">
              Esc
            </kbd>
            <span>{isItalian ? 'Chiudi' : 'Close'}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
