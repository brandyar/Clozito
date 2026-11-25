import * as XLSX from 'xlsx';
import {
  Product,
  ProductVariant,
  InventoryItem,
  Order,
  Category,
  Brand,
  Collection,
  Season,
  Color,
  Size,
  Warehouse,
  Customer,
  OrderStatus,
  PaymentStatus,
} from '../types';
import { normalizeId } from './formatters';
import { BRAND } from '../config/brand';

const FILE_PREFIX = BRAND.name.toLowerCase();

export interface ExcelImportResult<T> {
  success: boolean;
  importedCount: number;
  updatedCount: number;
  errors: string[];
  items: T[];
}

/**
 * Trigger browser/WebView download for a binary/text Blob safely with object URL cleanup
 */
export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Trigger browser download for an Excel workbook
 */
export function downloadWorkbook(workbook: XLSX.WorkBook, fileName: string) {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, fileName);
}

/**
 * Trigger browser download for UTF-8 BOM CSV content (Excel compatible)
 */
export function downloadCsvContent(csvContent: string, fileName: string) {
  const contentWithBom = csvContent.startsWith('\uFEFF') ? csvContent : '\uFEFF' + csvContent;
  const blob = new Blob([contentWithBom], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, fileName);
}

/**
 * Safely escape a single CSV field (protects quotes and newlines)
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// =============================================================
// INTERNAL NORMALIZATION & PARSING HELPERS
// =============================================================

export function toEnglishDigits(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return ch;
  });
}

function normalizeHeaderKey(key: string): string {
  return toEnglishDigits(key)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u200C\u200B\u200D\uFEFF]/g, ' ')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRowKeys(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const normKey = normalizeHeaderKey(k);
    if (normKey && (normalized[normKey] === undefined || normalized[normKey] === '')) {
      normalized[normKey] = v;
    }
  }
  return normalized;
}

function getCell(normRow: Record<string, any>, aliases: string[]): string {
  for (const alias of aliases) {
    const normAlias = normalizeHeaderKey(alias);
    const val = normRow[normAlias];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function getNumericCell(normRow: Record<string, any>, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const normAlias = normalizeHeaderKey(alias);
    const val = normRow[normAlias];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      if (typeof val === 'number' && !isNaN(val)) return val;
      const cleaned = toEnglishDigits(val)
        .replace(/[€$£\s]/g, '')
        .replace(/eur|usd|gbp/gi, '')
        .replace(/,/g, '')
        .trim();
      if (!cleaned) continue;
      const num = Number(cleaned);
      if (!isNaN(num)) return num;
    }
  }
  return undefined;
}

function parseExcelDateToIso(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') {
    return new Date().toISOString();
  }
  // Excel numeric serial date
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const utcDays = Math.floor(raw - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString();
    }
  }

  const str = toEnglishDigits(raw).trim();
  if (!str) return new Date().toISOString();

  // Check YYYY/MM/DD or YYYY-MM-DD
  const match = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00.000Z`;
    const parsed = new Date(isoStr);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // Check DD/MM/YYYY or DD-MM-YYYY (common in Europe)
  const euMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (euMatch) {
    const day = Number(euMatch[1]);
    const month = Number(euMatch[2]);
    const year = Number(euMatch[3]);
    const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00.000Z`;
    const parsed = new Date(isoStr);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

function normalizePhone(raw: unknown): string {
  const cleaned = toEnglishDigits(raw).replace(/[\s\-()]/g, '').trim();
  return cleaned;
}

/**
 * -------------------------------------------------------------
 * 1. PRODUCTS & VARIANTS EXCEL EXPORT & IMPORT
 * -------------------------------------------------------------
 */

export interface ProductExportRow {
  'Product Code': string;
  'Product Title': string;
  'Category': string;
  'Brand': string;
  'Collection': string;
  'Season': string;
  'Gender': string;
  'Material': string;
  'Product Status': string;
  'SKU': string;
  'Barcode': string;
  'Color': string;
  'Color Hex': string;
  'Size': string;
  'Sale Price': number;
  'Cost Price': number;
  'Wholesale Price': number;
  'Weight (g)': number;
  'Current Stock': number;
  'Variant Status': string;
}

