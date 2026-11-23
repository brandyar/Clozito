import { Order, Organization } from '../types';
import { formatCurrency, formatDate, resolveCurrencyCode } from './formatters';
import { printHtml } from './print';
import { mediaManager } from './mediaManager';
import { BRAND } from '../config/brand';

export interface OrderItemPrintData {
  id?: number;
  productTitle: string;
  sku: string;
  colorName?: string;
  sizeName?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
}

function escapeHtml(value: unknown): string {
  const str = value == null ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isItalianDoc(): boolean {
  return typeof document !== 'undefined' && document.documentElement.lang === 'it';
}

export function generateOrderInvoiceHtml(
  order: Order,
  items: OrderItemPrintData[],
  organization?: Organization | null,
  _isPersian: boolean = false,
  format: 'standard' | 'thermal' = 'standard',
  resolvedLogoUrl?: string,
  resolvedSignatureUrl?: string
): string {
  const isIt = isItalianDoc();
  const currency = resolveCurrencyCode(organization?.currency);
  const orgName = escapeHtml(organization?.name || BRAND.name);
  const orgPhone = escapeHtml(organization?.phone || '');
  const orgMobile = escapeHtml(organization?.mobile || '');
  const orgAddress = escapeHtml(organization?.address || '');
  const logoSrc = resolvedLogoUrl || (organization?.logo ? mediaManager.getDisplayUrlSync(organization.logo) : '');
  const signatureSrc = resolvedSignatureUrl || (organization?.signature ? mediaManager.getDisplayUrlSync(organization.signature) : '');
  const orderNumber = escapeHtml(order.order_number || `ORD-${order.id}`);
  const orderDate = escapeHtml(formatDate(order.date_created, false));
  const customerName = escapeHtml(order.customer_name || (isIt ? 'Cliente di passaggio' : 'Walk-in Customer'));
  const warehouseName = escapeHtml((order as any).warehouse_name || (isIt ? 'Magazzino Principale' : 'Main Warehouse'));
  const subtotal = Number(order.subtotal) || 0;
  const discount = Number(order.discount) || 0;
  const tax = Number(order.tax) || 0;
  const total = Number(order.total) || 0;
  const notes = escapeHtml(order.notes || (isIt ? 'Grazie per il tuo acquisto.' : 'Thank you for your business.'));

  const L = isIt
    ? {
        receiptTitle: 'Ricevuta di Vendita',
        invoiceTitle: 'Fattura di Vendita',
        tel: 'Tel',
        mobile: 'Cell',
        address: 'Indirizzo',
        number: 'N.',
        invoiceNo: 'Numero Fattura',
        issueDate: 'Data Emissione',
        date: 'Data',
        customer: 'Cliente',
        warehouse: 'Magazzino / Punto Vendita',
        item: 'Articolo',
        itemDesc: 'Descrizione Articolo',
        qty: 'Qtà',
        unitPrice: 'Prezzo Unit.',
        discount: 'Sconto',
        amount: 'Importo',
        subtotal: 'Subtotale',
        totalDiscount: 'Totale Sconti',
        tax: 'IVA / Imposte',
        grandTotal: 'Totale Dovuto',
        notesTitle: 'Note e Condizioni',
        sellerSig: 'Timbro e Firma Venditore',
        buyerSig: 'Firma Cliente / Destinatario',
        size: 'Taglia',
        color: 'Colore',
        row: '#',
      }
    : {
        receiptTitle: 'Sales Receipt',
        invoiceTitle: 'Sales Invoice',
        tel: 'Tel',
        mobile: 'Mobile',
        address: 'Address',
        number: 'No.',
        invoiceNo: 'Invoice No.',
        issueDate: 'Issue Date',
        date: 'Date',
        customer: 'Customer',
        warehouse: 'Warehouse / Store',
        item: 'Item',
        itemDesc: 'Item Description',
        qty: 'Qty',
        unitPrice: 'Unit Price',
        discount: 'Discount',
        amount: 'Amount',
        subtotal: 'Subtotal',
        totalDiscount: 'Total Discount',
        tax: 'VAT / Tax',
        grandTotal: 'Total Payable',
        notesTitle: 'Notes & Terms',
        sellerSig: 'Seller Stamp & Signature',
        buyerSig: 'Customer / Recipient Signature',
        size: 'Size',
        color: 'Color',
        row: '#',
      };

  if (format === 'thermal') {
    const rowsHtml = items.map((it) => `
      <tr style="border-bottom: 1px dashed #999;">
        <td style="padding: 4px 2px; text-align: left; vertical-align: top;">
          <div style="font-weight: bold; font-size: 11px;">${escapeHtml(it.productTitle)}</div>
          <div style="font-size: 9px; color: #555; font-family: monospace;">
            SKU: ${escapeHtml(it.sku)}${it.sizeName ? ` | ${L.size}: ${escapeHtml(it.sizeName)}` : ''}${it.colorName ? ` | ${L.color}: ${escapeHtml(it.colorName)}` : ''}
          </div>
        </td>
        <td style="padding: 4px 2px; text-align: center; vertical-align: top; font-weight: bold; font-size: 11px;">
          ${it.quantity}
        </td>
        <td style="padding: 4px 2px; text-align: right; vertical-align: top; font-weight: bold; font-size: 11px; font-family: monospace;">
          ${formatCurrency(it.total, currency, false)}
        </td>
      </tr>
    `).join('');

    return `
      <div style="width: 78mm; max-width: 78mm; margin: 0 auto; padding: 4mm 2mm; font-family: 'Inter', system-ui, sans-serif; direction: ltr; color: #000; font-size: 11px; line-height: 1.4;">
        <div style="text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          ${logoSrc ? `<div style="margin-bottom: 5px;"><img src="${escapeHtml(logoSrc)}" alt="Logo" style="max-height: 40px; max-width: 100px; object-fit: contain; margin: 0 auto;" /></div>` : ''}
          <h2 style="font-size: 14px; font-weight: 900; margin: 0 0 3px 0;">${orgName}</h2>
          ${(orgPhone || orgMobile) ? `
            <div style="font-size: 9.5px; color: #222; margin-bottom: 2px;">
              ${orgPhone ? `<span>${L.tel}: ${orgPhone}</span>` : ''}
              ${(orgPhone && orgMobile) ? ' · ' : ''}
              ${orgMobile ? `<span>${L.mobile}: ${orgMobile}</span>` : ''}
            </div>
          ` : ''}
          ${orgAddress ? `<div style="font-size: 9px; color: #444; margin-bottom: 3px; line-height: 1.3;">${orgAddress}</div>` : ''}
          <div style="font-size: 11px; font-weight: bold; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.04em;">${L.receiptTitle}</div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 4px; font-family: monospace;">
            <span>${L.number} ${orderNumber}</span>
            <span>${orderDate}</span>
          </div>
        </div>

        <div style="margin-bottom: 6px; font-size: 10.5px; border-bottom: 1px dashed #ccc; padding-bottom: 4px;">
          <div><strong>${L.customer}:</strong> ${customerName}</div>
          <div><strong>${L.warehouse}:</strong> ${warehouseName}</div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <thead>
            <tr style="border-bottom: 1.5px solid #000; font-weight: bold; font-size: 10.5px;">
              <th style="padding: 3px 2px; text-align: left;">${L.item}</th>
              <th style="padding: 3px 2px; text-align: center; width: 35px;">${L.qty}</th>
              <th style="padding: 3px 2px; text-align: right;">${L.amount}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="border-top: 1.5px dashed #000; padding-top: 6px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>${L.subtotal}:</span>
            <span style="font-family: monospace;">${formatCurrency(subtotal, currency, false)}</span>
          </div>
          ${discount > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #c00;">
            <span>${L.discount}:</span>
            <span style="font-family: monospace;">- ${formatCurrency(discount, currency, false)}</span>
          </div>` : ''}
          ${tax > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>${L.tax}:</span>
            <span style="font-family: monospace;">+ ${formatCurrency(tax, currency, false)}</span>
          </div>` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 13px; border-top: 1.5px solid #000; padding-top: 4px; margin-top: 4px;">
            <span>${L.grandTotal}:</span>
            <span style="font-family: monospace;">${formatCurrency(total, currency, false)}</span>
          </div>
        </div>

        ${signatureSrc ? `
          <div style="text-align: center; margin-top: 8px; margin-bottom: 4px; border-top: 1px dashed #bbb; padding-top: 6px;">
            <div style="font-size: 8.5px; color: #555; margin-bottom: 3px; font-weight: bold;">${L.sellerSig}</div>
            <img src="${escapeHtml(signatureSrc)}" alt="Signature" style="max-height: 48px; max-width: 120px; object-fit: contain; margin: 0 auto; filter: grayscale(100%) contrast(150%);" />
          </div>
        ` : ''}

        <div style="text-align: center; margin-top: 10px; padding-top: 6px; border-top: 1px dashed #999; font-size: 9.5px; color: #444;">
          ${notes}
        </div>
      </div>
    `;
  }

  // Standard Official A4 Invoice
  const rowsHtml = items.map((it, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 6px 8px; text-align: center; border-inline-end: 1px solid #e2e8f0; font-family: monospace;">
        ${idx + 1}
      </td>
      <td style="padding: 6px 8px; text-align: left; border-inline-end: 1px solid #e2e8f0;">
        <div style="font-weight: bold; color: #0f172a;">${escapeHtml(it.productTitle)}</div>
        <div style="font-size: 9.5px; color: #64748b; font-family: monospace; margin-top: 1px;">
          SKU: ${escapeHtml(it.sku)}${it.sizeName ? ` | ${L.size}: ${escapeHtml(it.sizeName)}` : ''}${it.colorName ? ` | ${L.color}: ${escapeHtml(it.colorName)}` : ''}
        </div>
      </td>
      <td style="padding: 6px 8px; text-align: center; border-inline-end: 1px solid #e2e8f0; font-weight: bold; font-family: monospace;">
        ${it.quantity}
      </td>
      <td style="padding: 6px 8px; text-align: right; border-inline-end: 1px solid #e2e8f0; font-family: monospace;">
        ${formatCurrency(it.unitPrice, currency, false)}
      </td>
      <td style="padding: 6px 8px; text-align: right; border-inline-end: 1px solid #e2e8f0; font-family: monospace; color: #dc2626;">
        ${it.discount && it.discount > 0 ? `- ${formatCurrency(it.discount * it.quantity, currency, false)}` : '—'}
      </td>
      <td style="padding: 6px 8px; text-align: right; font-weight: bold; font-family: monospace; color: #0f172a;">
        ${formatCurrency(it.total, currency, false)}
      </td>
    </tr>
  `).join('');

  return `
    <div style="max-width: 210mm; margin: 0 auto; padding: 10mm 8mm; font-family: 'Inter', system-ui, sans-serif; direction: ltr; color: #0f172a; font-size: 12px; line-height: 1.5; background: #fff;">
      <!-- Invoice Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${logoSrc ? `
            <div style="width: 70px; height: 70px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 4px; background: #ffffff; display: flex; align-items: center; justify-content: center; overflow: hidden;">
              <img src="${escapeHtml(logoSrc)}" alt="Logo" style="max-height: 62px; max-width: 62px; object-fit: contain;" />
            </div>
          ` : ''}
          <div>
            <h1 style="font-size: 18px; font-weight: 900; margin: 0 0 4px 0; color: #0f172a; text-transform: uppercase; letter-spacing: 0.02em;">${L.invoiceTitle}</h1>
            <div style="font-size: 13.5px; font-weight: bold; color: #1e293b;">${orgName}</div>
            ${(orgPhone || orgMobile) ? `
              <div style="font-size: 11px; color: #475569; margin-top: 2px;">
                ${orgPhone ? `<span>${L.tel}: <strong>${orgPhone}</strong></span>` : ''}
                ${(orgPhone && orgMobile) ? ' | ' : ''}
                ${orgMobile ? `<span>${L.mobile}: <strong>${orgMobile}</strong></span>` : ''}
              </div>
            ` : ''}
            ${orgAddress ? `
              <div style="font-size: 10.5px; color: #64748b; margin-top: 2px; max-width: 500px;">
                ${L.address}: ${orgAddress}
              </div>
            ` : ''}
          </div>
        </div>

        <div style="text-align: right; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc;">
          <div><strong>${L.invoiceNo}:</strong> <span style="font-family: monospace; font-weight: bold;">${orderNumber}</span></div>
          <div><strong>${L.issueDate}:</strong> <span style="font-family: monospace;">${orderDate}</span></div>
        </div>
      </div>

      <!-- Parties Information -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc; font-size: 11.5px;">
        <div>
          <span style="color: #64748b;">${L.customer}:</span>
          <div style="font-size: 12.5px; font-weight: bold; color: #0f172a; margin-top: 2px;">${customerName}</div>
        </div>
        <div>
          <span style="color: #64748b;">${L.warehouse}:</span>
          <div style="font-size: 12.5px; font-weight: bold; color: #0f172a; margin-top: 2px;">${warehouseName}</div>
        </div>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; margin-bottom: 14px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1; font-weight: bold; font-size: 11px; color: #334155;">
            <th style="padding: 8px 6px; text-align: center; width: 40px; border-inline-end: 1px solid #cbd5e1;">${L.row}</th>
            <th style="padding: 8px 10px; text-align: left; border-inline-end: 1px solid #cbd5e1;">${L.itemDesc}</th>
            <th style="padding: 8px 6px; text-align: center; width: 60px; border-inline-end: 1px solid #cbd5e1;">${L.qty}</th>
            <th style="padding: 8px 8px; text-align: right; width: 110px; border-inline-end: 1px solid #cbd5e1;">${L.unitPrice} (${currency})</th>
            <th style="padding: 8px 8px; text-align: right; width: 95px; border-inline-end: 1px solid #cbd5e1;">${L.discount}</th>
            <th style="padding: 8px 8px; text-align: right; width: 120px;">${L.amount} (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Footer Summary & Remarks -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 20px;">
        <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #f8fafc; font-size: 11px; min-height: 75px;">
          <div style="font-weight: bold; color: #334155; margin-bottom: 4px;">${L.notesTitle}:</div>
          <div style="color: #64748b; line-height: 1.5;">${notes}</div>
        </div>

        <div style="width: 260px; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #ffffff; font-size: 11.5px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #475569;">
            <span>${L.subtotal}:</span>
            <span style="font-family: monospace; font-weight: bold;">${formatCurrency(subtotal, currency, false)}</span>
          </div>
          ${discount > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #dc2626;">
            <span>${L.totalDiscount}:</span>
            <span style="font-family: monospace; font-weight: bold;">- ${formatCurrency(discount, currency, false)}</span>
          </div>` : ''}
          ${tax > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #475569;">
            <span>${L.tax}:</span>
            <span style="font-family: monospace; font-weight: bold;">+ ${formatCurrency(tax, currency, false)}</span>
          </div>` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 13.5px; border-top: 1.5px solid #0f172a; padding-top: 6px; margin-top: 6px; color: #0f172a;">
            <span>${L.grandTotal}:</span>
            <span style="font-family: monospace; color: #059669;">${formatCurrency(total, currency, false)}</span>
          </div>
        </div>
      </div>

      <!-- Signatures -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #475569;">
        <div style="text-align: center; width: 190px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;">
          ${signatureSrc ? `
            <div style="min-height: 65px; max-height: 85px; display: flex; align-items: center; justify-content: center; margin-bottom: 5px;">
              <img src="${escapeHtml(signatureSrc)}" alt="Seller Signature" style="max-height: 75px; max-width: 170px; object-fit: contain;" />
            </div>
          ` : `
            <div style="height: 55px;"></div>
          `}
          <div style="width: 100%; border-top: 1.5px solid #94a3b8; padding-top: 5px; font-weight: bold; color: #1e293b;">
            ${L.sellerSig}
          </div>
        </div>

        <div style="text-align: center; width: 190px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;">
          <div style="height: 55px;"></div>
          <div style="width: 100%; border-top: 1.5px solid #94a3b8; padding-top: 5px; font-weight: bold; color: #1e293b;">
            ${L.buyerSig}
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function printOrderInvoice(
  order: Order,
  items: OrderItemPrintData[],
  organization?: Organization | null,
  isPersian: boolean = false,
  format: 'standard' | 'thermal' = 'standard'
): Promise<void> {
  let resolvedLogoUrl = '';
  if (organization?.logo) {
    try {
      resolvedLogoUrl = await mediaManager.getDisplayUrl(organization.logo);
    } catch {
      resolvedLogoUrl = mediaManager.getDisplayUrlSync(organization.logo);
    }
  }
  let resolvedSignatureUrl = '';
  if (organization?.signature) {
    try {
      resolvedSignatureUrl = await mediaManager.getDisplayUrl(organization.signature);
    } catch {
      resolvedSignatureUrl = mediaManager.getDisplayUrlSync(organization.signature);
    }
  }
  const html = generateOrderInvoiceHtml(
    order,
    items,
    organization,
    isPersian,
    format,
    resolvedLogoUrl,
    resolvedSignatureUrl
  );
  printHtml(html, {
    title: `Invoice_${order.order_number || order.id}`,
    extraStyles: `
      @page {
        size: ${format === 'thermal' ? '80mm auto' : 'A4 portrait'};
        margin: ${format === 'thermal' ? '0mm' : '5mm'};
      }
    `,
  });
}
