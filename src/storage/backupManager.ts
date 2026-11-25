/**
 * TANKHOR Local & Cloud Backup, Restore & Demo Data Management
 * Enables users to export complete database backups (JSON) with 1-click
 * and restore seamlessly across Browser (localStorage), Desktop (SQLite), and Cloud modes.
 */

import { formatDate, getActiveLocale } from '../utils/formatters';
import { BRAND } from '../config/brand';
import { isTauriEnvironment } from './sqliteAdapter';
import { APP_VERSION } from '../utils/version';
import { downloadCsvContent, escapeCsvCell, triggerBlobDownload } from '../utils/excelUtils';

export const BACKUP_COLLECTIONS = [
  'organizations',
  'organization_users',
  'categories',
  'collections',
  'seasons',
  'colors',
  'size_groups',
  'sizes',
  'brands',
  'products',
  'product_variants',
  'warehouses',
  'warehouse_locations',
  'inventory_items',
  'inventory_movements',
  'customers',
  'orders',
  'order_items',
  'order_returns',
  'order_return_items',
  'suppliers',
  'purchase_orders',
  'purchase_order_items',
  'stock_transfers',
  'stock_transfer_items',
  'size_guide_templates',
  'size_guide_measurements',
  'size_guide_values',
  'subscriptions',
  'system_modules',
  'organization_modules',
  'expense_categories',
  'expenses',
  'person_transactions',
  'financial_accounts',
  'treasury_transactions',
  'cheques',
  'landed_costs',
  'landed_cost_allocations',
  'pos_shifts',
  'woocommerce_settings',
  'woocommerce_logs',
  'woocommerce_mappings',
  'raw_materials',
  'bill_of_materials',
  'bom_items',
  'contractors',
  'production_orders',
  'production_order_items',
  'production_stages',
  'feedbacks',
] as const;

export type BackupCollectionKey = typeof BACKUP_COLLECTIONS[number];

const CHILD_PARENT_FILTER_MAP: Partial<
  Record<BackupCollectionKey, { parentCollection: BackupCollectionKey; foreignKey: string }>
> = {
  warehouse_locations: { parentCollection: 'warehouses', foreignKey: 'warehouse_id' },
  product_variants: { parentCollection: 'products', foreignKey: 'product_id' },
  order_items: { parentCollection: 'orders', foreignKey: 'order_id' },
  order_return_items: { parentCollection: 'order_returns', foreignKey: 'return_id' },
  purchase_order_items: { parentCollection: 'purchase_orders', foreignKey: 'purchase_order_id' },
  stock_transfer_items: { parentCollection: 'stock_transfers', foreignKey: 'transfer_id' },
  size_guide_measurements: { parentCollection: 'size_guide_templates', foreignKey: 'template_id' },
  size_guide_values: { parentCollection: 'size_guide_templates', foreignKey: 'template_id' },
  sizes: { parentCollection: 'size_groups', foreignKey: 'size_group_id' },
  bom_items: { parentCollection: 'bill_of_materials', foreignKey: 'bom_id' },
  production_order_items: { parentCollection: 'production_orders', foreignKey: 'production_order_id' },
  production_stages: { parentCollection: 'production_orders', foreignKey: 'production_order_id' },
  landed_cost_allocations: { parentCollection: 'landed_costs', foreignKey: 'landed_cost_id' },
};

const GLOBAL_CATALOG_COLLECTIONS = new Set<BackupCollectionKey>(['system_modules']);

export interface TankhorBackupMetadata {
  app: string;
  signature: string;
  version: string;
  exported_at: string;
  exported_at_jalali: string;
  total_records: number;
  organization?: {
    id: number;
    name: string;
    slug?: string;
  };
  collections_summary: Record<string, number>;
}

export interface TankhorBackupFile {
  metadata: TankhorBackupMetadata;
  data: Record<string, any[]>;
}

export interface InspectionResult {
  valid: boolean;
  error?: string;
  metadata?: TankhorBackupMetadata;
  collections?: Record<string, number>;
  data?: Record<string, any[]>;
}

export interface CsvExportResult {
  success: boolean;
  count: number;
  message: string;
}

export class BackupManager {
  /**
   * Reads raw collection from localStorage
   */
  private static getRawCollection(name: string): any[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(`tankhor_db_${name}`);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Writes raw collection to localStorage
   */
  private static setRawCollection(name: string, data: any[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`tankhor_db_${name}`, JSON.stringify(data));
  }

  private static extractRelationId(val: any): number | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
    if (typeof val === 'object' && val.id !== undefined) {
      const n = Number(val.id);
      return Number.isFinite(n) ? n : undefined;
    }
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  }

