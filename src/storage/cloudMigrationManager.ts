import { directusClient } from '../api/directus';
import { BackupManager } from './backupManager';
import { storageManager } from './index';
import { safeSaveCachedUserProfile, safeSetLocalStorageItem } from '../utils/profileCache';

export interface MigrationStepProgress {
  step: string;
  total: number;
  current: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
}

export interface CloudMigrationResult {
  success: boolean;
  totalMigrated: number;
  errors: string[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_FIELDS = new Set(['user_id', 'main_image', 'image', 'receipt_attachment', 'image_front', 'image_back']);

const DIRECTUS_ALLOWED_FIELDS: Record<string, Set<string>> = {
  categories: new Set(['organization_id', 'name', 'slug', 'parent_id', 'status']),
  brands: new Set(['organization_id', 'name', 'slug']),
  seasons: new Set(['organization_id', 'name', 'code', 'start_date', 'end_date', 'status']),
  collections: new Set(['organization_id', 'name', 'slug', 'description', 'status']),
  colors: new Set(['organization_id', 'name', 'code', 'hex', 'status']),
  size_groups: new Set(['organization_id', 'name', 'category', 'status']),
  sizes: new Set(['organization_id', 'size_group_id', 'name', 'code', 'sort', 'status']),
  warehouses: new Set(['organization_id', 'name', 'code', 'type', 'address', 'phone', 'status']),
  warehouse_locations: new Set(['warehouse_id', 'parent_id', 'name', 'code', 'type', 'barcode', 'status']),
  size_guide_templates: new Set(['organization_id', 'name', 'type', 'unit', 'description', 'status']),
  size_guide_measurements: new Set(['template_id', 'name', 'code', 'unit', 'type', 'sort', 'status']),
  size_guide_values: new Set(['template_id', 'measurement_id', 'size_id', 'value', 'min_value', 'max_value', 'sort', 'status']),
  products: new Set(['organization_id', 'status', 'title', 'slug', 'description', 'category_id', 'collection_id', 'season_id', 'size_guide_template_id', 'main_image', 'tags', 'sort', 'brand_id']),
  product_variants: new Set(['organization_id', 'product_id', 'color_id', 'size_id', 'sku', 'barcode', 'price', 'cost', 'image', 'status', 'sort']),
  inventory_items: new Set(['organization_id', 'variant_id', 'warehouse_id', 'location_id', 'quantity', 'reserved_quantity', 'available_quantity', 'damaged_quantity', 'reorder_point', 'safety_stock']),
  inventory_movements: new Set(['organization_id', 'variant_id', 'warehouse_id', 'location_id', 'type', 'quantity', 'reference_type', 'reference_id', 'note', 'user_id', 'created_at']),
  suppliers: new Set(['organization_id', 'name', 'contact_name', 'phone', 'email', 'address', 'notes', 'status', 'balance']),
  customers: new Set(['organization_id', 'name', 'phone', 'email', 'address', 'notes', 'status', 'balance', 'credit_limit']),
  orders: new Set(['organization_id', 'customer_id', 'warehouse_id', 'order_number', 'status', 'payment_status', 'currency', 'subtotal', 'discount', 'tax', 'total', 'notes']),
  order_items: new Set(['organization_id', 'order_id', 'variant_id', 'quantity', 'unit_price', 'discount', 'total', 'returned_quantity']),
  order_returns: new Set(['organization_id', 'return_number', 'original_order_id', 'customer_id', 'warehouse_id', 'pos_shift_id', 'type', 'status', 'reason', 'returned_total', 'exchange_total', 'net_amount', 'settlement_method', 'financial_account_id', 'return_date', 'notes']),
  order_return_items: new Set(['organization_id', 'return_id', 'item_type', 'original_order_item_id', 'variant_id', 'quantity', 'unit_price', 'unit_cost', 'total', 'condition']),
  purchase_orders: new Set(['organization_id', 'purchase_number', 'supplier_id', 'warehouse_id', 'status', 'total_amount', 'paid_amount', 'notes', 'expected_date']),
  purchase_order_items: new Set(['organization_id', 'purchase_order_id', 'variant_id', 'raw_material_id', 'quantity', 'quantity_received', 'unit_cost', 'total_cost']),
  stock_transfers: new Set(['organization_id', 'transfer_number', 'from_warehouse_id', 'to_warehouse_id', 'status', 'notes']),
  stock_transfer_items: new Set(['organization_id', 'transfer_id', 'variant_id', 'from_location_id', 'to_location_id', 'quantity']),
  expense_categories: new Set(['organization_id', 'title', 'code', 'icon', 'status']),
  expenses: new Set(['organization_id', 'category_id', 'title', 'amount', 'expense_date', 'payment_method', 'account_id', 'receipt_attachment', 'notes']),
  person_transactions: new Set(['organization_id', 'party_type', 'customer_id', 'supplier_id', 'type', 'transaction_type', 'amount', 'balance_after', 'order_id', 'purchase_order_id', 'reference_number', 'transaction_date', 'description']),
  financial_accounts: new Set(['organization_id', 'name', 'type', 'bank_name', 'account_number', 'card_number', 'shaba_number', 'pos_terminal_id', 'initial_balance', 'current_balance', 'is_default', 'warehouse_id']),
  treasury_transactions: new Set(['organization_id', 'source_account_id', 'destination_account_id', 'type', 'amount', 'tracking_code', 'transaction_date', 'receipt_attachment']),
  cheques: new Set(['organization_id', 'type', 'sayad_id', 'cheque_number', 'bank_name', 'branch_name', 'account_number', 'drawer_name', 'customer_id', 'supplier_id', 'amount', 'issue_date', 'due_date', 'status', 'target_account_id', 'alert_days_before', 'image_front', 'image_back']),
  landed_costs: new Set(['organization_id', 'purchase_order_id', 'cost_type', 'amount', 'allocation_method']),
  landed_cost_allocations: new Set(['landed_cost_id', 'purchase_order_item_id', 'allocated_amount', 'allocated_cost', 'effective_unit_cost']),
  raw_materials: new Set(['organization_id', 'name', 'code', 'unit', 'category', 'warehouse_id', 'current_stock', 'min_stock', 'unit_cost', 'color_hex', 'description', 'status']),
  bill_of_materials: new Set(['organization_id', 'product_id', 'variant_id', 'name', 'version', 'waste_percentage', 'notes', 'status']),
  bom_items: new Set(['bom_id', 'raw_material_id', 'quantity_required', 'unit_cost', 'notes']),
  contractors: new Set(['organization_id', 'name', 'specialty', 'phone', 'address', 'current_balance', 'status']),
  production_orders: new Set(['organization_id', 'order_number', 'product_id', 'bom_id', 'target_warehouse_id', 'total_quantity', 'status', 'start_date', 'due_date', 'completed_date', 'estimated_unit_cost', 'actual_unit_cost', 'notes']),
  production_order_items: new Set(['production_order_id', 'variant_id', 'quantity_planned', 'quantity_completed', 'quantity_rejected']),
  production_stages: new Set(['production_order_id', 'contractor_id', 'stage_type', 'status', 'unit_fee', 'total_fee', 'quantity_sent', 'quantity_received', 'quantity_damaged', 'sent_date', 'received_date', 'notes']),
  organizations: new Set(['name', 'slug', 'currency', 'timezone', 'logo', 'signature', 'phone', 'mobile', 'address', 'status']),
};

export function sanitizeForDirectus(collection: string, rawItem: Record<string, any>): Record<string, any> {
  const allowed = DIRECTUS_ALLOWED_FIELDS[collection];
  if (!allowed) return { ...rawItem };

  const normalizedItem: Record<string, any> = { ...rawItem };

  if (collection === 'colors' && !normalizedItem.hex && normalizedItem.hex_code) {
    normalizedItem.hex = normalizedItem.hex_code;
  } else if (collection === 'size_groups' && !normalizedItem.category && normalizedItem.type) {
    normalizedItem.category = normalizedItem.type;
  } else if (collection === 'sizes' && normalizedItem.sort === undefined && normalizedItem.sort_order !== undefined) {
    normalizedItem.sort = normalizedItem.sort_order;
  } else if (collection === 'size_guide_templates' && !normalizedItem.type) {
    normalizedItem.type = normalizedItem.category_type || normalizedItem.template_type || 'custom';
  } else if (collection === 'size_guide_measurements' && normalizedItem.sort === undefined && normalizedItem.sort_order !== undefined) {
    normalizedItem.sort = normalizedItem.sort_order;
  } else if (collection === 'product_variants' && normalizedItem.cost === undefined && normalizedItem.cost_price !== undefined) {
    normalizedItem.cost = normalizedItem.cost_price;
  } else if (collection === 'suppliers' && !normalizedItem.name && normalizedItem.company_name) {
    normalizedItem.name = normalizedItem.company_name;
  } else if (collection === 'purchase_orders' && !normalizedItem.purchase_number && normalizedItem.po_number) {
    normalizedItem.purchase_number = normalizedItem.po_number;
  } else if (collection === 'stock_transfers') {
    if (normalizedItem.from_warehouse_id === undefined && normalizedItem.source_warehouse_id !== undefined) {
      normalizedItem.from_warehouse_id = normalizedItem.source_warehouse_id;
    }
    if (normalizedItem.to_warehouse_id === undefined && normalizedItem.destination_warehouse_id !== undefined) {
      normalizedItem.to_warehouse_id = normalizedItem.destination_warehouse_id;
    }
  } else if (collection === 'inventory_items') {
    const qty = Math.max(0, Number(normalizedItem.quantity) || 0);
    const reserved = Math.max(0, Number(normalizedItem.reserved_quantity) || 0);
    normalizedItem.quantity = qty;
    normalizedItem.reserved_quantity = reserved;
    if (normalizedItem.available_quantity === undefined || normalizedItem.available_quantity === null) {
      normalizedItem.available_quantity = Math.max(0, qty - reserved);
    }
    if (normalizedItem.damaged_quantity === undefined || normalizedItem.damaged_quantity === null) {
      normalizedItem.damaged_quantity = 0;
    }
  } else if (collection === 'person_transactions' && !normalizedItem.reference_number && normalizedItem.reference_code) {
    normalizedItem.reference_number = normalizedItem.reference_code;
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(normalizedItem)) {
    if (!allowed.has(key) || value === undefined || value === null) continue;
    if (UUID_FIELDS.has(key) && (typeof value !== 'string' || !UUID_REGEX.test(value))) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

/**
 * CloudMigrationManager
 * Performs an automated, foreign-key-safe data onboarding / migration
 * from local offline storage (LocalStorage or SQLite) to Cloud Directus.
 * 
 * It uses an in-memory ID translation map (Local ID -> Cloud ID) to ensure that
 * parent-child relations (e.g. Products -> Variants -> Inventory Items / Order Items)
 * remain 100% intact even when Directus auto-generates brand-new primary keys.
 */
export class CloudMigrationManager {
  public static async migrateLocalToCloud(
    orgId: number,
    onProgress?: (progress: MigrationStepProgress) => void
  ): Promise<CloudMigrationResult> {
    const errors: string[] = [];
    let totalMigrated = 0;

    // Translation Map: collection_name -> Map<localId, cloudId>
    const idMap: Record<string, Map<number, number>> = {
      categories: new Map(),
      brands: new Map(),
      seasons: new Map(),
      collections: new Map(),
      colors: new Map(),
      size_groups: new Map(),
      sizes: new Map(),
      warehouses: new Map(),
      warehouse_locations: new Map(),
      size_guide_templates: new Map(),
      size_guide_measurements: new Map(),
      products: new Map(),
      product_variants: new Map(),
      suppliers: new Map(),
      customers: new Map(),
      orders: new Map(),
      purchase_orders: new Map(),
      stock_transfers: new Map(),
      expense_categories: new Map(),
      expenses: new Map(),
      financial_accounts: new Map(),
      person_transactions: new Map(),
      cheques: new Map(),
      landed_costs: new Map(),
    };

    const extractLocalId = (rawRef: any): number | null => {
      if (rawRef === undefined || rawRef === null || rawRef === '') return null;
      const candidate = typeof rawRef === 'object' ? rawRef.id : rawRef;
      const numeric = Number(candidate);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    };

    /**
     * Resolves an optional foreign key from local ID -> cloud ID.
     * NEVER leaks an unmapped raw local ID back to Directus (returns null instead).
     */
    const remapOptionalFk = (targetCollection: string, rawRef: any): number | null => {
      const localId = extractLocalId(rawRef);
      if (localId === null) return null;
      return idMap[targetCollection]?.get(localId) ?? null;
    };

    /**
     * Resolves a required foreign key from local ID -> cloud ID.
     * Returns null when parent failed or does not exist so caller can safely skip.
     */
    const remapRequiredFk = (targetCollection: string, rawRef: any): number | null => {
      const localId = extractLocalId(rawRef);
      if (localId === null) return null;
      return idMap[targetCollection]?.get(localId) ?? null;
    };

    /**
     * Orders self-referential tree entities (e.g. categories, warehouse_locations)
     * so parents are migrated before children.
     */
    const orderParentsFirst = (items: any[]): any[] => {
      const remaining = [...items];
      const ordered: any[] = [];
      const placedIds = new Set<number>();
      let progress = true;

      while (remaining.length > 0 && progress) {
        progress = false;
        for (let i = remaining.length - 1; i >= 0; i--) {
          const parentId = extractLocalId(remaining[i]?.parent_id);
          if (parentId === null || placedIds.has(parentId)) {
            const [item] = remaining.splice(i, 1);
            ordered.push(item);
            const id = extractLocalId(item?.id);
            if (id !== null) placedIds.add(id);
            progress = true;
          }
        }
      }
      // Append any remaining items (e.g., broken/cyclic parent_id; parent_id will remap to null safely)
      return [...ordered, ...remaining];
    };

    const emitProgress = (
      step: string,
      current: number,
      total: number,
      status: 'pending' | 'in_progress' | 'completed' | 'failed',
      error?: string
    ) => {
      if (onProgress) {
        onProgress({ step, current, total, status, error });
      }
    };

    try {
      // 1. Extract raw local data filtered for active organization
      const backupResult = BackupManager.generateBackup({ id: orgId, name: 'Migration Org' });
      const collections = backupResult.data || {};

      // Phase 1: Base Entities (Categories, Brands, Seasons, Colors, Size Groups, Warehouses, Suppliers, Customers)
      const baseCollections: Array<{ key: string; label: string }> = [
        { key: 'categories', label: 'Categories' },
        { key: 'brands', label: 'Brands' },
        { key: 'seasons', label: 'Seasons' },
        { key: 'colors', label: 'Colors' },
        { key: 'size_groups', label: 'Size Groups' },
        { key: 'warehouses', label: 'Warehouses & Stores' },
        { key: 'suppliers', label: 'Suppliers' },
        { key: 'customers', label: 'Customers' },
      ];

      for (const col of baseCollections) {
        const rawItems = collections[col.key] || [];
        const items = col.key === 'categories' ? orderParentsFirst(rawItems) : rawItems;
        emitProgress(col.label, 0, items.length, 'in_progress');

        for (let i = 0; i < items.length; i++) {
          const item = { ...items[i] };
          const localId = Number(item.id);
          delete item.id;
          item.organization_id = orgId;

          if (col.key === 'categories') {
            item.parent_id = remapOptionalFk('categories', item.parent_id);
          }

          try {
            const payload = sanitizeForDirectus(col.key, item);
            let created: any;
            try {
              created = await directusClient.createItem<any>(col.key, payload);
            } catch (firstErr: any) {
              // Defensive fallback if an environment still enforces a unique slug on brands
              const msg = String(firstErr?.message || '');
              if (col.key === 'brands' && payload.slug && msg.toLowerCase().includes('unique')) {
                const uniquePayload = { ...payload, slug: `${payload.slug}-${orgId}` };
                created = await directusClient.createItem<any>(col.key, uniquePayload);
              } else {
                throw firstErr;
              }
            }
            if (created && created.id) {
              idMap[col.key]?.set(localId, Number(created.id));
              totalMigrated++;
            }
          } catch (err: any) {
            console.warn(`[CloudMigration] Error migrating ${col.key} item ${localId}:`, err?.message || err);
            errors.push(`Error uploading ${col.label} (${item.name || localId}): ${err?.message || err}`);
          }
          emitProgress(col.label, i + 1, items.length, 'in_progress');
        }
        emitProgress(col.label, items.length, items.length, 'completed');
      }

      // Phase 2: First-level Dependent Base Entities (Collections, Warehouse Locations -> Warehouses, Sizes -> Size Groups)
      // 2.1 Collections
      const colItems = collections['collections'] || [];
      emitProgress('Collections', 0, colItems.length, 'in_progress');
      for (let i = 0; i < colItems.length; i++) {
        const item = { ...colItems[i] };
        const localId = Number(item.id);
        delete item.id;
        item.organization_id = orgId;

        try {
          const payload = sanitizeForDirectus('collections', item);
          const created = await directusClient.createItem<any>('collections', payload);
          if (created?.id) {
            idMap['collections']?.set(localId, Number(created.id));
            totalMigrated++;
          }
        } catch (err: any) {
          errors.push(`Error uploading collection (${item.name || localId}): ${err?.message || err}`);
        }
        emitProgress('Collections', i + 1, colItems.length, 'in_progress');
      }
      emitProgress('Collections', colItems.length, colItems.length, 'completed');

      // 2.2 Warehouse Locations (links to warehouses & optional parent location)
      const locItems = orderParentsFirst(collections['warehouse_locations'] || []);
      emitProgress('Warehouse Locations', 0, locItems.length, 'in_progress');
      for (let i = 0; i < locItems.length; i++) {
        const item = { ...locItems[i] };
        const localId = Number(item.id);
        delete item.id;
        item.organization_id = orgId;

        const mappedWarehouseId = remapRequiredFk('warehouses', item.warehouse_id);
        if (mappedWarehouseId === null) {
          errors.push(`Skipped warehouse location (${item.name || localId}): parent warehouse was not migrated`);
          emitProgress('Warehouse Locations', i + 1, locItems.length, 'in_progress');
          continue;
        }
        item.warehouse_id = mappedWarehouseId;
        item.parent_id = remapOptionalFk('warehouse_locations', item.parent_id);

        try {
          const payload = sanitizeForDirectus('warehouse_locations', item);
          const created = await directusClient.createItem<any>('warehouse_locations', payload);
          if (created?.id) {
            idMap['warehouse_locations']?.set(localId, Number(created.id));
            totalMigrated++;
          }
        } catch (err: any) {
          errors.push(`Error uploading warehouse location (${item.name || localId}): ${err?.message || err}`);
        }
        emitProgress('Warehouse Locations', i + 1, locItems.length, 'in_progress');
      }
      emitProgress('Warehouse Locations', locItems.length, locItems.length, 'completed');

      // 2.3 Sizes (links to size_groups)
      const sizeItems = collections['sizes'] || [];
      emitProgress('Sizes', 0, sizeItems.length, 'in_progress');
      for (let i = 0; i < sizeItems.length; i++) {
        const item = { ...sizeItems[i] };
        const localId = Number(item.id);
        delete item.id;
        item.organization_id = orgId;
        item.size_group_id = remapOptionalFk('size_groups', item.size_group_id);

        try {
          const payload = sanitizeForDirectus('sizes', item);
          const created = await directusClient.createItem<any>('sizes', payload);
          if (created?.id) {
            idMap['sizes']?.set(localId, Number(created.id));
            totalMigrated++;
          }
        } catch (err: any) {
          errors.push(`Error uploading size (${item.name || localId}): ${err?.message || err}`);
        }
        emitProgress('Sizes', i + 1, sizeItems.length, 'in_progress');
      }
      emitProgress('Sizes', sizeItems.length, sizeItems.length, 'completed');

      // Phase 3: Size Guides (Templates -> Measurements -> Values)
      const tplItems = collections['size_guide_templates'] || [];
      emitProgress('Size Guide Templates', 0, tplItems.length, 'in_progress');
      for (let i = 0; i < tplItems.length; i++) {
        const item = { ...tplItems[i] };
        const localId = Number(item.id);
        delete item.id;
        item.organization_id = orgId;

        try {
          const payload = sanitizeForDirectus('size_guide_templates', item);
          const created = await directusClient.createItem<any>('size_guide_templates', payload);
          if (created?.id) {
            idMap['size_guide_templates']?.set(localId, Number(created.id));
            totalMigrated++;
          }
        } catch (err: any) {
          errors.push(`Error uploading size guide template: ${err?.message || err}`);
        }
        emitProgress('Size Guide Templates', i + 1, tplItems.length, 'in_progress');
      }
      emitProgress('Size Guide Templates', tplItems.length, tplItems.length, 'completed');

      // Size Guide Measurements
      const sgMeasItems = collections['size_guide_measurements'] || [];
      emitProgress('Size Guide Measurements', 0, sgMeasItems.length, 'in_progress');
      for (let i = 0; i < sgMeasItems.length; i++) {
        const item = { ...sgMeasItems[i] };
        const localId = Number(item.id);
        delete item.id;
        item.organization_id = orgId;

        const mappedTemplateId = remapRequiredFk('size_guide_templates', item.template_id);
        if (mappedTemplateId === null) {
          emitProgress('Size Guide Measurements', i + 1, sgMeasItems.length, 'in_progress');
          continue;
        }
        item.template_id = mappedTemplateId;

        try {
          const payload = sanitizeForDirectus('size_guide_measurements', item);
          const created = await directusClient.createItem<any>('size_guide_measurements', payload);
          if (created?.id) {
            idMap['size_guide_measurements']?.set(localId, Number(created.id));
            totalMigrated++;
          }
        } catch (err: any) {
          errors.push(`Error uploading size guide measurement: ${err?.message || err}`);
        }
        emitProgress('Size Guide Measurements', i + 1, sgMeasItems.length, 'in_progress');
      }
      emitProgress('Size Guide Measurements', sgMeasItems.length, sgMeasItems.length, 'completed');

      // Size Guide Values
      const sgValItems = collections['size_guide_values'] || [];
      emitProgress('Size Guide Matrix Values', 0, sgValItems.length, 'in_progress');
      for (let i = 0; i < sgValItems.length; i++) {
        const item = { ...sgValItems[i] };
        delete item.id;
        item.organization_id = orgId;

        const mappedTemplateId = remapRequiredFk('size_guide_templates', item.template_id);
        const mappedMeasId = remapRequiredFk('size_guide_measurements', item.measurement_id);
        const mappedSizeId = remapRequiredFk('sizes', item.size_id);
        if (mappedTemplateId === null || mappedMeasId === null || mappedSizeId === null) {
          emitProgress('Size Guide Matrix Values', i + 1, sgValItems.length, 'in_progress');
          continue;
        }
        item.template_id = mappedTemplateId;
        item.measurement_id = mappedMeasId;
        item.size_id = mappedSizeId;

        try {
          const payload = sanitizeForDirectus('size_guide_values', item);
          await directusClient.createItem<any>('size_guide_values', payload);
          totalMigrated++;
        } catch (err: any) {
          // ignore or log non-critical matrix cell errors
        }
        emitProgress('Size Guide Matrix Values', i + 1, sgValItems.length, 'in_progress');
      }
      emitProgress('Size Guide Matrix Values', sgValItems.length, sgValItems.length, 'completed');

      // Phase 4: Products
      const productItems = collections['products'] || [];
      emitProgress('Products', 0, productItems.length, 'in_progress');
      for (let i = 0; i < productItems.length; i++) {
        const item = { ...productItems[i] };
        const localId = Number(item.id);
        delete item.id;
        delete item.variants_count;
        delete item.total_stock;
        item.organization_id = orgId;

        item.category_id = remapOptionalFk('categories', item.category_id);
        item.brand_id = remapOptionalFk('brands', item.brand_id);
        item.season_id = remapOptionalFk('seasons', item.season_id);
        item.collection_id = remapOptionalFk('collections', item.collection_id);
        item.size_guide_template_id = remapOptionalFk('size_guide_templates', item.size_guide_template_id);

        try {
          const payload = sanitizeForDirectus('products', item);
          const created = await directusClient.createItem<any>('products', payload);
          if (created?.id) {
            idMap['products']?.set(localId, Number(created.id));
            totalMigrated++;
          }
        } catch (err: any) {
          errors.push(`Error uploading product (${item.title || localId}): ${err?.message || err}`);
        }
        emitProgress('Products', i + 1, productItems.length, 'in_progress');
      }
      emitProgress('Products', productItems.length, productItems.length, 'completed');

      // Phase 5: Product Variants
      const variantItems = collections['product_variants'] || [];
      emitProgress('Product Variants', 0, variantItems.length, 'in_progress');
      for (let i = 0; i < variantItems.length; i++) {
        const item = { ...variantItems[i] };
        const localId = Number(item.id);
        delete item.id;
        item.organization_id = orgId;

        const mappedProductId = remapRequiredFk('products', item.product_id);
        if (mappedProductId === null) {
          errors.push(`Skipped product variant (${item.sku || localId}): parent product was not migrated`);
          emitProgress('Product Variants', i + 1, variantItems.length, 'in_progress');
          continue;
        }
        item.product_id = mappedProductId;
        item.color_id = remapOptionalFk('colors', item.color_id);
        item.size_id = remapOptionalFk('sizes', item.size_id);

        try {
          const payload = sanitizeForDirectus('product_variants', item);
          const created = await directusClient.createItem<any>('product_variants', payload);
          if (created?.id) {
            idMap['product_variants']?.set(localId, Number(created.id));
            totalMigrated++;
          }
        } catch (err: any) {
          errors.push(`Error uploading product variant (${item.sku || localId}): ${err?.message || err}`);
        }
        emitProgress('Product Variants', i + 1, variantItems.length, 'in_progress');
      }
      emitProgress('Product Variants', variantItems.length, variantItems.length, 'completed');

      // Phase 6: Inventory Items & Stock
      const invItems = collections['inventory_items'] || [];
      emitProgress('Warehouse Inventory', 0, invItems.length, 'in_progress');
      for (let i = 0; i < invItems.length; i++) {
        const item = { ...invItems[i] };
        delete item.id;
        item.organization_id = orgId;

        const mappedVariantId = remapRequiredFk('product_variants', item.variant_id);
        const mappedWarehouseId = remapRequiredFk('warehouses', item.warehouse_id);
        if (mappedVariantId === null || mappedWarehouseId === null) {
          errors.push(`Skipped inventory item: parent variant or warehouse was not migrated`);
          emitProgress('Warehouse Inventory', i + 1, invItems.length, 'in_progress');
          continue;
        }
        item.variant_id = mappedVariantId;
        item.warehouse_id = mappedWarehouseId;
        item.location_id = remapOptionalFk('warehouse_locations', item.location_id);

        try {
          const payload = sanitizeForDirectus('inventory_items', item);
          await directusClient.createItem<any>('inventory_items', payload);
          totalMigrated++;
        } catch (err: any) {
          errors.push(`Error uploading inventory item: ${err?.message || err}`);
        }
        emitProgress('Warehouse Inventory', i + 1, invItems.length, 'in_progress');
      }
      emitProgress('Warehouse Inventory', invItems.length, invItems.length, 'completed');

      // Phase 6.1: Inventory Movements
      const movItems = collections['inventory_movements'] || [];
      if (movItems.length > 0) {
        emitProgress('Stock Movements', 0, movItems.length, 'in_progress');
        for (let i = 0; i < movItems.length; i++) {
          const item = { ...movItems[i] };
          delete item.id;
          item.organization_id = orgId;

          const mappedVariantId = remapRequiredFk('product_variants', item.variant_id);
          const mappedWarehouseId = remapRequiredFk('warehouses', item.warehouse_id);
          if (mappedVariantId === null || mappedWarehouseId === null) {
            emitProgress('Stock Movements', i + 1, movItems.length, 'in_progress');
            continue;
          }
          item.variant_id = mappedVariantId;
          item.warehouse_id = mappedWarehouseId;
          item.location_id = remapOptionalFk('warehouse_locations', item.location_id);

          try {
            const payload = sanitizeForDirectus('inventory_movements', item);
            await directusClient.createItem<any>('inventory_movements', payload);
            totalMigrated++;
          } catch (err: any) {
            // non-critical movement log
          }
          emitProgress('Stock Movements', i + 1, movItems.length, 'in_progress');
        }
        emitProgress('Stock Movements', movItems.length, movItems.length, 'completed');
      }

      // Phase 7: Orders and Order Items
      const orderItemsList = collections['order_items'] || [];
      const orderList = collections['orders'] || [];
      emitProgress('Orders & Invoices', 0, orderList.length, 'in_progress');

      for (let i = 0; i < orderList.length; i++) {
        const item = { ...orderList[i] };
        const localId = Number(item.id);
        delete item.id;
        item.organization_id = orgId;

        item.customer_id = remapOptionalFk('customers', item.customer_id);
        item.warehouse_id = remapOptionalFk('warehouses', item.warehouse_id);

        try {
          const payload = sanitizeForDirectus('orders', item);
          const created = await directusClient.createItem<any>('orders', payload);
          if (created?.id) {
            idMap['orders']?.set(localId, Number(created.id));
            totalMigrated++;

            // Migrate order line items for this specific order
            const relatedLines = orderItemsList.filter((oi: any) => {
              const oId = extractLocalId(oi.order_id);
              return oId === localId;
            });

            for (const line of relatedLines) {
              const lineItem = { ...line };
              delete lineItem.id;
              lineItem.organization_id = orgId;
              lineItem.order_id = Number(created.id);
              const mappedVariantId = remapRequiredFk('product_variants', lineItem.variant_id);
              if (mappedVariantId === null) continue;
              lineItem.variant_id = mappedVariantId;
              const linePayload = sanitizeForDirectus('order_items', lineItem);
              await directusClient.createItem<any>('order_items', linePayload).catch(() => {});
              totalMigrated++;
            }
          }
        } catch (err: any) {
          errors.push(`Error uploading order (#${item.order_number || localId}): ${err?.message || err}`);
        }
        emitProgress('Orders & Invoices', i + 1, orderList.length, 'in_progress');
      }
      emitProgress('Orders & Invoices', orderList.length, orderList.length, 'completed');

      // Phase 8: Financial & Accounting Module
      // 8.1 Expense Categories
      const expCategories = collections['expense_categories'] || [];
      if (expCategories.length > 0) {
        emitProgress('Expense Categories', 0, expCategories.length, 'in_progress');
        for (let i = 0; i < expCategories.length; i++) {
          const item = { ...expCategories[i] };
          const localId = Number(item.id);
          delete item.id;
          item.organization_id = orgId;
          try {
            const payload = sanitizeForDirectus('expense_categories', item);
            const created = await directusClient.createItem<any>('expense_categories', payload);
            if (created?.id) {
              idMap['expense_categories']?.set(localId, Number(created.id));
              totalMigrated++;
            }
          } catch (err: any) {
            errors.push(`Error uploading expense category (${item.title || localId}): ${err?.message || err}`);
          }
          emitProgress('Expense Categories', i + 1, expCategories.length, 'in_progress');
        }
        emitProgress('Expense Categories', expCategories.length, expCategories.length, 'completed');
      }

      // 8.2 Financial Accounts (Bank & Cashbox)
      const finAccounts = collections['financial_accounts'] || [];
      if (finAccounts.length > 0) {
        emitProgress('Financial Accounts & Cashboxes', 0, finAccounts.length, 'in_progress');
        for (let i = 0; i < finAccounts.length; i++) {
          const item = { ...finAccounts[i] };
          const localId = Number(item.id);
          delete item.id;
          item.organization_id = orgId;
          item.warehouse_id = remapOptionalFk('warehouses', item.warehouse_id);
          try {
            const payload = sanitizeForDirectus('financial_accounts', item);
            const created = await directusClient.createItem<any>('financial_accounts', payload);
            if (created?.id) {
              idMap['financial_accounts']?.set(localId, Number(created.id));
              totalMigrated++;
            }
          } catch (err: any) {
            errors.push(`Error uploading financial account (${item.name || localId}): ${err?.message || err}`);
          }
          emitProgress('Financial Accounts & Cashboxes', i + 1, finAccounts.length, 'in_progress');
        }
        emitProgress('Financial Accounts & Cashboxes', finAccounts.length, finAccounts.length, 'completed');
      }

      // 8.3 Expenses
      const expList = collections['expenses'] || [];
      if (expList.length > 0) {
        emitProgress('Operating Expenses', 0, expList.length, 'in_progress');
        for (let i = 0; i < expList.length; i++) {
          const item = { ...expList[i] };
          const localId = Number(item.id);
          delete item.id;
          item.organization_id = orgId;

          item.category_id = remapOptionalFk('expense_categories', item.category_id);
          item.account_id = remapOptionalFk('financial_accounts', item.account_id);

          try {
            const payload = sanitizeForDirectus('expenses', item);
            const created = await directusClient.createItem<any>('expenses', payload);
            if (created?.id) {
              idMap['expenses']?.set(localId, Number(created.id));
              totalMigrated++;
            }
          } catch (err: any) {
            errors.push(`Error uploading expense (${item.title || localId}): ${err?.message || err}`);
          }
          emitProgress('Operating Expenses', i + 1, expList.length, 'in_progress');
        }
        emitProgress('Operating Expenses', expList.length, expList.length, 'completed');
      }

      // 8.4 Person Transactions (Customer/Supplier Ledgers)
      const personTransList = collections['person_transactions'] || [];
      if (personTransList.length > 0) {
        emitProgress('Party Ledgers (Customers & Suppliers)', 0, personTransList.length, 'in_progress');
        for (let i = 0; i < personTransList.length; i++) {
          const item = { ...personTransList[i] };
          const localId = Number(item.id);
          delete item.id;
          item.organization_id = orgId;

          item.customer_id = remapOptionalFk('customers', item.customer_id);
          item.supplier_id = remapOptionalFk('suppliers', item.supplier_id);
          item.order_id = remapOptionalFk('orders', item.order_id);
          item.purchase_order_id = remapOptionalFk('purchase_orders', item.purchase_order_id);

          try {
            const payload = sanitizeForDirectus('person_transactions', item);
            const created = await directusClient.createItem<any>('person_transactions', payload);
            if (created?.id) {
              idMap['person_transactions']?.set(localId, Number(created.id));
              totalMigrated++;
            }
          } catch (err: any) {
            errors.push(`Error uploading party ledger transaction: ${err?.message || err}`);
          }
          emitProgress('Party Ledgers (Customers & Suppliers)', i + 1, personTransList.length, 'in_progress');
        }
        emitProgress('Party Ledgers (Customers & Suppliers)', personTransList.length, personTransList.length, 'completed');
      }

      // 8.5 Treasury Transactions (Transfers)
      const treasuryTransList = collections['treasury_transactions'] || [];
      if (treasuryTransList.length > 0) {
        emitProgress('Treasury Transactions & Transfers', 0, treasuryTransList.length, 'in_progress');
        for (let i = 0; i < treasuryTransList.length; i++) {
          const item = { ...treasuryTransList[i] };
          delete item.id;
          item.organization_id = orgId;

          item.source_account_id = remapOptionalFk('financial_accounts', item.source_account_id);
          item.destination_account_id = remapOptionalFk('financial_accounts', item.destination_account_id);
          item.expense_id = remapOptionalFk('expenses', item.expense_id);
          item.person_transaction_id = remapOptionalFk('person_transactions', item.person_transaction_id);

          try {
            const payload = sanitizeForDirectus('treasury_transactions', item);
            await directusClient.createItem<any>('treasury_transactions', payload);
            totalMigrated++;
          } catch (err: any) {
            // non-critical
          }
          emitProgress('Treasury Transactions & Transfers', i + 1, treasuryTransList.length, 'in_progress');
        }
        emitProgress('Treasury Transactions & Transfers', treasuryTransList.length, treasuryTransList.length, 'completed');
      }

      // 8.6 Cheques & Promissory Notes
      const chequesList = collections['cheques'] || [];
      if (chequesList.length > 0) {
        emitProgress('Cheques & Promissory Notes', 0, chequesList.length, 'in_progress');
        for (let i = 0; i < chequesList.length; i++) {
          const item = { ...chequesList[i] };
          const localId = Number(item.id);
          delete item.id;
          item.organization_id = orgId;

          item.customer_id = remapOptionalFk('customers', item.customer_id);
          item.supplier_id = remapOptionalFk('suppliers', item.supplier_id);
          item.target_account_id = remapOptionalFk('financial_accounts', item.target_account_id);

          try {
            const payload = sanitizeForDirectus('cheques', item);
            const created = await directusClient.createItem<any>('cheques', payload);
            if (created?.id) {
              idMap['cheques']?.set(localId, Number(created.id));
              totalMigrated++;
            }
          } catch (err: any) {
            errors.push(`Error uploading cheque (#${item.sayad_id || localId}): ${err?.message || err}`);
          }
          emitProgress('Cheques & Promissory Notes', i + 1, chequesList.length, 'in_progress');
        }
        emitProgress('Cheques & Promissory Notes', chequesList.length, chequesList.length, 'completed');
      }

      // 8.7 Landed Costs
      const landedCostsList = collections['landed_costs'] || [];
      if (landedCostsList.length > 0) {
        emitProgress('Landed Costs & Freight Allocation', 0, landedCostsList.length, 'in_progress');
        for (let i = 0; i < landedCostsList.length; i++) {
          const item = { ...landedCostsList[i] };
          const localId = Number(item.id);
          delete item.id;
          item.organization_id = orgId;

          item.purchase_order_id = remapOptionalFk('purchase_orders', item.purchase_order_id);
          item.expense_id = remapOptionalFk('expenses', item.expense_id);

          try {
            const payload = sanitizeForDirectus('landed_costs', item);
            const created = await directusClient.createItem<any>('landed_costs', payload);
            if (created?.id) {
              idMap['landed_costs']?.set(localId, Number(created.id));
              totalMigrated++;
            }
          } catch (err: any) {
            // non-critical
          }
          emitProgress('Landed Costs & Freight Allocation', i + 1, landedCostsList.length, 'in_progress');
        }
        emitProgress('Landed Costs & Freight Allocation', landedCostsList.length, landedCostsList.length, 'completed');
      }

      return {
        success: errors.length === 0,
        totalMigrated,
        errors,
      };
    } catch (e: any) {
      return {
        success: false,
        totalMigrated,
        errors: [...errors, e?.message || 'Unexpected error during data migration'],
      };
    }
  }

  /**
   * Performs an automated data offboarding / migration
   * from Cloud Directus to local offline storage (SQLite on Desktop or LocalStorage).
   * 
   * Fetches all tenant-scoped business entities belonging to orgId from Directus,
   * normalizes relational identifiers, and restores them into the local database with tenant isolation.
   */
  public static async migrateCloudToLocal(
    orgId: number,
    onProgress?: (progress: MigrationStepProgress) => void
  ): Promise<CloudMigrationResult> {
    const errors: string[] = [];
    let totalMigrated = 0;

    const emitProgress = (
      step: string,
      current: number,
      total: number,
      status: 'pending' | 'in_progress' | 'completed' | 'failed',
      error?: string
    ) => {
      if (onProgress) {
        onProgress({ step, current, total, status, error });
      }
    };

    try {
      emitProgress('Connecting to Cloud and fetching records', 0, 1, 'in_progress');

      // Collections to fetch from Cloud Directus
      const cloudCollectionsToFetch: Array<{ key: string; label: string; isOrgCollection?: boolean }> = [
        { key: 'organizations', label: 'Organization Details', isOrgCollection: true },
        { key: 'categories', label: 'Categories' },
        { key: 'brands', label: 'Brands' },
        { key: 'seasons', label: 'Seasons' },
        { key: 'collections', label: 'Collections' },
        { key: 'colors', label: 'Colors' },
        { key: 'size_groups', label: 'Size Groups' },
        { key: 'sizes', label: 'Sizes' },
        { key: 'size_guide_templates', label: 'Size Guide Templates' },
        { key: 'size_guide_measurements', label: 'Size Guide Measurements' },
        { key: 'size_guide_values', label: 'Size Guide Values' },
        { key: 'products', label: 'Products' },
        { key: 'product_variants', label: 'Product Variants' },
        { key: 'warehouses', label: 'Warehouses & Stores' },
        { key: 'warehouse_locations', label: 'Warehouse Locations' },
        { key: 'inventory_items', label: 'Inventory Stock' },
        { key: 'inventory_movements', label: 'Stock Movements' },
        { key: 'stock_transfers', label: 'Stock Transfers' },
        { key: 'stock_transfer_items', label: 'Stock Transfer Items' },
        { key: 'customers', label: 'Customers' },
        { key: 'orders', label: 'Orders & Invoices' },
        { key: 'order_items', label: 'Order Items' },
        { key: 'suppliers', label: 'Suppliers' },
        { key: 'purchase_orders', label: 'Purchase Orders' },
        { key: 'purchase_order_items', label: 'Purchase Order Items' },
        { key: 'expense_categories', label: 'Expense Categories' },
        { key: 'expenses', label: 'Expenses' },
        { key: 'financial_accounts', label: 'Financial Accounts & Cashboxes' },
        { key: 'treasury_transactions', label: 'Treasury Transactions' },
        { key: 'person_transactions', label: 'Party Ledgers' },
        { key: 'cheques', label: 'Cheques & Promissory Notes' },
        { key: 'landed_costs', label: 'Landed Costs' },
        { key: 'landed_cost_allocations', label: 'Landed Cost Allocations' },
        { key: 'organization_modules', label: 'Active Modules' },
        { key: 'pos_shifts', label: 'POS Shifts' },
        { key: 'woocommerce_settings', label: 'WooCommerce Settings' },
        { key: 'woocommerce_mappings', label: 'WooCommerce Mappings' },
        { key: 'woocommerce_logs', label: 'WooCommerce Logs' },
      ];

      const backupData: Record<string, any[]> = {};
      const totalSteps = cloudCollectionsToFetch.length;

      for (let s = 0; s < totalSteps; s++) {
        const itemConfig = cloudCollectionsToFetch[s];
        emitProgress(`Fetching ${itemConfig.label}`, s + 1, totalSteps, 'in_progress');

        try {
          let items: any[] = [];
          if (itemConfig.isOrgCollection) {
            const orgRes = await directusClient.getItems<any>('organizations', {
              filter: { id: { _eq: orgId } },
              limit: 1,
            });
            items = Array.isArray(orgRes) ? orgRes : [];
          } else {
            const query: any = {
              filter: { organization_id: { _eq: orgId } },
              limit: 5000,
            };
            const result = await directusClient.getItems<any>(itemConfig.key, query);
            items = Array.isArray(result) ? result : [];
          }

          // Normalize nested relational objects to numeric IDs for local adapters
          const normalized = items.map((rec) => {
            const copy = { ...rec };
            for (const [k, v] of Object.entries(copy)) {
              if (v && typeof v === 'object' && !Array.isArray(v) && 'id' in v) {
                copy[k] = (v as any).id;
              }
            }
            if (!itemConfig.isOrgCollection) {
              copy.organization_id = orgId;
            }
            return copy;
          });

          backupData[itemConfig.key] = normalized;
          totalMigrated += normalized.length;
        } catch (fetchErr: any) {
          console.warn(`[CloudMigrationManager] Warning fetching ${itemConfig.key} from Cloud:`, fetchErr);
          backupData[itemConfig.key] = [];
        }
      }

      emitProgress('Saving data to local database', totalSteps, totalSteps, 'in_progress');

      // Call BackupManager.restoreBackup with skipCloudSync = true to prevent re-upload
      const restoreRes = await BackupManager.restoreBackup(backupData, 'replace', orgId, true);
      if (!restoreRes.success) {
        errors.push(restoreRes.error || 'Failed to restore records to local database');
      }

      // Enforce local offline storage mode & update local cache
      try {
        safeSetLocalStorageItem('tankhor_storage_mode', 'local_offline');
        safeSetLocalStorageItem('tankhor_active_org_id', String(orgId));

        // Update cached user profile if exists so it reflects local offline mode
        const cachedRaw = localStorage.getItem('tankhor_cached_user_profile');
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            if (cached.activeOrganization) {
              cached.activeOrganization.plan = 'free';
            }
            if (cached.active_organization) {
              cached.active_organization.plan = 'free';
            }
            if (Array.isArray(cached.organizations)) {
              cached.organizations = cached.organizations.map((o: any) =>
                o && String(o.id) === String(orgId) ? { ...o, plan: 'free' } : o
              );
            }
            safeSaveCachedUserProfile(cached);
          } catch {}
        }

        storageManager.setMode('local_offline', { verifiedPro: false, force: true });
      } catch (err) {
        console.warn('[CloudMigrationManager] Mode switch warning:', err);
      }

      emitProgress('Migration to local database completed successfully', totalSteps, totalSteps, 'completed');

      return {
        success: errors.length === 0,
        totalMigrated,
        errors,
      };
    } catch (e: any) {
      return {
        success: false,
        totalMigrated,
        errors: [...errors, e?.message || 'Error migrating data from Cloud to local storage'],
      };
    }
  }
}
