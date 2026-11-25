import { UserRole } from '../types';

export interface RolePermissions {
  canManageOrgSettings: boolean;
  canManageUsers: boolean;
  canViewProducts: boolean;
  canEditProducts: boolean;
  canDeleteProducts: boolean;
  canViewInventory: boolean;
  canManageInventory: boolean;
  canViewOrders: boolean;
  canCreateOrders: boolean;
  canEditOrders: boolean;
  canViewPurchasing: boolean;
  canManagePurchasing: boolean;
  canViewCustomers: boolean;
  canManageCustomers: boolean;
  canViewFinancials: boolean;
  canViewProduction: boolean;
  canManageProduction: boolean;
}

export interface RoleDefinition {
  key: UserRole;
  labelEn: string;
  labelIt: string;
  descriptionEn: string;
  descriptionIt: string;
  badgeVariant: 'primary' | 'secondary' | 'info' | 'warning' | 'neutral';
  permissions: RolePermissions;
}

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  owner: {
    key: 'owner',
    labelEn: 'Organization Owner',
    labelIt: 'Proprietario Organizzazione',
    descriptionEn: 'Full access to all system features, financial management, team members, and organization settings.',
    descriptionIt: 'Accesso completo a tutte le funzionalità, gestione finanziaria, membri del team e impostazioni dell’organizzazione.',
    badgeVariant: 'primary',
    permissions: {
      canManageOrgSettings: true,
      canManageUsers: true,
      canViewProducts: true,
      canEditProducts: true,
      canDeleteProducts: true,
      canViewInventory: true,
      canManageInventory: true,
      canViewOrders: true,
      canCreateOrders: true,
      canEditOrders: true,
      canViewPurchasing: true,
      canManagePurchasing: true,
      canViewCustomers: true,
      canManageCustomers: true,
      canViewFinancials: true,
      canViewProduction: true,
      canManageProduction: true,
    },
  },
  manager: {
    key: 'manager',
    labelEn: 'Store Manager',
    labelIt: 'Responsabile Negozio',
    descriptionEn: 'Store and warehouse management, products, orders, and purchasing (excluding organization settings and member deletion).',
    descriptionIt: 'Gestione negozio e magazzino, prodotti, ordini e acquisti (escluse impostazioni organizzazione ed eliminazione membri).',
    badgeVariant: 'info',
    permissions: {
      canManageOrgSettings: false,
      canManageUsers: true,
      canViewProducts: true,
      canEditProducts: true,
      canDeleteProducts: true,
      canViewInventory: true,
      canManageInventory: true,
      canViewOrders: true,
      canCreateOrders: true,
      canEditOrders: true,
      canViewPurchasing: true,
      canManagePurchasing: true,
      canViewCustomers: true,
      canManageCustomers: true,
      canViewFinancials: true,
      canViewProduction: true,
      canManageProduction: true,
    },
  },
  warehouse: {
    key: 'warehouse',
    labelEn: 'Warehouse Manager',
    labelIt: 'Responsabile Magazzino',
    descriptionEn: 'Full inventory control, warehouses, bins/locations, stock transfers, barcode printing, and purchase receipts.',
    descriptionIt: 'Controllo completo dell’inventario, magazzini, ubicazioni, trasferimenti merce, stampa codici a barre e ricezione acquisti.',
    badgeVariant: 'secondary',
    permissions: {
      canManageOrgSettings: false,
      canManageUsers: false,
      canViewProducts: true,
      canEditProducts: false,
      canDeleteProducts: false,
      canViewInventory: true,
      canManageInventory: true,
      canViewOrders: true,
      canCreateOrders: false,
      canEditOrders: false,
      canViewPurchasing: true,
      canManagePurchasing: true,
      canViewCustomers: false,
      canManageCustomers: false,
      canViewFinancials: false,
      canViewProduction: true,
      canManageProduction: false,
    },
  },
  sales: {
    key: 'sales',
    labelEn: 'Sales Representative',
    labelIt: 'Addetto Vendite / Cassa',
    descriptionEn: 'Access to catalog products, customers, and creating sales orders (without inventory/purchasing administration).',
    descriptionIt: 'Accesso a catalogo prodotti, clienti e creazione ordini di vendita (senza amministrazione magazzino e acquisti).',
    badgeVariant: 'warning',
    permissions: {
      canManageOrgSettings: false,
      canManageUsers: false,
      canViewProducts: true,
      canEditProducts: false,
      canDeleteProducts: false,
      canViewInventory: true,
      canManageInventory: false,
      canViewOrders: true,
      canCreateOrders: true,
      canEditOrders: true,
      canViewPurchasing: false,
      canManagePurchasing: false,
      canViewCustomers: true,
      canManageCustomers: true,
      canViewFinancials: false,
      canViewProduction: false,
      canManageProduction: false,
    },
  },
  viewer: {
    key: 'viewer',
    labelEn: 'Viewer',
    labelIt: 'Osservatore',
    descriptionEn: 'Read-only access to catalog products, inventory levels, and size guides (no write permissions).',
    descriptionIt: 'Accesso in sola lettura a catalogo prodotti, livelli di inventario e guide taglie (nessun permesso di modifica).',
    badgeVariant: 'neutral',
    permissions: {
      canManageOrgSettings: false,
      canManageUsers: false,
      canViewProducts: true,
      canEditProducts: false,
      canDeleteProducts: false,
      canViewInventory: true,
      canManageInventory: false,
      canViewOrders: true,
      canCreateOrders: false,
      canEditOrders: false,
      canViewPurchasing: false,
      canManagePurchasing: false,
      canViewCustomers: true,
      canManageCustomers: false,
      canViewFinancials: false,
      canViewProduction: false,
      canManageProduction: false,
    },
  },
};

export function getRolePermissions(role?: string | null): RolePermissions {
  if (!role) return ROLE_DEFINITIONS.owner.permissions;
  const normalizedRole = role.toLowerCase();
  if (ROLE_DEFINITIONS[normalizedRole as UserRole]) {
    return ROLE_DEFINITIONS[normalizedRole as UserRole].permissions;
  }
  if (normalizedRole === 'admin' || normalizedRole === 'administrator') {
    return ROLE_DEFINITIONS.owner.permissions;
  }
  return ROLE_DEFINITIONS.viewer.permissions;
}

export function getRoleDefinition(role?: string | null): RoleDefinition {
  if (!role) return ROLE_DEFINITIONS.owner;
  const normalizedRole = role.toLowerCase();
  if (ROLE_DEFINITIONS[normalizedRole as UserRole]) {
    return ROLE_DEFINITIONS[normalizedRole as UserRole];
  }
  if (normalizedRole === 'admin' || normalizedRole === 'administrator') {
    return ROLE_DEFINITIONS.owner;
  }
  return ROLE_DEFINITIONS.viewer;
}

export function getRoleLabel(role?: string | null, locale: string = 'en'): string {
  const def = getRoleDefinition(role);
  return locale === 'it' ? def.labelIt : def.labelEn;
}

export function getRoleDescription(role?: string | null, locale: string = 'en'): string {
  const def = getRoleDefinition(role);
  return locale === 'it' ? def.descriptionIt : def.descriptionEn;
}