  private static normalizeCloudRecord(rec: any): any {
    if (!rec || typeof rec !== 'object') return rec;
    const copy: any = { ...rec };
    for (const [k, v] of Object.entries(copy)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && 'id' in v) {
        copy[k] = (v as any).id;
      }
    }
    return copy;
  }

  /**
   * Helper to filter collection items by organization ID (including child tables)
   */
  public static filterCollectionByOrg(
    collection: BackupCollectionKey,
    items: any[],
    orgId: number,
    allCollections?: Partial<Record<BackupCollectionKey, any[]>>
  ): any[] {
    if (!Array.isArray(items)) return [];
    if (!orgId) return items;
    if (GLOBAL_CATALOG_COLLECTIONS.has(collection)) return items;

    const matchDirectOrg = (item: any) => {
      if (!item) return false;
      const itemOrgId = this.extractRelationId(item.organization_id);
      return itemOrgId === Number(orgId);
    };

    switch (collection) {
      case 'organizations':
        return items.filter((o) => Number(o?.id) === Number(orgId));

      case 'organization_users':
        return items.filter((ou) => this.extractRelationId(ou?.organization_id) === Number(orgId));

      case 'inventory_items': {
        const rawVariants = allCollections?.product_variants || this.getRawCollection('product_variants');
        const validVariantIds = new Set(
          this.filterCollectionByOrg('product_variants', rawVariants, orgId, allCollections).map((v: any) => Number(v.id))
        );
        return items.filter((i) => {
          if (matchDirectOrg(i)) return true;
          const varId = this.extractRelationId(i?.variant_id);
          return varId !== undefined && validVariantIds.has(varId);
        });
      }

      case 'warehouse_locations':
      case 'product_variants':
      case 'order_items':
      case 'purchase_order_items':
      case 'stock_transfer_items':
      case 'size_guide_measurements':
      case 'size_guide_values':
      case 'sizes':
      case 'bom_items':
      case 'production_order_items':
      case 'production_stages':
      case 'landed_cost_allocations': {
        const rel = CHILD_PARENT_FILTER_MAP[collection]!;
        const rawParents = allCollections?.[rel.parentCollection] || this.getRawCollection(rel.parentCollection);
        const validParentIds = new Set(
          rawParents.filter(matchDirectOrg).map((p: any) => Number(p.id))
        );
        return items.filter((child) => {
          if (matchDirectOrg(child)) return true;
          const fkVal = this.extractRelationId(child?.[rel.foreignKey]);
          return fkVal !== undefined && validParentIds.has(fkVal);
        });
      }

      default:
        return items.filter(matchDirectOrg);
    }
  }

  /**
   * Asynchronous unified reader across Cloud (Directus), Desktop (SQLite), and Web (localStorage).
   */
  public static async readAllCollectionsAsync(orgId?: number): Promise<Record<BackupCollectionKey, any[]>> {
    const result: Record<string, any[]> = {};
    for (const col of BACKUP_COLLECTIONS) {
      result[col] = [];
    }

    try {
      const [{ storageManager }, { directusClient }] = await Promise.all([
        import('./index'),
        import('../api/directus'),
      ]);

      const mode = storageManager.getMode();

      // 1. Cloud Mode
      if (mode === 'cloud_synced' && directusClient.getToken()) {
        for (const col of BACKUP_COLLECTIONS) {
          try {
            let items: any[] = [];
            if (col === 'organizations') {
              items = await directusClient.getItems<any>('organizations', {
                filter: orgId ? { id: { _eq: orgId } } : undefined,
                limit: 100,
              });
            } else if (GLOBAL_CATALOG_COLLECTIONS.has(col)) {
              items = await directusClient.getItems<any>(col, { limit: 1000 });
            } else if (CHILD_PARENT_FILTER_MAP[col] && orgId) {
              const rel = CHILD_PARENT_FILTER_MAP[col]!;
              try {
                items = await directusClient.getItems<any>(col, {
                  filter: { organization_id: { _eq: orgId } },
                  limit: 5000,
                });
              } catch {
                // Fallback to filtering by already-fetched parent IDs if child lacks organization_id column in cloud
                const parentItems = result[rel.parentCollection] || [];
                const parentIds = parentItems.map((p) => Number(p.id)).filter((id) => Number.isFinite(id) && id > 0);
                if (parentIds.length > 0) {
                  items = await directusClient.getItems<any>(col, {
                    filter: { [rel.foreignKey]: { _in: parentIds } },
                    limit: 5000,
                  });
                }
              }
            } else {
              items = await directusClient.getItems<any>(col, {
                filter: orgId ? { organization_id: { _eq: orgId } } : undefined,
                limit: 5000,
              });
            }

            const normalized = Array.isArray(items) ? items.map((r) => this.normalizeCloudRecord(r)) : [];
            result[col] = orgId ? this.filterCollectionByOrg(col, normalized, orgId, result) : normalized;
          } catch {
            // Fall back to local cache for this collection if endpoint unavailable
            const localRaw = this.getRawCollection(col);
            result[col] = orgId ? this.filterCollectionByOrg(col, localRaw, orgId, result) : localRaw;
          }
        }
        return result as Record<BackupCollectionKey, any[]>;
      }

      // 2. Desktop Tauri SQLite Mode
      if (isTauriEnvironment()) {
        try {
          const Database = (await import('@tauri-apps/plugin-sql')).default;
          const db = await Database.load('sqlite:tankhor.db');
          for (const col of BACKUP_COLLECTIONS) {
            try {
              const rows =
                orgId && !GLOBAL_CATALOG_COLLECTIONS.has(col)
                  ? await db.select<{ data: string }[]>(
                      `SELECT data FROM ${col} WHERE organization_id = $1 OR organization_id IS NULL OR organization_id = 0`,
                      [orgId]
                    )
                  : await db.select<{ data: string }[]>(`SELECT data FROM ${col}`);

              const parsed = rows
                .map((r) => {
                  try {
                    return JSON.parse(r.data);
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean);

              result[col] = orgId ? this.filterCollectionByOrg(col, parsed, orgId, result) : parsed;
            } catch {
              const fallback = this.getRawCollection(col);
              result[col] = orgId ? this.filterCollectionByOrg(col, fallback, orgId, result) : fallback;
            }
          }
          return result as Record<BackupCollectionKey, any[]>;
        } catch (sqliteErr) {
          console.warn('[BackupManager] Falling back to localStorage while reading collections:', sqliteErr);
        }
      }
    } catch (err) {
      console.warn('[BackupManager] Fallback to localStorage collections:', err);
    }

    // 3. Browser localStorage Mode
    for (const col of BACKUP_COLLECTIONS) {
      const raw = this.getRawCollection(col);
      result[col] = orgId ? this.filterCollectionByOrg(col, raw, orgId, result) : raw;
    }
    return result as Record<BackupCollectionKey, any[]>;
  }

  /**
   * Synchronous summary stats from localStorage (used by synchronous migration helpers)
   */
  public static getLocalStats(orgId?: number): Record<string, number> {
    const stats: Record<string, number> = {};
    const collected: Partial<Record<BackupCollectionKey, any[]>> = {};
    for (const key of BACKUP_COLLECTIONS) {
      const raw = this.getRawCollection(key);
      const filtered = orgId ? this.filterCollectionByOrg(key, raw, orgId, collected) : raw;
      collected[key] = filtered;
      stats[key] = filtered.length;
    }
    return stats;
  }

  /**
   * Asynchronous summary counts across Cloud, Desktop SQLite, and Web localStorage
   */
  public static async getBackupStatsAsync(orgId?: number): Promise<Record<string, number>> {
    const collections = await this.readAllCollectionsAsync(orgId);
    const stats: Record<string, number> = {};
    for (const key of BACKUP_COLLECTIONS) {
      stats[key] = collections[key]?.length || 0;
    }
    return stats;
  }

  private static buildBackupPayload(
    collections: Record<string, any[]>,
    organization?: { id: number; name: string; slug?: string } | null
  ): TankhorBackupFile {
    const data: Record<string, any[]> = {};
    const summary: Record<string, number> = {};
    let totalRecords = 0;

    for (const col of BACKUP_COLLECTIONS) {
      const scopedItems = Array.isArray(collections[col]) ? collections[col] : [];
      data[col] = scopedItems;
      summary[col] = scopedItems.length;
      totalRecords += scopedItems.length;
    }

    const now = new Date();
    const metadata: TankhorBackupMetadata = {
      app: 'Clozito',
      signature: 'tankhor_full_backup_v1',
      version: APP_VERSION || '1.2.0',
      exported_at: now.toISOString(),
      exported_at_jalali: formatDate(now.toISOString(), true),
      total_records: totalRecords,
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          }
        : undefined,
      collections_summary: summary,
    };

    return { metadata, data };
  }

  /**
   * Synchronous localStorage backup generator (preserved for synchronous callers)
   */
  public static generateBackup(organization?: { id: number; name: string; slug?: string } | null): TankhorBackupFile {
    const collections: Record<string, any[]> = {};
    const orgId = organization?.id ? Number(organization.id) : undefined;

    for (const col of BACKUP_COLLECTIONS) {
      const rawItems = this.getRawCollection(col);
      collections[col] = orgId ? this.filterCollectionByOrg(col, rawItems, orgId, collections) : rawItems;
    }

    return this.buildBackupPayload(collections, organization);
  }

  /**
   * Asynchronous backup generator (supports Cloud, Desktop SQLite, and Browser localStorage)
   */
  public static async generateBackupAsync(
    organization?: { id: number; name: string; slug?: string } | null
  ): Promise<TankhorBackupFile> {
    const orgId = organization?.id ? Number(organization.id) : undefined;
    const collections = await this.readAllCollectionsAsync(orgId);
    return this.buildBackupPayload(collections, organization);
  }

  /**
   * Synchronous export backup file (localStorage only)
   */
  public static exportBackupFile(organization?: { id: number; name: string; slug?: string } | null): void {
    const backupObj = this.generateBackup(organization);
    const jsonStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const orgSlug = organization?.slug || 'clozito';
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerBlobDownload(blob, `clozito_backup_${orgSlug}_${dateStr}.json`);
  }

  /**
   * Asynchronous export backup file (reads live Cloud / SQLite / localStorage data)
   */
  public static async exportBackupFileAsync(
    organization?: { id: number; name: string; slug?: string } | null
  ): Promise<{ success: boolean; totalRecords: number; fileName: string }> {
    const backupObj = await this.generateBackupAsync(organization);
    const jsonStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const orgSlug = organization?.slug || 'clozito';
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `clozito_backup_${orgSlug}_${dateStr}.json`;
    triggerBlobDownload(blob, fileName);
    return {
      success: true,
      totalRecords: backupObj.metadata.total_records,
      fileName,
    };
  }

  /**
   * Validates and inspects an uploaded backup JSON file
   */
  public static inspectBackupFile(content: string): InspectionResult {
    try {
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object') {
        return { valid: false, error: 'The uploaded file does not contain valid JSON.' };
      }

      const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
      const metadata: TankhorBackupMetadata = parsed.metadata || {
        app: 'Clozito',
        signature: 'tankhor_legacy_backup',
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        exported_at_jalali: formatDate(new Date().toISOString(), true),
        total_records: 0,
        collections_summary: {},
      };

      const summary: Record<string, number> = {};
      let total = 0;

      for (const col of BACKUP_COLLECTIONS) {
        if (Array.isArray(data[col])) {
          summary[col] = data[col].length;
          total += data[col].length;
        } else {
          summary[col] = 0;
        }
      }

      metadata.total_records = total;
      metadata.collections_summary = summary;

      if (total === 0) {
        return { valid: false, error: 'The selected file does not contain valid Clozito backup data.' };
      }

      return {
        valid: true,
        metadata,
        collections: summary,
        data,
      };
    } catch (e: any) {
      return { valid: false, error: `Failed to read backup file: ${e.message || 'Invalid format'}` };
    }
  }

  /**
   * Restores data from a backup object with strict tenant isolation & SQLite/Cloud synchronization
   */
  public static async restoreBackup(
    backupData: Record<string, any[]>,
    mode: 'replace' | 'merge' = 'replace',
    targetOrgId?: number,
    skipCloudSync: boolean = false
  ): Promise<{ success: boolean; restoredCount: number; warning?: string; error?: string }> {
    try {
      let totalRestored = 0;
      const activeOrgId = Number(targetOrgId || localStorage.getItem('tankhor_active_org_id') || 1);
      const touchedCollections: BackupCollectionKey[] = [];

      for (const col of BACKUP_COLLECTIONS) {
        const incoming = backupData[col];
        if (!Array.isArray(incoming)) continue;

        // Global system_modules catalog: never strip/replace with empty array
        if (GLOBAL_CATALOG_COLLECTIONS.has(col)) {
          if (incoming.length > 0) {
            this.setRawCollection(col, incoming);
            touchedCollections.push(col);
            totalRestored += incoming.length;
          }
          continue;
        }

        // Preserve target organization identity while allowing org metadata updates when matching
        if (col === 'organizations') {
          if (incoming.length === 0) continue;
          const existingOrgs = this.getRawCollection('organizations');
          const otherOrgs = existingOrgs.filter((o) => Number(o?.id) !== activeOrgId);
          const matchingIncoming = incoming.find((o) => Number(o?.id) === activeOrgId) || incoming[0];
          const updatedActiveOrg = { ...matchingIncoming, id: activeOrgId };
          this.setRawCollection('organizations', [...otherOrgs, updatedActiveOrg]);
          touchedCollections.push(col);
          totalRestored += 1;
          continue;
        }

        // Remap tenant organization_id to activeOrgId so restored records appear under the current organization
        const normalizedIncoming = incoming
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            ...this.normalizeCloudRecord(item),
            organization_id: activeOrgId,
          }));

        if (mode === 'replace') {
          const existing = this.getRawCollection(col);
          const otherOrgsItems = existing.filter((item) => {
            const itemOrg = this.extractRelationId(item?.organization_id);
            return itemOrg !== undefined && itemOrg !== activeOrgId;
          });

          const finalCollection = [...otherOrgsItems, ...normalizedIncoming];
          this.setRawCollection(col, finalCollection);
          touchedCollections.push(col);
          totalRestored += normalizedIncoming.length;
        } else {
          // Merge mode: update matching IDs within activeOrgId or append new records
          const existing = this.getRawCollection(col);
          const existingIndexById = new Map<string, number>();
          existing.forEach((item, idx) => {
            const itemOrg = this.extractRelationId(item?.organization_id);
            if (itemOrg === undefined || itemOrg === activeOrgId) {
              existingIndexById.set(String(item.id), idx);
            }
          });
          const merged = [...existing];

          for (const item of normalizedIncoming) {
            const idStr = String(item.id);
            const idx = existingIndexById.get(idStr);
            if (idx !== undefined) {
              merged[idx] = { ...merged[idx], ...item, organization_id: activeOrgId };
            } else {
              merged.push(item);
              existingIndexById.set(idStr, merged.length - 1);
            }
          }

          this.setRawCollection(col, merged);
          touchedCollections.push(col);
          totalRestored += normalizedIncoming.length;
        }
      }

      if (activeOrgId) {
        localStorage.setItem('tankhor_active_org_id', String(activeOrgId));
      }

      // Desktop Tauri SQLite transactional synchronization
      let sqliteSynced = false;
      if (isTauriEnvironment()) {
        try {
          const Database = (await import('@tauri-apps/plugin-sql')).default;
          const db = await Database.load('sqlite:tankhor.db');
          await db.execute('BEGIN TRANSACTION');
          try {
            for (const col of BACKUP_COLLECTIONS) {
              if (!touchedCollections.includes(col) && mode !== 'replace') continue;
              if (GLOBAL_CATALOG_COLLECTIONS.has(col) && (!Array.isArray(backupData[col]) || backupData[col].length === 0)) {
                continue;
              }
              if (mode === 'replace' && col !== 'organizations' && col !== 'organization_users') {
                try {
                  await db.execute(
                    `DELETE FROM ${col} WHERE organization_id = $1 OR organization_id IS NULL OR organization_id = 0`,
                    [activeOrgId]
                  );
                } catch {}
              }
              const currentItems = this.getRawCollection(col);
              for (const item of currentItems) {
                if (!item || !item.id) continue;
                const itemOrgId =
                  col === 'organizations'
                    ? Number(item.id)
                    : this.extractRelationId(item.organization_id) || activeOrgId;
                if (itemOrgId !== activeOrgId && col !== 'organizations' && !GLOBAL_CATALOG_COLLECTIONS.has(col)) {
                  continue;
                }
                await db.execute(
                  `INSERT OR REPLACE INTO ${col} (id, organization_id, data, date_updated) VALUES ($1, $2, $3, datetime('now'))`,
                  [item.id, itemOrgId, JSON.stringify(item)]
                );
              }
            }
            await db.execute('COMMIT');
            sqliteSynced = true;
          } catch (txErr) {
            await db.execute('ROLLBACK');
            throw txErr;
          }
        } catch (dbErr) {
          console.warn('[BackupManager] SQLite sync warning during restore:', dbErr);
        }
      }

      // Sync with Cloud ONLY when actively operating in cloud_synced mode (unless skipped)
      let warning: string | undefined;
      if (!skipCloudSync) {
        try {
          const [{ storageManager }, { directusClient }] = await Promise.all([
            import('./index'),
            import('../api/directus'),
          ]);
          if (storageManager.getMode() === 'cloud_synced' && Boolean(directusClient.getToken())) {
            const { CloudMigrationManager } = await import('./cloudMigrationManager');
            const cloudRes = await CloudMigrationManager.migrateLocalToCloud(activeOrgId);
            if (!cloudRes.success && cloudRes.errors.length > 0) {
              warning = `Local restore completed, but syncing some records to Cloud failed: ${cloudRes.errors[0]}`;
            }
          }
        } catch (cloudErr: any) {
          console.warn('[BackupManager] Cloud sync warning during restore:', cloudErr);
          warning = `Local restore completed, but Cloud sync did not finish: ${cloudErr?.message || ''}`;
        }
      }

      // Notify the application
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tankhor_data_restored', {
            detail: {
              timestamp: new Date().toISOString(),
              mode,
              count: totalRestored,
              skipSqliteSync: sqliteSynced,
            },
          })
        );
      }

      return { success: true, restoredCount: totalRestored, warning };
    } catch (e: any) {
      return { success: false, restoredCount: 0, error: e.message || 'Failed to restore backup data' };
    }
  }

  private static buildCsvFromItems(collectionName: BackupCollectionKey, items: any[]): CsvExportResult {
    if (!items || items.length === 0) {
      return {
        success: false,
        count: 0,
        message: 'No data available in this collection for CSV export.',
      };
    }

    const allKeys = Array.from(new Set(items.flatMap((item) => (item && typeof item === 'object' ? Object.keys(item) : []))));
    // Keep any field unless every non-null occurrence is an array or plain non-id nested object
    const exportKeys = allKeys.filter((k) => {
      for (const item of items) {
        const val = item?.[k];
        if (val === null || val === undefined) continue;
        if (Array.isArray(val)) return false;
        if (typeof val === 'object') {
          return 'id' in val || 'name' in val || 'title' in val;
        }
        return true;
      }
      return true;
    });

    const formatCell = (val: any): string => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') {
        if ('name' in val && val.name) return String(val.name);
        if ('title' in val && val.title) return String(val.title);
        if ('id' in val) return String(val.id);
        return '';
      }
      return String(val);
    };

    const csvRows: string[] = [];
    csvRows.push(exportKeys.map((k) => escapeCsvCell(k)).join(','));

    for (const item of items) {
      const row = exportKeys.map((k) => escapeCsvCell(formatCell(item?.[k])));
      csvRows.push(row.join(','));
    }

    const fileName = `clozito_${collectionName}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsvContent(csvRows.join('\n'), fileName);

    return {
      success: true,
      count: items.length,
      message: `CSV export downloaded successfully (${items.length} rows).`,
    };
  }

  /**
   * Synchronous single-collection CSV export from localStorage (no alert())
   */
  public static exportToCsv(collectionName: BackupCollectionKey, orgId?: number): CsvExportResult {
    let items = this.getRawCollection(collectionName);
    if (orgId) {
      items = this.filterCollectionByOrg(collectionName, items, orgId);
    }
    return this.buildCsvFromItems(collectionName, items);
  }

  /**
   * Asynchronous single-collection CSV export across Cloud, SQLite, and localStorage
   */
  public static async exportToCsvAsync(collectionName: BackupCollectionKey, orgId?: number): Promise<CsvExportResult> {
    const collections = await this.readAllCollectionsAsync(orgId);
    const items = collections[collectionName] || [];
    return this.buildCsvFromItems(collectionName, items);
  }

  /**
   * Seeds rich, realistic demo data tailored for European fashion/apparel boutiques (EN / IT)
   */
  public static async seedFashionDemoData(activeOrgId: number = 1): Promise<{ success: boolean; message: string }> {
    const isIt = getActiveLocale() === 'it';
    try {
      const orgs = this.getRawCollection('organizations');
      let targetOrg = orgs.find((o) => Number(o.id) === Number(activeOrgId));
      if (!targetOrg) {
        targetOrg = {
          id: activeOrgId,
          name: isIt ? `${BRAND.name} Atelier Milano` : `${BRAND.name} Fashion Boutique`,
          slug: 'clozito-boutique',
          currency: BRAND.defaultCurrency,
          timezone: BRAND.defaultTimezone,
          plan: 'free',
          status: 'active',
          date_created: new Date().toISOString(),
        };
        this.setRawCollection('organizations', [...orgs, targetOrg]);
        localStorage.setItem('tankhor_active_org_id', String(activeOrgId));
      }

      // 1. Categories
      const categories = [
        { id: 101, organization_id: activeOrgId, name: isIt ? 'Cappotti e Giubbotti' : 'Coats & Outerwear', slug: 'coats-outerwear', type: 'apparel', status: 'active' },
        { id: 102, organization_id: activeOrgId, name: isIt ? 'Felpe e Maglieria' : 'Hoodies & Knitwear', slug: 'hoodies-knitwear', type: 'apparel', status: 'active' },
        { id: 103, organization_id: activeOrgId, name: isIt ? 'Pantaloni e Denim' : 'Trousers & Denim', slug: 'trousers-denim', type: 'apparel', status: 'active' },
        { id: 104, organization_id: activeOrgId, name: isIt ? 'Borse e Pelletteria' : 'Bags & Leather Goods', slug: 'bags-leather', type: 'bags', status: 'active' },
        { id: 105, organization_id: activeOrgId, name: isIt ? 'Calzature e Sneakers' : 'Footwear & Sneakers', slug: 'footwear-sneakers', type: 'shoes', status: 'active' },
      ];
      this.setRawCollection('categories', categories);

      // 2. Brands
      const brands = [
        { id: 201, organization_id: activeOrgId, name: 'Atelier Bellini', slug: 'atelier-bellini', status: 'active' },
        { id: 202, organization_id: activeOrgId, name: 'Nordic Loom', slug: 'nordic-loom', status: 'active' },
        { id: 203, organization_id: activeOrgId, name: 'Casa Verve', slug: 'casa-verve', status: 'active' },
        { id: 204, organization_id: activeOrgId, name: `${BRAND.name} Studio`, slug: 'clozito-studio', status: 'active' },
      ];
      this.setRawCollection('brands', brands);

      // 3. Seasons & Collections
      const seasons = [
        { id: 301, organization_id: activeOrgId, name: isIt ? 'Autunno / Inverno 2025' : 'Autumn / Winter 2025', code: 'FW2025', status: 'active' },
        { id: 302, organization_id: activeOrgId, name: isIt ? 'Primavera / Estate 2026' : 'Spring / Summer 2026', code: 'SS2026', status: 'active' },
      ];
      this.setRawCollection('seasons', seasons);

      const collections = [
        { id: 401, organization_id: activeOrgId, name: isIt ? 'Collezione Minimal Casual' : 'Minimal Casual Capsule', slug: 'minimal-casual', season_id: 301, status: 'active' },
        { id: 402, organization_id: activeOrgId, name: isIt ? 'Collezione Sartoriale Sera' : 'Evening Tailored Edit', slug: 'evening-tailored', season_id: 301, status: 'active' },
      ];
      this.setRawCollection('collections', collections);

      // 4. Colors
      const colors = [
        { id: 501, organization_id: activeOrgId, name: isIt ? 'Nero Opaco' : 'Matte Black', code: 'BLK', hex: '#18181b', status: 'active' },
        { id: 502, organization_id: activeOrgId, name: isIt ? 'Beige Cammello' : 'Warm Camel', code: 'CML', hex: '#d4b996', status: 'active' },
        { id: 503, organization_id: activeOrgId, name: isIt ? 'Grigio Melange' : 'Heather Grey', code: 'GRY', hex: '#9ca3af', status: 'active' },
        { id: 504, organization_id: activeOrgId, name: isIt ? 'Verde Salvia' : 'Sage Green', code: 'SGE', hex: '#5b7065', status: 'active' },
        { id: 505, organization_id: activeOrgId, name: isIt ? 'Blu Notte' : 'Midnight Navy', code: 'NVY', hex: '#1e293b', status: 'active' },
      ];
      this.setRawCollection('colors', colors);

      // 5. Size Groups & Sizes
      const sizeGroups = [
        { id: 601, organization_id: activeOrgId, name: isIt ? 'Taglie Abbigliamento Standard (S - XL)' : 'Standard Apparel Sizes (S - XL)', category: 'apparel', type: 'apparel', status: 'active' },
        { id: 602, organization_id: activeOrgId, name: isIt ? 'Taglie EU Pantaloni (38 - 44)' : 'EU Trousers Sizes (38 - 44)', category: 'apparel', type: 'apparel', status: 'active' },
        { id: 603, organization_id: activeOrgId, name: isIt ? 'Taglie EU Calzature (38 - 42)' : 'EU Footwear Sizes (38 - 42)', category: 'shoes', type: 'shoes', status: 'active' },
      ];
      this.setRawCollection('size_groups', sizeGroups);

      const sizes = [
        { id: 701, organization_id: activeOrgId, size_group_id: 601, name: 'Small (S)', code: 'S', sort_order: 1 },
        { id: 702, organization_id: activeOrgId, size_group_id: 601, name: 'Medium (M)', code: 'M', sort_order: 2 },
        { id: 703, organization_id: activeOrgId, size_group_id: 601, name: 'Large (L)', code: 'L', sort_order: 3 },
        { id: 704, organization_id: activeOrgId, size_group_id: 601, name: 'X-Large (XL)', code: 'XL', sort_order: 4 },
        { id: 705, organization_id: activeOrgId, size_group_id: 602, name: 'EU 38', code: '38', sort_order: 1 },
        { id: 706, organization_id: activeOrgId, size_group_id: 602, name: 'EU 40', code: '40', sort_order: 2 },
        { id: 707, organization_id: activeOrgId, size_group_id: 602, name: 'EU 42', code: '42', sort_order: 3 },
        { id: 708, organization_id: activeOrgId, size_group_id: 603, name: 'EU 38', code: '38', sort_order: 1 },
        { id: 709, organization_id: activeOrgId, size_group_id: 603, name: 'EU 39', code: '39', sort_order: 2 },
        { id: 710, organization_id: activeOrgId, size_group_id: 603, name: 'EU 40', code: '40', sort_order: 3 },
      ];
      this.setRawCollection('sizes', sizes);

      // 6. Warehouses & Locations
      const warehouses = [
        { id: 801, organization_id: activeOrgId, name: isIt ? 'Magazzino Centrale Milano' : 'Milan Central Warehouse', code: 'WH-MAIN', type: 'warehouse', is_default: true, status: 'active' },
        { id: 802, organization_id: activeOrgId, name: isIt ? 'Boutique Flagship Brera' : 'Brera Flagship Boutique', code: 'WH-BRERA', type: 'store', is_default: false, status: 'active' },
      ];
      this.setRawCollection('warehouses', warehouses);

      const locations = [
        { id: 901, organization_id: activeOrgId, warehouse_id: 801, name: isIt ? 'Scaffale A-01 (Cappotti Invernali)' : 'Aisle A-01 (Winter Outerwear)', code: 'LOC-A01' },
        { id: 902, organization_id: activeOrgId, warehouse_id: 801, name: isIt ? 'Scaffale B-03 (Denim e Pantaloni)' : 'Aisle B-03 (Denim & Trousers)', code: 'LOC-B03' },
        { id: 903, organization_id: activeOrgId, warehouse_id: 802, name: isIt ? 'Espositore Ingresso Showroom' : 'Showroom Front Rack', code: 'LOC-FRONT' },
      ];
      this.setRawCollection('warehouse_locations', locations);

      // 7. Products
      const products = [
        {
          id: 1001,
          organization_id: activeOrgId,
          title: isIt ? 'Cappotto Sartoriale in Lana Doppiopetto' : 'Double-Breasted Tailored Wool Coat',
          slug: 'double-breasted-tailored-wool-coat',
          code: 'PRD-1001',
          category_id: 101,
          brand_id: 201,
          collection_id: 401,
          season_id: 301,
          size_guide_template_id: 7001,
          gender: 'women',
          material: isIt ? '80% Lana Vergine Italiana, 20% Cashmere' : '80% Italian Virgin Wool, 20% Cashmere',
          description: isIt ? '80% Lana Vergine Italiana, 20% Cashmere' : '80% Italian Virgin Wool, 20% Cashmere',
          status: 'published',
          date_created: new Date().toISOString(),
        },
        {
          id: 1002,
          organization_id: activeOrgId,
          title: isIt ? 'Felpa Oversize con Cappuccio in Cotone Organico' : 'Heavyweight Organic Cotton Oversized Hoodie',
          slug: 'heavyweight-organic-cotton-oversized-hoodie',
          code: 'PRD-1002',
          category_id: 102,
          brand_id: 204,
          collection_id: 401,
          season_id: 301,
          size_guide_template_id: 7002,
          gender: 'unisex',
          material: isIt ? '100% Cotone Organico 420gsm' : '100% Organic Cotton Fleece 420gsm',
          description: isIt ? '100% Cotone Organico 420gsm' : '100% Organic Cotton Fleece 420gsm',
          status: 'published',
          date_created: new Date().toISOString(),
        },
        {
          id: 1003,
          organization_id: activeOrgId,
          title: isIt ? 'Jeans Relaxed Fit a Vita Alta Lavaggio Vintage' : 'High-Waist Relaxed Vintage Wash Denim',
          slug: 'high-waist-relaxed-vintage-wash-denim',
          code: 'PRD-1003',
          category_id: 103,
          brand_id: 202,
          collection_id: 401,
          season_id: 301,
          gender: 'women',
          material: isIt ? '100% Denim Selvedge Cotone' : '100% Cotton Selvedge Denim',
          description: isIt ? '100% Denim Selvedge Cotone' : '100% Cotton Selvedge Denim',
          status: 'published',
          date_created: new Date().toISOString(),
        },
        {
          id: 1004,
          organization_id: activeOrgId,
          title: isIt ? 'Sneakers Basse in Pelle Naturale Artigianali' : 'Artisanal Full-Grain Leather Low Sneakers',
          slug: 'artisanal-full-grain-leather-low-sneakers',
          code: 'PRD-1004',
          category_id: 105,
          brand_id: 203,
          collection_id: 402,
          season_id: 302,
          gender: 'unisex',
          material: isIt ? 'Pelle di Vitello Pieno Fiore, Suola Margom' : 'Full-Grain Calfskin Leather, Margom Sole',
          description: isIt ? 'Pelle di Vitello Pieno Fiore, Suola Margom' : 'Full-Grain Calfskin Leather, Margom Sole',
          status: 'published',
          date_created: new Date().toISOString(),
        },
      ];
      this.setRawCollection('products', products);

      // 8. Variants & Inventory (EUR Pricing)
      const variants = [
        { id: 2001, organization_id: activeOrgId, product_id: 1001, sku: 'COAT-BLK-M', barcode: '8051001010012', color_id: 501, size_id: 702, price: 249.00, regular_price: 279.00, sale_price: 249.00, cost: 118.00, cost_price: 118.00, status: 'active' },
        { id: 2002, organization_id: activeOrgId, product_id: 1001, sku: 'COAT-BLK-L', barcode: '8051001010029', color_id: 501, size_id: 703, price: 249.00, regular_price: 279.00, sale_price: 249.00, cost: 118.00, cost_price: 118.00, status: 'active' },
        { id: 2003, organization_id: activeOrgId, product_id: 1001, sku: 'COAT-CML-M', barcode: '8051001010036', color_id: 502, size_id: 702, price: 279.00, regular_price: 279.00, sale_price: 279.00, cost: 125.00, cost_price: 125.00, status: 'active' },
        { id: 2004, organization_id: activeOrgId, product_id: 1002, sku: 'HD-GRY-L', barcode: '8051002010019', color_id: 503, size_id: 703, price: 89.00, regular_price: 98.00, sale_price: 89.00, cost: 38.00, cost_price: 38.00, status: 'active' },
        { id: 2005, organization_id: activeOrgId, product_id: 1002, sku: 'HD-GRY-XL', barcode: '8051002010026', color_id: 503, size_id: 704, price: 89.00, regular_price: 98.00, sale_price: 89.00, cost: 38.00, cost_price: 38.00, status: 'active' },
        { id: 2006, organization_id: activeOrgId, product_id: 1002, sku: 'HD-SGE-L', barcode: '8051002010033', color_id: 504, size_id: 703, price: 98.00, regular_price: 98.00, sale_price: 98.00, cost: 38.00, cost_price: 38.00, status: 'active' },
        { id: 2007, organization_id: activeOrgId, product_id: 1003, sku: 'DNM-NVY-38', barcode: '8051003010016', color_id: 505, size_id: 705, price: 119.00, regular_price: 119.00, sale_price: 119.00, cost: 49.00, cost_price: 49.00, status: 'active' },
        { id: 2008, organization_id: activeOrgId, product_id: 1003, sku: 'DNM-NVY-40', barcode: '8051003010023', color_id: 505, size_id: 706, price: 119.00, regular_price: 119.00, sale_price: 119.00, cost: 49.00, cost_price: 49.00, status: 'active' },
        { id: 2009, organization_id: activeOrgId, product_id: 1004, sku: 'SNK-CML-38', barcode: '8051004010013', color_id: 502, size_id: 708, price: 165.00, regular_price: 165.00, sale_price: 165.00, cost: 72.00, cost_price: 72.00, status: 'active' },
        { id: 2010, organization_id: activeOrgId, product_id: 1004, sku: 'SNK-CML-39', barcode: '8051004010020', color_id: 502, size_id: 709, price: 165.00, regular_price: 165.00, sale_price: 165.00, cost: 72.00, cost_price: 72.00, status: 'active' },
      ];
      this.setRawCollection('product_variants', variants);

      const inventory = [
        { id: 3001, organization_id: activeOrgId, variant_id: 2001, warehouse_id: 801, location_id: 901, quantity: 18, reserved_quantity: 2, available_quantity: 16, damaged_quantity: 0, reorder_point: 5, safety_stock: 5 },
        { id: 3002, organization_id: activeOrgId, variant_id: 2002, warehouse_id: 801, location_id: 901, quantity: 12, reserved_quantity: 0, available_quantity: 12, damaged_quantity: 0, reorder_point: 5, safety_stock: 4 },
        { id: 3003, organization_id: activeOrgId, variant_id: 2003, warehouse_id: 802, location_id: 903, quantity: 8, reserved_quantity: 1, available_quantity: 7, damaged_quantity: 0, reorder_point: 5, safety_stock: 3 },
        { id: 3004, organization_id: activeOrgId, variant_id: 2004, warehouse_id: 801, location_id: 901, quantity: 35, reserved_quantity: 4, available_quantity: 31, damaged_quantity: 0, reorder_point: 10, safety_stock: 10 },
        { id: 3005, organization_id: activeOrgId, variant_id: 2005, warehouse_id: 801, location_id: 901, quantity: 24, reserved_quantity: 2, available_quantity: 22, damaged_quantity: 0, reorder_point: 8, safety_stock: 8 },
        { id: 3006, organization_id: activeOrgId, variant_id: 2006, warehouse_id: 802, location_id: 903, quantity: 15, reserved_quantity: 0, available_quantity: 15, damaged_quantity: 0, reorder_point: 5, safety_stock: 5 },
        { id: 3007, organization_id: activeOrgId, variant_id: 2007, warehouse_id: 801, location_id: 902, quantity: 28, reserved_quantity: 3, available_quantity: 25, damaged_quantity: 0, reorder_point: 6, safety_stock: 6 },
        { id: 3008, organization_id: activeOrgId, variant_id: 2008, warehouse_id: 801, location_id: 902, quantity: 20, reserved_quantity: 1, available_quantity: 19, damaged_quantity: 0, reorder_point: 6, safety_stock: 6 },
        { id: 3009, organization_id: activeOrgId, variant_id: 2009, warehouse_id: 802, location_id: 903, quantity: 10, reserved_quantity: 0, available_quantity: 10, damaged_quantity: 0, reorder_point: 3, safety_stock: 3 },
        { id: 3010, organization_id: activeOrgId, variant_id: 2010, warehouse_id: 802, location_id: 903, quantity: 14, reserved_quantity: 1, available_quantity: 13, damaged_quantity: 0, reorder_point: 4, safety_stock: 4 },
      ];
      this.setRawCollection('inventory_items', inventory);

      // 9. Customers
      const customers = [
        { id: 4001, organization_id: activeOrgId, name: 'Sofia Conti', first_name: 'Sofia', last_name: 'Conti', phone: '+39 347 551 2233', email: 'sofia.conti@example.eu', city: 'Milano', address: 'Via Solferino 18, 20121 Milano', status: 'active', total_orders: 4, total_spent: 840.00 },
        { id: 4002, organization_id: activeOrgId, name: 'Marco Rossi', first_name: 'Marco', last_name: 'Rossi', phone: '+39 338 442 5566', email: 'marco.rossi@example.eu', city: 'Firenze', address: 'Via Tornabuoni 12, 50123 Firenze', status: 'active', total_orders: 2, total_spent: 385.00 },
        { id: 4003, organization_id: activeOrgId, name: 'Claire Laurent', first_name: 'Claire', last_name: 'Laurent', phone: '+33 6 19 88 99 00', email: 'claire.laurent@example.eu', city: 'Paris', address: '24 Rue des Francs-Bourgeois, 75003 Paris', status: 'active', total_orders: 1, total_spent: 249.00 },
      ];
      this.setRawCollection('customers', customers);

      // 10. Orders
      const orders = [
        {
          id: 5001,
          organization_id: activeOrgId,
          order_number: 'ORD-2026-1001',
          customer_id: 4001,
          currency: BRAND.defaultCurrency,
          status: 'completed',
          payment_status: 'paid',
          subtotal: 338.00,
          discount: 18.00,
          tax: 0,
          total: 320.00,
          paid_amount: 320.00,
          order_date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
          date_created: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
          payment_method: 'card',
          warehouse_id: 801,
        },
        {
          id: 5002,
          organization_id: activeOrgId,
          order_number: 'ORD-2026-1002',
          customer_id: 4002,
          currency: BRAND.defaultCurrency,
          status: 'processing',
          payment_status: 'paid',
          subtotal: 119.00,
          discount: 0,
          tax: 0,
          total: 119.00,
          paid_amount: 119.00,
          order_date: new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10),
          date_created: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
          payment_method: 'online',
          warehouse_id: 801,
        },
      ];
      this.setRawCollection('orders', orders);

      const orderItems = [
        { id: 6001, organization_id: activeOrgId, order_id: 5001, variant_id: 2001, quantity: 1, unit_price: 249.00, discount: 0, total: 249.00 },
        { id: 6002, organization_id: activeOrgId, order_id: 5001, variant_id: 2004, quantity: 1, unit_price: 89.00, discount: 0, total: 89.00 },
        { id: 6003, organization_id: activeOrgId, order_id: 5002, variant_id: 2007, quantity: 1, unit_price: 119.00, discount: 0, total: 119.00 },
      ];
      this.setRawCollection('order_items', orderItems);

      // 11. Size Guide Templates & Measurements
      const sizeGuides = [
        {
          id: 7001,
          organization_id: activeOrgId,
          name: isIt ? 'Guida Taglie Cappotti Donna' : 'Women Outerwear Size Guide',
          title: isIt ? 'Guida Taglie Cappotti Donna' : 'Women Outerwear Size Guide',
          type: 'apparel',
          template_type: 'apparel',
          category_id: 101,
          unit: 'cm',
          status: 'active',
          description: isIt ? 'Misure capo per cappotti sartoriali e trench' : 'Garment measurements for tailored wool coats and trenches',
        },
        {
          id: 7002,
          organization_id: activeOrgId,
          name: isIt ? 'Tabella Taglie Felpe Oversize' : 'Oversized Knitwear & Hoodie Chart',
          title: isIt ? 'Tabella Taglie Felpe Oversize' : 'Oversized Knitwear & Hoodie Chart',
          type: 'apparel',
          template_type: 'apparel',
          category_id: 102,
          unit: 'cm',
          status: 'active',
          description: isIt ? 'Vestibilità comoda unisex per felpe e maglie' : 'Relaxed unisex fit for heavyweight hoodies and sweaters',
        },
      ];
      this.setRawCollection('size_guide_templates', sizeGuides);

      const measurements = [
        { id: 8001, organization_id: activeOrgId, template_id: 7001, name: isIt ? 'Circonferenza Torace' : 'Chest', code: 'chest', unit: 'cm', type: 'circumference', status: 'active', sort: 1, description: isIt ? 'Misurato nel punto più ampio del torace' : 'Measured across the fullest part of the chest' },
        { id: 8002, organization_id: activeOrgId, template_id: 7001, name: isIt ? 'Larghezza Spalle' : 'Shoulder Width', code: 'shoulder', unit: 'cm', type: 'width', status: 'active', sort: 2, description: isIt ? 'Da cucitura spalla a spalla' : 'Seam to seam across the upper back' },
        { id: 8003, organization_id: activeOrgId, template_id: 7001, name: isIt ? 'Lunghezza Manica' : 'Sleeve Length', code: 'sleeve', unit: 'cm', type: 'length', status: 'active', sort: 3, description: isIt ? 'Dalla spalla fino al polso' : 'From shoulder seam to cuff edge' },
        { id: 8004, organization_id: activeOrgId, template_id: 7001, name: isIt ? 'Lunghezza Capo' : 'Garment Length', code: 'length', unit: 'cm', type: 'length', status: 'active', sort: 4, description: isIt ? 'Dal collo fino all\'orlo inferiore' : 'From high point shoulder to bottom hem' },
      ];
      this.setRawCollection('size_guide_measurements', measurements);

      const values = [
        { id: 9001, organization_id: activeOrgId, template_id: 7001, measurement_id: 8001, size_id: 702, value: 94, value_exact: 94 },
        { id: 9002, organization_id: activeOrgId, template_id: 7001, measurement_id: 8001, size_id: 703, value: 100, value_exact: 100 },
        { id: 9003, organization_id: activeOrgId, template_id: 7001, measurement_id: 8002, size_id: 702, value: 40, value_exact: 40 },
        { id: 9004, organization_id: activeOrgId, template_id: 7001, measurement_id: 8002, size_id: 703, value: 43, value_exact: 43 },
        { id: 9005, organization_id: activeOrgId, template_id: 7001, measurement_id: 8003, size_id: 702, value: 60, value_exact: 60 },
        { id: 9006, organization_id: activeOrgId, template_id: 7001, measurement_id: 8003, size_id: 703, value: 62, value_exact: 62 },
        { id: 9007, organization_id: activeOrgId, template_id: 7001, measurement_id: 8004, size_id: 702, value: 110, value_exact: 110 },
        { id: 9008, organization_id: activeOrgId, template_id: 7001, measurement_id: 8004, size_id: 703, value: 112, value_exact: 112 },
      ];
      this.setRawCollection('size_guide_values', values);

      // 12. Inventory Movements
      const movements = [
        { id: 10001, organization_id: activeOrgId, variant_id: 2001, warehouse_id: 801, type: 'purchase', quantity: 20, reference_type: 'manual', reference_id: 'PO-2026-01', created_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString() },
        { id: 10002, organization_id: activeOrgId, variant_id: 2001, warehouse_id: 801, type: 'sale', quantity: 2, reference_type: 'order', reference_id: 'ORD-2026-1001', created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
        { id: 10003, organization_id: activeOrgId, variant_id: 2004, warehouse_id: 801, type: 'sale', quantity: 1, reference_type: 'order', reference_id: 'ORD-2026-1001', created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
        { id: 10004, organization_id: activeOrgId, variant_id: 2007, warehouse_id: 801, type: 'sale', quantity: 1, reference_type: 'order', reference_id: 'ORD-2026-1002', created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString() },
      ];
      this.setRawCollection('inventory_movements', movements);

      // Desktop SQLite sync inside transaction
      let sqliteSynced = false;
      if (isTauriEnvironment()) {
        try {
          const Database = (await import('@tauri-apps/plugin-sql')).default;
          const db = await Database.load('sqlite:tankhor.db');
          const allSeeded: [string, any[]][] = [
            ['organizations', [targetOrg]],
            ['categories', categories],
            ['brands', brands],
            ['seasons', seasons],
            ['collections', collections],
            ['colors', colors],
            ['size_groups', sizeGroups],
            ['sizes', sizes],
            ['warehouses', warehouses],
            ['warehouse_locations', locations],
            ['products', products],
            ['product_variants', variants],
            ['inventory_items', inventory],
            ['inventory_movements', movements],
            ['customers', customers],
            ['orders', orders],
            ['order_items', orderItems],
            ['size_guide_templates', sizeGuides],
            ['size_guide_measurements', measurements],
            ['size_guide_values', values],
          ];

          await db.execute('BEGIN TRANSACTION');
          try {
            for (const [col, items] of allSeeded) {
              if (col !== 'organizations') {
                await db.execute(
                  `DELETE FROM ${col} WHERE organization_id = $1 OR organization_id IS NULL OR organization_id = 0`,
                  [activeOrgId]
                );
              }
              for (const item of items) {
                const orgId = this.extractRelationId(item.organization_id) || activeOrgId;
                await db.execute(
                  `INSERT OR REPLACE INTO ${col} (id, organization_id, data, date_updated) VALUES ($1, $2, $3, datetime('now'))`,
                  [item.id, orgId, JSON.stringify(item)]
                );
              }
            }
            await db.execute('COMMIT');
            sqliteSynced = true;
          } catch (txErr) {
            await db.execute('ROLLBACK');
            throw txErr;
          }
        } catch (dbErr) {
          console.warn('[BackupManager] SQLite sync warning during demo seed:', dbErr);
        }
      }

      // Sync with Cloud ONLY if currently in Cloud Mode
      try {
        const { storageManager } = await import('./index');
        if (storageManager.getMode() === 'cloud_synced') {
          const { CloudMigrationManager } = await import('./cloudMigrationManager');
          await CloudMigrationManager.migrateLocalToCloud(activeOrgId);
        }
      } catch (cloudErr) {
        console.warn('[BackupManager] Cloud sync warning during demo seed:', cloudErr);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tankhor_data_restored', {
            detail: { timestamp: new Date().toISOString(), type: 'demo_seeded', skipSqliteSync: sqliteSynced },
          })
        );
      }

      return {
        success: true,
        message: isIt
          ? 'Dati dimostrativi moda e magazzino caricati con successo.'
          : 'Fashion boutique demo dataset loaded successfully.',
      };
    } catch (e: any) {
      return {
        success: false,
        message: isIt
          ? `Errore nel caricamento dei dati demo: ${e.message}`
          : `Failed to load demo dataset: ${e.message}`,
      };
    }
  }

  /**
   * Resets local collections for a specific organization
   */
  public static async clearLocalData(
    preserveOrganization: boolean = true,
    targetOrgId?: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      const activeOrgId = Number(targetOrgId || localStorage.getItem('tankhor_active_org_id') || 1);
      const orgs = this.getRawCollection('organizations');
      const activeOrg = orgs.find((o) => Number(o.id) === activeOrgId);

      for (const col of BACKUP_COLLECTIONS) {
        if (GLOBAL_CATALOG_COLLECTIONS.has(col)) continue;
        if (preserveOrganization && (col === 'organizations' || col === 'organization_users')) {
          continue;
        }

        const existing = this.getRawCollection(col);
        const otherOrgsItems = existing.filter((item) => {
          const itemOrg = this.extractRelationId(item?.organization_id);
          return itemOrg !== undefined && itemOrg !== activeOrgId;
        });

        if (otherOrgsItems.length > 0) {
          this.setRawCollection(col, otherOrgsItems);
        } else {
          localStorage.removeItem(`tankhor_db_${col}`);
        }
      }

      if (preserveOrganization && activeOrg) {
        const remainingOrgs = orgs.filter((o) => Number(o.id) !== activeOrgId);
        this.setRawCollection('organizations', [...remainingOrgs, activeOrg]);
      }

      let sqliteCleared = false;
      if (isTauriEnvironment()) {
        try {
          const Database = (await import('@tauri-apps/plugin-sql')).default;
          const db = await Database.load('sqlite:tankhor.db');
          await db.execute('BEGIN TRANSACTION');
          try {
            for (const col of BACKUP_COLLECTIONS) {
              if (GLOBAL_CATALOG_COLLECTIONS.has(col)) continue;
              if (preserveOrganization && (col === 'organizations' || col === 'organization_users')) {
                continue;
              }
              try {
                await db.execute(
                  `DELETE FROM ${col} WHERE organization_id = $1 OR organization_id IS NULL OR organization_id = 0`,
                  [activeOrgId]
                );
              } catch {}
            }
            await db.execute('COMMIT');
            sqliteCleared = true;
          } catch (txErr) {
            await db.execute('ROLLBACK');
            throw txErr;
          }
        } catch (dbErr) {
          console.warn('[BackupManager] SQLite clear warning:', dbErr);
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tankhor_data_restored', {
            detail: { timestamp: new Date().toISOString(), type: 'cleared', skipSqliteSync: sqliteCleared },
          })
        );
      }

      return { success: true, message: 'Local organization data cleared successfully.' };
    } catch (e: any) {
      return { success: false, message: `Failed to clear local data: ${e.message}` };
    }
  }
}