export interface ParsedProductRow {
  rowNumber: number;
  productCode: string;
  title: string;
  categoryName: string;
  brandName: string;
  collectionName: string;
  seasonName: string;
  gender: string;
  material: string;
  productStatus: 'published' | 'draft';
  sku: string;
  barcode: string;
  colorName: string;
  colorHex: string;
  sizeName: string;
  price: number;
  cost: number;
  wholesalePrice: number;
  weightGrams: number;
  stockQuantity?: number;
  variantStatus: 'published' | 'draft';
}

export function exportProductsToExcel(
  products: Product[],
  variants: ProductVariant[],
  categories: Category[],
  brands: Brand[],
  colors: Color[],
  sizes: Size[],
  fileName: string = `${FILE_PREFIX}_products_${new Date().toISOString().slice(0, 10)}.xlsx`,
  extraLookups?: { collections?: Collection[]; seasons?: Season[] }
): number {
  const rows: ProductExportRow[] = [];

  const catMap = new Map(categories.map((c) => [normalizeId(c.id) || Number(c.id), c.name]));
  const brandMap = new Map(brands.map((b) => [normalizeId(b.id) || Number(b.id), b.name]));
  const colMap = new Map((extraLookups?.collections || []).map((c) => [normalizeId(c.id) || Number(c.id), c.name]));
  const seasonMap = new Map((extraLookups?.seasons || []).map((s) => [normalizeId(s.id) || Number(s.id), s.name]));
  const colorMap = new Map(colors.map((c) => [normalizeId(c.id) || Number(c.id), c]));
  const sizeMap = new Map(sizes.map((s) => [normalizeId(s.id) || Number(s.id), s.name]));

  const variantsByProduct = new Map<number, ProductVariant[]>();
  variants.forEach((v) => {
    const pId = normalizeId(v.product_id) || Number(v.product_id);
    if (!pId) return;
    if (!variantsByProduct.has(pId)) {
      variantsByProduct.set(pId, []);
    }
    variantsByProduct.get(pId)!.push(v);
  });

  products.forEach((p) => {
    const pId = normalizeId(p.id) || Number(p.id);
    const pVariants = variantsByProduct.get(pId) || [];
    const catId = normalizeId(p.category_id);
    const brandId = normalizeId(p.brand_id);
    const collectionId = normalizeId(p.collection_id);
    const seasonId = normalizeId(p.season_id);

    const catName = catId ? catMap.get(catId) || '' : '';
    const brandName =
      (brandId ? brandMap.get(brandId) : '') ||
      (typeof p.brand === 'string' ? p.brand : p.brand?.name) ||
      '';
    const collectionName =
      (collectionId ? colMap.get(collectionId) : '') ||
      (typeof (p as any).collection_id === 'object' ? (p as any).collection_id?.name : '') ||
      (p as any).collection_name ||
      '';
    const seasonName =
      (seasonId ? seasonMap.get(seasonId) : '') ||
      (typeof (p as any).season_id === 'object' ? (p as any).season_id?.name : '') ||
      (p as any).season_name ||
      '';

    const statusText = p.status === 'published' || String(p.status) === 'active' ? 'Published' : 'Draft';

    if (pVariants.length === 0) {
      rows.push({
        'Product Code': (p as any).code || p.slug || '',
        'Product Title': p.title || '',
        'Category': catName,
        'Brand': brandName,
        'Collection': collectionName,
        'Season': seasonName,
        'Gender': (p as any).gender || 'unisex',
        'Material': (p as any).material || '',
        'Product Status': statusText,
        'SKU': '',
        'Barcode': '',
        'Color': '',
        'Color Hex': '',
        'Size': '',
        'Sale Price': 0,
        'Cost Price': 0,
        'Wholesale Price': 0,
        'Weight (g)': 0,
        'Current Stock': Number(p.total_stock) || 0,
        'Variant Status': 'Active',
      });
    } else {
      pVariants.forEach((v) => {
        const cId = normalizeId(v.color_id) || Number(v.color_id);
        const sId = normalizeId(v.size_id) || Number(v.size_id);
        const colObj = colorMap.get(cId);
        const colorName = v.color_name && v.color_name !== '-' ? v.color_name : colObj?.name || '';
        const colorHex = (colObj as any)?.hex || (colObj as any)?.hex_code || colObj?.code || '';
        const sizeName = v.size_name && v.size_name !== '-' ? v.size_name : sizeMap.get(sId) || '';

        const salePrice = Number(v.price ?? (v as any).sale_price ?? (v as any).regular_price ?? 0) || 0;
        const costPrice = Number((v as any).cost_price ?? v.cost ?? v.buy_price ?? 0) || 0;
        const wholesalePrice = Number((v as any).wholesale_price ?? 0) || 0;
        const weightGrams = Number((v as any).weight_grams ?? (v as any).weight ?? 0) || 0;

        rows.push({
          'Product Code': (p as any).code || p.slug || '',
          'Product Title': p.title || '',
          'Category': catName,
          'Brand': brandName,
          'Collection': collectionName,
          'Season': seasonName,
          'Gender': (p as any).gender || 'unisex',
          'Material': (p as any).material || '',
          'Product Status': statusText,
          'SKU': v.sku || '',
          'Barcode': v.barcode || '',
          'Color': colorName,
          'Color Hex': colorHex,
          'Size': sizeName,
          'Sale Price': salePrice,
          'Cost Price': costPrice,
          'Wholesale Price': wholesalePrice,
          'Weight (g)': weightGrams,
          'Current Stock': Number(v.stock_quantity) || 0,
          'Variant Status':
            String(v.status) === 'active' || String(v.status) === 'published' ? 'Active' : 'Inactive',
        });
      });
    }
  });

  if (rows.length === 0) return 0;

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products & Variants');
  downloadWorkbook(workbook, fileName);
  return rows.length;
}

