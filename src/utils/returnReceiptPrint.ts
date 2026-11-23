import {
  OrderReturn,
  OrderReturnItem,
  OrderReturnReason,
  OrderReturnSettlementMethod,
  Organization,
} from '../types';
import { formatCurrency, formatDate, resolveCurrencyCode } from './formatters';
import { printHtml } from './print';
import { mediaManager } from './mediaManager';
import { BRAND } from '../config/brand';

export interface ReturnReceiptPrintParams {
  orderReturn: OrderReturn;
  items: OrderReturnItem[];
  organization?: Organization | null;
  format?: 'a4' | 'thermal';
  isPersian?: boolean;
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

function getReasonLabel(reason?: OrderReturnReason, isIt: boolean = false): string {
  const mapIt: Record<OrderReturnReason, string> = {
    size_mismatch: 'Taglia / Vestibilità Errata',
    color_mismatch: 'Colore / Modello Errato',
    defective: 'Difettoso / Danneggiato',
    wrong_item: 'Articolo Errato',
    customer_changed_mind: 'Ripensamento Cliente',
    other: 'Altro',
  };
  const mapEn: Record<OrderReturnReason, string> = {
    size_mismatch: 'Size / Fit Mismatch',
    color_mismatch: 'Color / Style Mismatch',
    defective: 'Defective / Damaged',
    wrong_item: 'Wrong Item Sent',
    customer_changed_mind: 'Customer Changed Mind',
    other: 'Other',
  };
  if (!reason) return '—';
  return (isIt ? mapIt[reason] : mapEn[reason]) || escapeHtml(reason);
}

function getSettlementLabel(method?: OrderReturnSettlementMethod, isIt: boolean = false): string {
  const mapIt: Record<OrderReturnSettlementMethod, string> = {
    cash: 'Contanti',
    pos: 'Terminale POS / Carta',
    card: 'Bonifico / Carta',
    bank: 'Bonifico Bancario',
    store_credit: 'Credito Negozio / Buono',
    credit: 'Conto Cliente',
    none: 'Cambio alla Pari (Nessun Importo)',
  };
  const mapEn: Record<OrderReturnSettlementMethod, string> = {
    cash: 'Cash',
    pos: 'POS Terminal / Card',
    card: 'Card Transfer',
    bank: 'Bank Transfer',
    store_credit: 'Store Credit',
    credit: 'Customer Account (Credit)',
    none: 'Even Exchange (No Payment)',
  };
  if (!method) return '—';
  return (isIt ? mapIt[method] : mapEn[method]) || escapeHtml(method);
}

function renderItemRowThermal(item: OrderReturnItem, currency: string, isIt: boolean): string {
  const title = escapeHtml(item.product_title || (isIt ? 'Articolo' : 'Item'));
  const sku = escapeHtml(item.sku || '-');
  const size = item.size_name ? ` | ${isIt ? 'Taglia' : 'Size'}: ${escapeHtml(item.size_name)}` : '';
  const color = item.color_name ? ` | ${isIt ? 'Colore' : 'Color'}: ${escapeHtml(item.color_name)}` : '';
  const condTag =
    item.item_type === 'returned' && item.condition === 'damaged'
      ? ` <span style="color:#b91c1c;font-weight:bold;">[${isIt ? 'Difettoso' : 'Damaged'}]</span>`
      : '';

  return `
    <tr style="border-bottom: 1px dashed #aaa;">
      <td style="padding: 4px 2px; text-align: left; vertical-align: top;">
        <div style="font-weight: bold; font-size: 10.5px;">${title}${condTag}</div>
        <div style="font-size: 8.5px; color: #555; font-family: monospace;">SKU: ${sku}${size}${color}</div>
      </td>
      <td style="padding: 4px 2px; text-align: center; vertical-align: top; font-weight: bold; font-size: 10.5px;">${item.quantity}</td>
      <td style="padding: 4px 2px; text-align: right; vertical-align: top; font-weight: bold; font-size: 10.5px; font-family: monospace;">${formatCurrency(item.total, currency, false)}</td>
    </tr>
  `;
}

function renderItemRowA4(item: OrderReturnItem, idx: number, currency: string, isIt: boolean): string {
  const title = escapeHtml(item.product_title || (isIt ? 'Articolo' : 'Item'));
  const sku = escapeHtml(item.sku || '-');
  const size = item.size_name ? ` | ${isIt ? 'Taglia' : 'Size'}: ${escapeHtml(item.size_name)}` : '';
  const color = item.color_name ? ` | ${isIt ? 'Colore' : 'Color'}: ${escapeHtml(item.color_name)}` : '';
  const condBadge =
    item.item_type === 'returned'
      ? item.condition === 'damaged'
        ? `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:#fee2e2;color:#991b1b;font-size:9px;font-weight:bold;margin-inline-start:4px;">${isIt ? 'Difettoso' : 'Damaged'}</span>`
        : `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:#dcfce7;color:#166534;font-size:9px;font-weight:bold;margin-inline-start:4px;">${isIt ? 'Rivendibile' : 'Restockable'}</span>`
      : '';

  return `
    <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
      <td style="padding: 6px 8px; text-align: center; border-inline-end: 1px solid #e2e8f0; font-family: monospace;">
        ${idx + 1}
      </td>
      <td style="padding: 6px 8px; text-align: left; border-inline-end: 1px solid #e2e8f0;">
        <div style="font-weight: bold; color: #0f172a;">${title}${condBadge}</div>
        <div style="font-size: 9.5px; color: #64748b; font-family: monospace; margin-top: 1px;">
          SKU: ${sku}${size}${color}
        </div>
      </td>
      <td style="padding: 6px 8px; text-align: center; border-inline-end: 1px solid #e2e8f0; font-weight: bold; font-family: monospace;">
        ${item.quantity}
      </td>
      <td style="padding: 6px 8px; text-align: right; border-inline-end: 1px solid #e2e8f0; font-family: monospace;">
        ${formatCurrency(item.unit_price, currency, false)}
      </td>
      <td style="padding: 6px 8px; text-align: right; font-weight: bold; font-family: monospace; color: #0f172a;">
        ${formatCurrency(item.total, currency, false)}
      </td>
    </tr>
  `;
}

export async function printReturnReceipt({
  orderReturn,
  items,
  organization,
  format = 'a4',
}: ReturnReceiptPrintParams): Promise<void> {
  const isIt = isItalianDoc();
  const currency = resolveCurrencyCode(organization?.currency);

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

  const orgName = escapeHtml(organization?.name || BRAND.name);
  const orgPhone = escapeHtml(organization?.phone || '');
  const orgMobile = escapeHtml(organization?.mobile || '');
  const orgAddress = escapeHtml(organization?.address || '');

  const returnNumber = escapeHtml(orderReturn.return_number || `RET-${orderReturn.id}`);
  const origOrderNum = escapeHtml(
    orderReturn.original_order_number ||
      (typeof orderReturn.original_order_id === 'object'
        ? (orderReturn.original_order_id as any)?.order_number
        : `#${orderReturn.original_order_id}`)
  );
  const dateStr = escapeHtml(formatDate(orderReturn.return_date || orderReturn.date_created, false));
  const customerName = escapeHtml(
    orderReturn.customer_name || (isIt ? 'Cliente di passaggio' : 'Walk-in Customer')
  );
  const warehouseName = escapeHtml(
    orderReturn.warehouse_name || (isIt ? 'Magazzino Principale' : 'Main Warehouse')
  );
  const reasonLabel = escapeHtml(getReasonLabel(orderReturn.reason, isIt));
  const settlementLabel = escapeHtml(getSettlementLabel(orderReturn.settlement_method, isIt));
  const notesHtml = escapeHtml(orderReturn.notes || '');

  const returnedItems = items.filter((i) => i.item_type === 'returned');
  const exchangedItems = items.filter((i) => i.item_type === 'exchanged');

  const returnedTotal = Number(orderReturn.returned_total) || 0;
  const exchangeTotal = Number(orderReturn.exchange_total) || 0;
  const netAmount = Number(orderReturn.net_amount) || 0;
  const isExchange = orderReturn.type === 'exchange';

  const docTitle = isExchange
    ? isIt
      ? 'Ricevuta di Cambio Merce'
      : 'Exchange Receipt'
    : isIt
    ? 'Nota di Credito / Reso Vendita'
    : 'Sales Return Credit Note';

  const netLabel =
    netAmount < 0
      ? isIt
        ? 'Rimborso Dovuto al Cliente:'
        : 'Refund Due to Customer:'
      : netAmount > 0
      ? isIt
        ? 'Differenza Pagata dal Cliente:'
        : 'Difference Paid by Customer:'
      : isIt
      ? 'Differenza Netta (Alla Pari):'
      : 'Net Difference (Even):';

  const L = isIt
    ? {
        docNo: 'Documento',
        refInvoice: 'Fattura Rif.',
        date: 'Data',
        customer: 'Cliente',
        warehouse: 'Magazzino / Negozio',
        reason: 'Motivo',
        returnedSec: '1. Articoli Resi dal Cliente',
        exchangedSec: '2. Articoli Sostitutivi Consegnati',
        returnedShort: 'Articoli Resi:',
        exchangedShort: 'Articoli Sostitutivi:',
        item: 'Articolo',
        itemCond: 'Articolo, Dettagli & Condizione',
        qty: 'Qtà',
        unitPrice: 'Prezzo Unit.',
        amount: 'Importo',
        returnedValue: 'Valore Articoli Resi:',
        exchangeValue: 'Valore Articoli Sostitutivi:',
        settlement: 'Metodo di Regolamento',
        settlementNotes: 'Regolamento e Note:',
        notes: 'Note',
        storeSig: 'Timbro e Firma Negozio',
        customerSig: 'Firma Cliente / Destinatario',
        recipientSig: 'Firma Destinatario: ........................',
        tel: 'Tel',
        mobile: 'Cell',
        address: 'Indirizzo',
      }
    : {
        docNo: 'Document',
        refInvoice: 'Ref. Invoice',
        date: 'Date',
        customer: 'Customer',
        warehouse: 'Warehouse / Store',
        reason: 'Reason',
        returnedSec: '1. Returned Items (From Customer)',
        exchangedSec: '2. Replacement Items (Delivered to Customer)',
        returnedShort: 'Returned Items:',
        exchangedShort: 'Replacement Items:',
        item: 'Item',
        itemCond: 'Item Details & Condition',
        qty: 'Qty',
        unitPrice: 'Unit Price',
        amount: 'Amount',
        returnedValue: 'Returned Items Value:',
        exchangeValue: 'Replacement Items Value:',
        settlement: 'Settlement Method',
        settlementNotes: 'Settlement & Notes:',
        notes: 'Notes',
        storeSig: 'Store Stamp & Signature',
        customerSig: 'Customer / Recipient Signature',
        recipientSig: 'Recipient Signature: ........................',
        tel: 'Tel',
        mobile: 'Mobile',
        address: 'Address',
      };

  let html = '';

  if (format === 'thermal') {
    html = `
      <div style="width: 78mm; max-width: 78mm; margin: 0 auto; padding: 4mm 2mm; font-family: 'Inter', system-ui, sans-serif; direction: ltr; color: #000; font-size: 11px; line-height: 1.4;">
        <div style="text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          ${resolvedLogoUrl ? `<div style="margin-bottom: 4px;"><img src="${escapeHtml(resolvedLogoUrl)}" alt="Logo" style="max-height: 36px; max-width: 96px; object-fit: contain; margin: 0 auto;" /></div>` : ''}
          <h2 style="font-size: 13.5px; font-weight: 900; margin: 0 0 2px 0;">${orgName}</h2>
          ${(orgPhone || orgMobile) ? `<div style="font-size: 9px; color: #222;">${orgPhone ? `${L.tel}: ${orgPhone}` : ''}${orgPhone && orgMobile ? ' · ' : ''}${orgMobile ? `${L.mobile}: ${orgMobile}` : ''}</div>` : ''}
          <div style="font-size: 11px; font-weight: 800; margin-top: 4px; background: #000; color: #fff; padding: 2px 6px; border-radius: 3px; display: inline-block;">${docTitle}</div>
          <div style="display: flex; justify-content: space-between; font-size: 9.5px; margin-top: 5px; font-family: monospace;">
            <span>${returnNumber}</span>
            <span>${dateStr}</span>
          </div>
          <div style="font-size: 9.5px; font-family: monospace; margin-top: 2px;">${L.refInvoice}: ${origOrderNum}</div>
        </div>

        <div style="margin-bottom: 6px; font-size: 10px; border-bottom: 1px dashed #bbb; padding-bottom: 4px;">
          <div><strong>${L.customer}:</strong> ${customerName}</div>
          <div><strong>${L.warehouse}:</strong> ${warehouseName}</div>
          <div><strong>${L.reason}:</strong> ${reasonLabel}</div>
        </div>

        <div style="font-weight: 800; font-size: 10.5px; margin: 5px 0 3px 0;">${L.returnedShort}</div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px;">
          <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 9.5px;">
              <th style="padding: 2px; text-align: left;">${L.item}</th>
              <th style="padding: 2px; text-align: center; width: 30px;">${L.qty}</th>
              <th style="padding: 2px; text-align: right;">${L.amount}</th>
            </tr>
          </thead>
          <tbody>
            ${returnedItems.map((i) => renderItemRowThermal(i, currency, isIt)).join('')}
          </tbody>
        </table>

        ${
          exchangedItems.length > 0
            ? `
          <div style="font-weight: 800; font-size: 10.5px; margin: 6px 0 3px 0;">${L.exchangedShort}</div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px;">
            <thead>
              <tr style="border-bottom: 1px solid #000; font-size: 9.5px;">
                <th style="padding: 2px; text-align: left;">${L.item}</th>
                <th style="padding: 2px; text-align: center; width: 30px;">${L.qty}</th>
                <th style="padding: 2px; text-align: right;">${L.amount}</th>
              </tr>
            </thead>
            <tbody>
              ${exchangedItems.map((i) => renderItemRowThermal(i, currency, isIt)).join('')}
            </tbody>
          </table>
        `
            : ''
        }

        <div style="border-top: 1.5px dashed #000; padding-top: 6px; font-size: 10.5px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>${L.returnedValue}</span>
            <span style="font-family: monospace;">${formatCurrency(returnedTotal, currency, false)}</span>
          </div>
          ${
            isExchange
              ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span>${L.exchangeValue}</span>
              <span style="font-family: monospace;">${formatCurrency(exchangeTotal, currency, false)}</span>
            </div>`
              : ''
          }
          <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 12px; border-top: 1.5px solid #000; padding-top: 4px; margin-top: 4px;">
            <span>${netLabel}</span>
            <span style="font-family: monospace;">${formatCurrency(Math.abs(netAmount), currency, false)}</span>
          </div>
          <div style="font-size: 9.5px; margin-top: 4px; color: #333;">
            <strong>${L.settlement}:</strong> ${settlementLabel}
          </div>
        </div>

        ${notesHtml ? `<div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #bbb; font-size: 9.5px; color: #444;">${L.notes}: ${notesHtml}</div>` : ''}

        ${
          resolvedSignatureUrl
            ? `
          <div style="text-align: center; margin-top: 8px; border-top: 1px dashed #bbb; padding-top: 5px;">
            <img src="${escapeHtml(resolvedSignatureUrl)}" alt="Signature" style="max-height: 44px; max-width: 110px; object-fit: contain; margin: 0 auto; filter: grayscale(100%) contrast(150%);" />
          </div>`
            : ''
        }

        <div style="text-align: center; margin-top: 8px; padding-top: 5px; border-top: 1px dashed #999; font-size: 9px; color: #555;">
          ${L.recipientSig}
        </div>
      </div>
    `;
  } else {
    html = `
      <div style="max-width: 210mm; margin: 0 auto; padding: 10mm 8mm; font-family: 'Inter', system-ui, sans-serif; direction: ltr; color: #0f172a; font-size: 12px; line-height: 1.5; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${
              resolvedLogoUrl
                ? `<div style="width: 66px; height: 66px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 4px; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden;"><img src="${escapeHtml(resolvedLogoUrl)}" alt="Logo" style="max-height: 58px; max-width: 58px; object-fit: contain;" /></div>`
                : ''
            }
            <div>
              <h1 style="font-size: 18px; font-weight: 900; margin: 0 0 4px 0; color: #0f172a;">${docTitle}</h1>
              <div style="font-size: 13px; font-weight: bold; color: #1e293b;">${orgName}</div>
              ${
                orgPhone || orgMobile
                  ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">${orgPhone ? `${L.tel}: <strong>${orgPhone}</strong>` : ''}${orgPhone && orgMobile ? ' | ' : ''}${orgMobile ? `${L.mobile}: <strong>${orgMobile}</strong>` : ''}</div>`
                  : ''
              }
              ${orgAddress ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px; max-width: 480px;">${L.address}: ${orgAddress}</div>` : ''}
            </div>
          </div>

          <div style="text-align: right; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc;">
            <div><strong>${L.docNo}:</strong> <span style="font-family: monospace; font-weight: bold;">${returnNumber}</span></div>
            <div><strong>${L.refInvoice}:</strong> <span style="font-family: monospace; font-weight: bold;">${origOrderNum}</span></div>
            <div><strong>${L.date}:</strong> <span style="font-family: monospace;">${dateStr}</span></div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc; font-size: 11px;">
          <div>
            <span style="color: #64748b;">${L.customer}:</span>
            <div style="font-weight: bold; color: #0f172a; margin-top: 2px;">${customerName}</div>
          </div>
          <div>
            <span style="color: #64748b;">${L.warehouse}:</span>
            <div style="font-weight: bold; color: #0f172a; margin-top: 2px;">${warehouseName}</div>
          </div>
          <div>
            <span style="color: #64748b;">${L.reason}:</span>
            <div style="font-weight: bold; color: #0f172a; margin-top: 2px;">${reasonLabel}</div>
          </div>
        </div>

        <div style="font-weight: 800; font-size: 12px; color: #991b1b; margin-bottom: 6px;">${L.returnedSec}</div>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <thead>
            <tr style="background: #fef2f2; border-bottom: 1.5px solid #fecaca; font-weight: bold; font-size: 11px; color: #7f1d1d;">
              <th style="padding: 7px 6px; text-align: center; width: 40px; border-inline-end: 1px solid #fecaca;">#</th>
              <th style="padding: 7px 10px; text-align: left; border-inline-end: 1px solid #fecaca;">${L.itemCond}</th>
              <th style="padding: 7px 6px; text-align: center; width: 60px; border-inline-end: 1px solid #fecaca;">${L.qty}</th>
              <th style="padding: 7px 8px; text-align: right; width: 115px; border-inline-end: 1px solid #fecaca;">${L.unitPrice} (${currency})</th>
              <th style="padding: 7px 8px; text-align: right; width: 125px;">${L.amount} (${currency})</th>
            </tr>
          </thead>
          <tbody>
            ${returnedItems.map((i, idx) => renderItemRowA4(i, idx, currency, isIt)).join('')}
          </tbody>
        </table>

        ${
          exchangedItems.length > 0
            ? `
          <div style="font-weight: 800; font-size: 12px; color: #065f46; margin-bottom: 6px;">${L.exchangedSec}</div>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; margin-bottom: 14px;">
            <thead>
              <tr style="background: #ecfdf5; border-bottom: 1.5px solid #a7f3d0; font-weight: bold; font-size: 11px; color: #064e3b;">
                <th style="padding: 7px 6px; text-align: center; width: 40px; border-inline-end: 1px solid #a7f3d0;">#</th>
                <th style="padding: 7px 10px; text-align: left; border-inline-end: 1px solid #a7f3d0;">${L.item}</th>
                <th style="padding: 7px 6px; text-align: center; width: 60px; border-inline-end: 1px solid #a7f3d0;">${L.qty}</th>
                <th style="padding: 7px 8px; text-align: right; width: 115px; border-inline-end: 1px solid #a7f3d0;">${L.unitPrice} (${currency})</th>
                <th style="padding: 7px 8px; text-align: right; width: 125px;">${L.amount} (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${exchangedItems.map((i, idx) => renderItemRowA4(i, idx, currency, isIt)).join('')}
            </tbody>
          </table>
        `
            : ''
        }

        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 20px;">
          <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #f8fafc; font-size: 11px; min-height: 80px;">
            <div style="font-weight: bold; color: #334155; margin-bottom: 4px;">${L.settlementNotes}</div>
            <div style="color: #0f172a; font-weight: bold; margin-bottom: 4px;">${settlementLabel}</div>
            ${notesHtml ? `<div style="color: #64748b;">${notesHtml}</div>` : ''}
          </div>

          <div style="width: 280px; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #fff; font-size: 11.5px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #475569;">
              <span>${L.returnedValue}</span>
              <span style="font-family: monospace; font-weight: bold;">${formatCurrency(returnedTotal, currency, false)}</span>
            </div>
            ${
              isExchange
                ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #475569;">
                <span>${L.exchangeValue}</span>
                <span style="font-family: monospace; font-weight: bold;">${formatCurrency(exchangeTotal, currency, false)}</span>
              </div>`
                : ''
            }
            <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 13px; border-top: 1.5px solid #0f172a; padding-top: 6px; margin-top: 6px; color: ${netAmount < 0 ? '#b91c1c' : netAmount > 0 ? '#059669' : '#0f172a'};">
              <span>${netLabel}</span>
              <span style="font-family: monospace;">${formatCurrency(Math.abs(netAmount), currency, false)}</span>
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-top: 20px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #475569;">
          <div style="text-align: center; width: 190px; display: flex; flex-direction: column; align-items: center;">
            ${
              resolvedSignatureUrl
                ? `<div style="min-height: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px;"><img src="${escapeHtml(resolvedSignatureUrl)}" alt="Signature" style="max-height: 70px; max-width: 165px; object-fit: contain;" /></div>`
                : `<div style="height: 50px;"></div>`
            }
            <div style="width: 100%; border-top: 1.5px solid #94a3b8; padding-top: 5px; font-weight: bold; color: #1e293b;">${L.storeSig}</div>
          </div>

          <div style="text-align: center; width: 190px; display: flex; flex-direction: column; align-items: center;">
            <div style="height: 50px;"></div>
            <div style="width: 100%; border-top: 1.5px solid #94a3b8; padding-top: 5px; font-weight: bold; color: #1e293b;">${L.customerSig}</div>
          </div>
        </div>
      </div>
    `;
  }

  printHtml(html, {
    title: `${isExchange ? 'Exchange' : 'Return'}_${orderReturn.return_number || orderReturn.id}`,
    extraStyles: `
      @page {
        size: ${format === 'thermal' ? '80mm auto' : 'A4 portrait'};
        margin: ${format === 'thermal' ? '0mm' : '5mm'};
      }
    `,
  });
}