export function parseProductsFromExcel(fileBuffer: ArrayBuffer): ExcelImportResult<ParsedProductRow> {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      success: false,
      importedCount: 0,
      updatedCount: 0,
      errors: ['The Excel file is empty or has no valid worksheet.'],
      items: [],
    };
  }
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    return {
      success: false,
      importedCount: 0,
      updatedCount: 0,
      errors: ['No rows were found in the Excel file.'],
      items: [],
    };
  }

  const items: ParsedProductRow[] = [];
  const errors: string[] = [];

  rawRows.forEach((rawRow, idx) => {
    const rowNum = idx + 2;
    const row = normalizeRowKeys(rawRow);
    const title = getCell(row, ['product title', 'title', 'product name', 'name', 'titolo prodotto', 'nome prodotto']);
    if (!title) {
      errors.push(`Row ${rowNum}: Product title is required.`);
      return;
    }

    const statusRaw = getCell(row, ['product status', 'status', 'stato prodotto', 'stato']).toLowerCase();
    const productStatus: 'published' | 'draft' =
      statusRaw === 'draft' || statusRaw === 'inactive' || statusRaw === 'bozza' || statusRaw === 'inattivo'
        ? 'draft'
        : 'published';

    const varStatusRaw = getCell(row, ['variant status', 'stato variante']).toLowerCase();
    const variantStatus: 'published' | 'draft' =
      varStatusRaw === 'inactive' ||
      varStatusRaw === 'disabled' ||
      varStatusRaw === 'draft' ||
      varStatusRaw === 'inattivo' ||
      varStatusRaw === 'bozza'
        ? 'draft'
        : 'published';

    const price = getNumericCell(row, ['sale price', 'price', 'prezzo di vendita', 'prezzo']) ?? 0;
    const cost = getNumericCell(row, ['cost price', 'cost', 'buy price', 'prezzo di costo', 'costo']) ?? 0;
    const wholesalePrice = getNumericCell(row, ['wholesale price', 'prezzo ingrosso']) ?? 0;
    const weightGrams = getNumericCell(row, ['weight (g)', 'weight grams', 'weight', 'peso (g)', 'peso']) ?? 0;
    const stockQuantity = getNumericCell(row, ['current stock', 'stock quantity', 'stock', 'quantity', 'giacenza', 'quantita']);

    if (price < 0 || cost < 0) {
      errors.push(`Row ${rowNum} (${title}): Price or cost cannot be negative.`);
      return;
    }

    items.push({
      rowNumber: rowNum,
      productCode: getCell(row, ['product code', 'code', 'slug', 'codice prodotto']),
      title,
      categoryName: getCell(row, ['category', 'categoria']),
      brandName: getCell(row, ['brand', 'marchio']),
      collectionName: getCell(row, ['collection', 'collezione']),
      seasonName: getCell(row, ['season', 'stagione']),
      gender: getCell(row, ['gender', 'genere']) || 'unisex',
      material: getCell(row, ['material', 'fabric', 'materiale', 'tessuto']),
      productStatus,
      sku: getCell(row, ['sku', 'variant sku', 'codice sku']),
      barcode: toEnglishDigits(getCell(row, ['barcode', 'ean', 'codice a barre'])),
      colorName: getCell(row, ['color', 'colour', 'colore']),
      colorHex: getCell(row, ['color hex', 'hex', 'codice colore']),
      sizeName: getCell(row, ['size', 'taglia']),
      price: Math.max(0, price),
      cost: Math.max(0, cost),
      wholesalePrice: Math.max(0, wholesalePrice),
      weightGrams: Math.max(0, weightGrams),
      stockQuantity: stockQuantity !== undefined ? Math.max(0, stockQuantity) : undefined,
      variantStatus,
    });
  });

  return {
    success: items.length > 0,
    importedCount: items.length,
    updatedCount: 0,
    errors,
    items,
  };
}

/**
 * -------------------------------------------------------------
 * 2. INVENTORY & STOCK EXCEL EXPORT & IMPORT
 * -------------------------------------------------------------
 */

export interface InventoryExportRow {
  'SKU': string;
  'Barcode': string;
  'Product Title': string;
  'Color': string;
  'Size': string;
  'Warehouse': string;
  'Location': string;
  'Physical Stock': number;
  'Reserved Stock': number;
  'Available Stock': number;
  'Reorder Point': number;
  'Safety Stock': number;
  'Unit Price': number;
  'Total Value': number;
}

export interface ParsedInventoryRow {
  rowNumber: number;
  sku: string;
  barcode: string;
  productTitle: string;
  warehouseName: string;
  locationName: string;
  quantity: number;
  reservedQuantity?: number;
  reorderPoint?: number;
  safetyStock?: number;
}

export function exportInventoryToExcel(
  items: InventoryItem[],
  variants: ProductVariant[],
  warehouses: Warehouse[],
  fileName: string = `${FILE_PREFIX}_inventory_${new Date().toISOString().slice(0, 10)}.xlsx`
): number {
  if (!items || items.length === 0) return 0;

  const whMap = new Map(warehouses.map((w) => [normalizeId(w.id) || Number(w.id), w.name]));
  const varMap = new Map(variants.map((v) => [normalizeId(v.id) || Number(v.id), v]));

  const rows: InventoryExportRow[] = items.map((item) => {
    const vId = normalizeId(item.variant_id) || Number(item.variant_id);
    const wId = normalizeId(item.warehouse_id) || Number(item.warehouse_id);
    const v = varMap.get(vId);
    const whName = item.warehouse_name || whMap.get(wId) || 'Main Warehouse';
    const sku = item.sku || v?.sku || '-';
    const barcode = v?.barcode || '-';
    const prodTitle = item.product_title || v?.product_title || '-';
    const colorName =
      item.color_name ||
      v?.color_name ||
      (typeof v?.color_id === 'object' ? (v.color_id as any)?.name : '') ||
      '-';
    const sizeName =
      item.size_name ||
      v?.size_name ||
      (typeof v?.size_id === 'object' ? (v.size_id as any)?.name : '') ||
      '-';

    const qty = Number(item.quantity) || 0;
    const reserved = Number(item.reserved_quantity) || 0;
    const damaged = Number(item.damaged_quantity) || 0;
    const available =
      item.available_quantity !== undefined && item.available_quantity !== null
        ? Number(item.available_quantity)
        : Math.max(0, qty - reserved - damaged);
    const reorderPoint = item.reorder_point !== undefined && item.reorder_point !== null ? Number(item.reorder_point) : 5;
    const safetyStock = item.safety_stock !== undefined && item.safety_stock !== null ? Number(item.safety_stock) : 2;
    const unitPrice = Number(v?.price ?? (v as any)?.sale_price ?? (v as any)?.regular_price ?? 0) || 0;

    return {
      'SKU': sku,
      'Barcode': barcode,
      'Product Title': prodTitle,
      'Color': colorName,
      'Size': sizeName,
      'Warehouse': whName,
      'Location': item.location_name || '-',
      'Physical Stock': qty,
      'Reserved Stock': reserved,
      'Available Stock': available,
      'Reorder Point': reorderPoint,
      'Safety Stock': safetyStock,
      'Unit Price': unitPrice,
      'Total Value': Number((qty * unitPrice).toFixed(2)),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
  downloadWorkbook(workbook, fileName);
  return rows.length;
}

export function parseInventoryFromExcel(fileBuffer: ArrayBuffer): ExcelImportResult<ParsedInventoryRow> {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { success: false, importedCount: 0, updatedCount: 0, errors: ['The Excel file is empty.'], items: [] };
  }
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    return { success: false, importedCount: 0, updatedCount: 0, errors: ['No rows were found in the file.'], items: [] };
  }

  const items: ParsedInventoryRow[] = [];
  const errors: string[] = [];

  rawRows.forEach((rawRow, idx) => {
    const rowNum = idx + 2;
    const row = normalizeRowKeys(rawRow);
    const skuRaw = getCell(row, ['sku', 'codice sku']);
    const barcodeRaw = toEnglishDigits(getCell(row, ['barcode', 'ean', 'codice a barre']));
    const sku = skuRaw === '-' ? '' : skuRaw;
    const barcode = barcodeRaw === '-' ? '' : barcodeRaw;

    if (!sku && !barcode) {
      errors.push(`Row ${rowNum}: SKU or Barcode is required.`);
      return;
    }

    const quantity = getNumericCell(row, ['physical stock', 'quantity', 'qty', 'stock', 'giacenza', 'quantita']);
    if (quantity === undefined || quantity < 0) {
      errors.push(`Row ${rowNum} (${sku || barcode}): Invalid physical stock quantity.`);
      return;
    }

    const reservedQuantity = getNumericCell(row, ['reserved stock', 'reserved', 'reserved quantity', 'riservato']);
    const reorderPoint = getNumericCell(row, ['reorder point', 'punto di riordino']);
    const safetyStock = getNumericCell(row, ['safety stock', 'scorta minima']);

    const whName = getCell(row, ['warehouse', 'warehouse name', 'magazzino']);
    const locName = getCell(row, ['location', 'bin', 'ubicazione']);

    items.push({
      rowNumber: rowNum,
      sku,
      barcode,
      productTitle: getCell(row, ['product title', 'title', 'titolo prodotto']),
      warehouseName: whName === '-' ? '' : whName,
      locationName: locName === '-' ? '' : locName,
      quantity: Math.max(0, quantity),
      reservedQuantity: reservedQuantity !== undefined ? Math.max(0, reservedQuantity) : undefined,
      reorderPoint: reorderPoint !== undefined ? Math.max(0, reorderPoint) : undefined,
      safetyStock: safetyStock !== undefined ? Math.max(0, safetyStock) : undefined,
    });
  });

  return {
    success: items.length > 0,
    importedCount: items.length,
    updatedCount: 0,
    errors,
    items,
  };
}

/**
 * -------------------------------------------------------------
 * 3. ORDERS & SALES EXCEL EXPORT & IMPORT
 * -------------------------------------------------------------
 */

export interface OrderExportRow {
  'Order Number': string;
  'Order Date': string;
  'Customer Name': string;
  'Phone': string;
  'Warehouse': string;
  'Order Status': string;
  'Payment Status': string;
  'Subtotal': number;
  'Discount': number;
  'Tax': number;
  'Total': number;
  'Paid Amount': number;
  'Notes': string;
}

export interface ParsedOrderRow {
  rowNumber: number;
  orderNumber: string;
  dateCreated: string;
  customerName: string;
  customerPhone: string;
  warehouseName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  notes: string;
}

export function exportOrdersToExcel(
  orders: Order[],
  fileName: string = `${FILE_PREFIX}_orders_${new Date().toISOString().slice(0, 10)}.xlsx`,
  lookups?: { customers?: Customer[]; warehouses?: Warehouse[]; isPersian?: boolean }
): number {
  if (!orders || orders.length === 0) return 0;

  const statusLabels: Record<string, string> = {
    completed: 'Completed',
    confirmed: 'Confirmed',
    processing: 'Processing',
    draft: 'Draft',
    cancelled: 'Cancelled',
  };

  const paymentLabels: Record<string, string> = {
    paid: 'Paid',
    pending: 'Pending',
    partially_paid: 'Partially Paid',
  };

  const custMap = new Map((lookups?.customers || []).map((c) => [normalizeId(c.id) || Number(c.id), c]));
  const whMap = new Map((lookups?.warehouses || []).map((w) => [normalizeId(w.id) || Number(w.id), w]));

  const rows: OrderExportRow[] = orders.map((o) => {
    const custId = normalizeId(o.customer_id);
    const cust = custId ? custMap.get(custId) : undefined;
    const whId = normalizeId(o.warehouse_id);
    const wh = whId ? whMap.get(whId) : undefined;

    const total = Number(o.total ?? (o as any).final_amount ?? 0) || 0;
    const paidAmount =
      (o as any).paid_amount !== undefined && (o as any).paid_amount !== null
        ? Number((o as any).paid_amount) || 0
        : o.payment_status === 'paid'
        ? total
        : 0;

    const rawDate = o.order_date || o.date_created || '';
    const dateDisplay = rawDate ? rawDate.slice(0, 10) : '';

    return {
      'Order Number': o.order_number || '',
      'Order Date': dateDisplay,
      'Customer Name': o.customer_name || cust?.name || (cust as any)?.full_name || 'Walk-in Customer',
      'Phone': (o as any).customer_phone || (o as any).customer_mobile || cust?.phone || '-',
      'Warehouse': (o as any).warehouse_name || wh?.name || 'Main Warehouse',
      'Order Status': statusLabels[o.status] || o.status,
      'Payment Status': paymentLabels[o.payment_status] || o.payment_status,
      'Subtotal': Number(o.subtotal ?? (o as any).total_amount ?? total) || 0,
      'Discount': Number(o.discount ?? (o as any).discount_amount ?? 0) || 0,
      'Tax': Number(o.tax ?? (o as any).tax_amount ?? 0) || 0,
      'Total': total,
      'Paid Amount': paidAmount,
      'Notes': o.notes || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
  downloadWorkbook(workbook, fileName);
  return rows.length;
}

export function parseOrdersFromExcel(fileBuffer: ArrayBuffer): ExcelImportResult<ParsedOrderRow> {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { success: false, importedCount: 0, updatedCount: 0, errors: ['The Excel file is empty.'], items: [] };
  }
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    return { success: false, importedCount: 0, updatedCount: 0, errors: ['No rows were found in the file.'], items: [] };
  }

  const items: ParsedOrderRow[] = [];
  const errors: string[] = [];

  const mapOrderStatus = (raw: string): OrderStatus => {
    const s = normalizeHeaderKey(raw);
    if (!s || s === 'completed' || s === 'completato') return 'completed';
    if (s === 'confirmed' || s === 'confermato') return 'confirmed';
    if (s === 'processing' || s === 'in lavorazione') return 'processing';
    if (s === 'draft' || s === 'bozza') return 'draft';
    if (s === 'cancelled' || s === 'canceled' || s === 'annullato') return 'cancelled';
    return 'completed';
  };

  const mapPaymentStatus = (raw: string, total: number, paid: number): PaymentStatus => {
    const s = normalizeHeaderKey(raw);
    if (s === 'paid' || s === 'pagato') return 'paid';
    if (s === 'pending' || s === 'unpaid' || s === 'in attesa' || s === 'non pagato') return 'pending';
    if (s === 'partially paid' || s === 'partial' || s === 'parzialmente pagato') return 'partially_paid';
    if (paid > 0 && total > 0 && paid < total) return 'partially_paid';
    if (paid >= total && total > 0) return 'paid';
    return 'pending';
  };

  rawRows.forEach((rawRow, idx) => {
    const rowNum = idx + 2;
    const row = normalizeRowKeys(rawRow);

    const orderNumber =
      getCell(row, ['order number', 'order no', 'numero ordine']) ||
      `IMP-${Date.now().toString().slice(-5)}-${idx + 1}`;

    const subtotal = getNumericCell(row, ['subtotal', 'subtotale']);
    const discount = getNumericCell(row, ['discount', 'sconto']) ?? 0;
    const tax = getNumericCell(row, ['tax', 'vat', 'iva', 'imposte']) ?? 0;
    const totalCell = getNumericCell(row, ['total', 'totale']);
    const paidCell = getNumericCell(row, ['paid amount', 'paid', 'importo pagato']);

    const total = totalCell ?? Math.max(0, (subtotal ?? 0) - discount + tax);
    const finalSubtotal = subtotal ?? Math.max(0, total + discount - tax);

    if (total <= 0 && finalSubtotal <= 0) {
      errors.push(`Row ${rowNum} (${orderNumber}): Total amount must be greater than zero.`);
      return;
    }

    const rawDate = row['order date'] || row['date'] || row['data ordine'] || row['data'];
    const dateCreated = parseExcelDateToIso(rawDate);
    const status = mapOrderStatus(getCell(row, ['order status', 'status', 'stato ordine', 'stato']));
    const rawPayStatus = getCell(row, ['payment status', 'stato pagamento']);
    const payNorm = normalizeHeaderKey(rawPayStatus);
    const isExplicitlyUnpaid = payNorm === 'pending' || payNorm === 'unpaid' || payNorm === 'non pagato';
    const paidAmount = paidCell !== undefined ? Math.max(0, paidCell) : isExplicitlyUnpaid ? 0 : total;
    const paymentStatus = mapPaymentStatus(rawPayStatus, total, paidAmount);

    const customerPhoneRaw = getCell(row, ['phone', 'customer phone', 'mobile', 'telefono']);
    const customerPhone = customerPhoneRaw === '-' ? '' : normalizePhone(customerPhoneRaw);
    const warehouseRaw = getCell(row, ['warehouse', 'magazzino']);

    items.push({
      rowNumber: rowNum,
      orderNumber,
      dateCreated,
      customerName: getCell(row, ['customer name', 'customer', 'cliente', 'nome cliente']) || 'Walk-in Customer',
      customerPhone,
      warehouseName: warehouseRaw === '-' ? '' : warehouseRaw,
      status,
      paymentStatus,
      subtotal: Math.max(0, finalSubtotal),
      discount: Math.max(0, discount),
      tax: Math.max(0, tax),
      total: Math.max(0, total),
      paidAmount,
      notes: getCell(row, ['notes', 'note']),
    });
  });

  return {
    success: items.length > 0,
    importedCount: items.length,
    updatedCount: 0,
    errors,
    items,
  };
}

/**
 * -------------------------------------------------------------
 * 4. CUSTOMERS EXCEL EXPORT & IMPORT
 * -------------------------------------------------------------
 */

export interface CustomerExportRow {
  'Full Name': string;
  'Phone': string;
  'Mobile': string;
  'Email': string;
  'State / Province': string;
  'City': string;
  'Postal Code': string;
  'Address': string;
  'Notes': string;
  'Status': string;
}

export function exportCustomersToExcel(
  customers: Customer[],
  fileName: string = `${FILE_PREFIX}_customers_${new Date().toISOString().slice(0, 10)}.xlsx`
): number {
  if (!customers || customers.length === 0) return 0;

  const rows: CustomerExportRow[] = customers.map((c) => {
    return {
      'Full Name': c.name || (c as any).full_name || '',
      'Phone': c.phone || '',
      'Mobile': (c as any).mobile || c.phone || '',
      'Email': c.email || '',
      'State / Province': (c as any).province || '',
      'City': (c as any).city || '',
      'Postal Code': (c as any).postal_code || '',
      'Address': c.address || '',
      'Notes': c.notes || '',
      'Status': c.status === 'inactive' ? 'Inactive' : 'Active',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
  downloadWorkbook(workbook, fileName);
  return rows.length;
}

export function parseCustomersFromExcel(fileBuffer: ArrayBuffer): ExcelImportResult<Partial<Customer>> {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { success: false, importedCount: 0, updatedCount: 0, errors: ['The Excel file is empty.'], items: [] };
  }
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    return { success: false, importedCount: 0, updatedCount: 0, errors: ['No rows were found in the Excel file.'], items: [] };
  }

  const items: Partial<Customer>[] = [];
  const errors: string[] = [];

  rawRows.forEach((rawRow, idx) => {
    const row = normalizeRowKeys(rawRow);
    const rawName = getCell(row, ['full name', 'name', 'customer name', 'nome completo', 'nome']);
    if (!rawName) {
      errors.push(`Row ${idx + 2}: Customer name is required.`);
      return;
    }

    const rawPhone = getCell(row, ['phone', 'mobile', 'telefono', 'cellulare']);
    const rawMobile = getCell(row, ['mobile', 'cellulare']) || rawPhone;
    const rawEmail = getCell(row, ['email', 'e-mail']);
    const rawAddress = getCell(row, ['address', 'indirizzo']);
    const rawCity = getCell(row, ['city', 'citta']);
    const rawProvince = getCell(row, ['state / province', 'province', 'state', 'provincia']);
    const rawPostalCode = toEnglishDigits(getCell(row, ['postal code', 'zip', 'cap']));
    const rawNotes = getCell(row, ['notes', 'note']);
    const rawStatus = getCell(row, ['status', 'stato']).toLowerCase();
    const status = rawStatus === 'inactive' || rawStatus === 'inattivo' ? 'inactive' : 'active';

    const addressParts = [
      rawAddress,
      rawCity,
      rawProvince,
      rawPostalCode ? `ZIP: ${rawPostalCode}` : '',
    ].filter((part) => Boolean(part && part.trim()));

    items.push({
      name: rawName,
      phone: normalizePhone(rawMobile || rawPhone),
      email: rawEmail,
      address: addressParts.join(', ') || rawAddress,
      notes: rawNotes,
      status,
    });
  });

  return {
    success: items.length > 0,
    importedCount: items.length,
    updatedCount: 0,
    errors,
    items,
  };
}
