import { PosShift, Organization } from '../../../types';
import { formatCurrency, formatDate, resolveCurrencyCode } from '../../../utils/formatters';
import { printHtml } from '../../../utils/print';
import { BRAND } from '../../../config/brand';

function escapeHtml(value: unknown): string {
  const str = value == null ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const printZReport = (shift: PosShift, organization: Organization | null) => {
  const isIt = typeof document !== 'undefined' && document.documentElement.lang === 'it';
  const opening = Number(shift.opening_balance) || 0;
  const closing = Number(shift.closing_balance) || 0;
  const cashSales = Number(shift.total_cash_amount) || 0;
  const posSales = Number(shift.total_pos_amount) || 0;
  const cardSales = Number(shift.total_card_amount) || 0;
  const creditSales = Number(shift.total_credit_amount) || 0;
  const totalSales = Number(shift.total_sales_amount) || 0;
  const returnsCount = Number(shift.total_returns_count) || 0;
  const totalRefunds = Number(shift.total_refund_amount) || 0;
  const cashRefunds = Number(shift.total_cash_refund_amount) || 0;
  const exchangeCashIn = Number(shift.total_exchange_cash_in_amount) || 0;
  const expected = opening + cashSales - cashRefunds + exchangeCashIn;
  const diff = closing - expected;
  const curr = resolveCurrencyCode(organization?.currency);

  const orgName = escapeHtml(organization?.name || BRAND.name);
  const cashierName = escapeHtml(shift.user_name || shift.user_email || (isIt ? 'Operatore' : 'Cashier'));
  const whName = escapeHtml(shift.warehouse_name || (isIt ? 'Tutti i Magazzini' : 'All Warehouses'));
  const accName = shift.account_name ? escapeHtml(shift.account_name) : '';

  const L = isIt
    ? {
        title: 'Rapporto di Chiusura Cassa (Z-Report)',
        shiftId: 'ID Turno',
        status: 'Stato',
        open: 'Aperto',
        closed: 'Chiuso',
        cashier: 'Cassiere / Operatore',
        warehouse: 'Magazzino / Negozio',
        account: 'Cassa / Conto',
        openedAt: 'Apertura Turno',
        closedAt: 'Chiusura Turno',
        stillOpen: 'Turno ancora aperto',
        salesSummary: 'Riepilogo Vendite del Turno',
        ordersCount: 'Totale Ordini',
        cashSales: 'Vendite in Contanti',
        posSales: 'Vendite POS / Carta',
        cardSales: 'Bonifico / Carta',
        creditSales: 'Vendite a Credito',
        returnsCount: 'Resi / Cambi',
        totalSales: 'Totale Vendite',
        cashDrawer: 'Riconciliazione Cassa Contanti',
        openingBalance: 'Fondo Cassa Iniziale',
        cashInflow: 'Incassi Contanti',
        cashRefunds: 'Rimborsi Contanti',
        exchangeCash: 'Differenze Cambio Contanti',
        expectedCash: 'Contanti Attesi in Cassa',
        countedCash: 'Contanti Contati a Chiusura',
        variance: 'Scostamento Cassa',
        balanced: 'Esatto (Nessuna Differenza)',
        shortage: 'Ammanco',
        surplus: 'Eccedenza',
        signatures: 'Firma Cassiere .......................... Firma Responsabile ..........................',
        footer: `${BRAND.name} · Sistema Integrato Vendite e Magazzino`,
      }
    : {
        title: 'End-of-Shift Cash Register Report (Z-Report)',
        shiftId: 'Shift ID',
        status: 'Status',
        open: 'Open',
        closed: 'Closed',
        cashier: 'Cashier / Operator',
        warehouse: 'Warehouse / Store',
        account: 'Cashbox / Account',
        openedAt: 'Opened At',
        closedAt: 'Closed At',
        stillOpen: 'Shift still open',
        salesSummary: 'Shift Sales Summary',
        ordersCount: 'Total Orders',
        cashSales: 'Cash Sales',
        posSales: 'Card / POS Sales',
        cardSales: 'Bank / Card Transfers',
        creditSales: 'Credit / Account Sales',
        returnsCount: 'Returns / Exchanges',
        totalSales: 'Total Sales',
        cashDrawer: 'Cash Drawer Reconciliation',
        openingBalance: 'Opening Float',
        cashInflow: 'Cash Sales Inflow',
        cashRefunds: 'Cash Refunds',
        exchangeCash: 'Exchange Cash Inflow',
        expectedCash: 'Expected Cash Balance',
        countedCash: 'Final Counted Cash',
        variance: 'Cash Variance',
        balanced: 'Exact Match (Balanced)',
        shortage: 'Cash Shortage',
        surplus: 'Cash Surplus',
        signatures: 'Cashier Signature .......................... Manager Signature ..........................',
        footer: `${BRAND.name} · Unified Retail & Inventory Platform`,
      };

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; direction: ltr; padding: 20px; max-width: 420px; margin: 0 auto; color: #111; line-height: 1.6; font-size: 13px;">
      <div style="text-align: center; border-bottom: 2px dashed #444; padding-bottom: 12px; margin-bottom: 12px;">
        <h2 style="margin: 0 0 4px; font-size: 18px; font-weight: 800;">${orgName}</h2>
        <div style="font-size: 14px; font-weight: bold; margin-top: 4px; color: #222;">${L.title}</div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">${L.shiftId}: #${escapeHtml(shift.id)} | ${L.status}: ${shift.status === 'open' ? L.open : L.closed}</div>
      </div>

      <table style="width: 100%; font-size: 12px; margin-bottom: 12px; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #555;">${L.cashier}:</td>
          <td style="padding: 4px 0; text-align: right; font-weight: bold;">${cashierName}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #555;">${L.warehouse}:</td>
          <td style="padding: 4px 0; text-align: right; font-weight: bold;">${whName}</td>
        </tr>
        ${accName ? `<tr><td style="padding: 4px 0; color: #555;">${L.account}:</td><td style="padding: 4px 0; text-align: right; font-weight: bold;">${accName}</td></tr>` : ''}
        <tr>
          <td style="padding: 4px 0; color: #555;">${L.openedAt}:</td>
          <td style="padding: 4px 0; text-align: right; font-family: monospace;">${escapeHtml(formatDate(shift.opened_at || '', false))}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #555;">${L.closedAt}:</td>
          <td style="padding: 4px 0; text-align: right; font-family: monospace;">${shift.closed_at ? escapeHtml(formatDate(shift.closed_at, false)) : L.stillOpen}</td>
        </tr>
      </table>

      <div style="border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 10px 0; margin-bottom: 12px;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px;">${L.salesSummary}:</div>
        <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
          <tr>
            <td style="padding: 3px 0;">${L.ordersCount}:</td>
            <td style="padding: 3px 0; text-align: right; font-weight: bold; font-family: monospace;">${shift.total_orders_count || 0}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0;">${L.cashSales}:</td>
            <td style="padding: 3px 0; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(cashSales, curr, false)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0;">${L.posSales}:</td>
            <td style="padding: 3px 0; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(posSales, curr, false)}</td>
          </tr>
          ${cardSales > 0 ? `<tr><td style="padding: 3px 0;">${L.cardSales}:</td><td style="padding: 3px 0; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(cardSales, curr, false)}</td></tr>` : ''}
          ${creditSales > 0 ? `<tr><td style="padding: 3px 0;">${L.creditSales}:</td><td style="padding: 3px 0; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(creditSales, curr, false)}</td></tr>` : ''}
          ${returnsCount > 0 ? `<tr><td style="padding: 3px 0; color: #b91c1c;">${L.returnsCount}:</td><td style="padding: 3px 0; text-align: right; font-weight: bold; color: #b91c1c; font-family: monospace;">${returnsCount} (${formatCurrency(totalRefunds, curr, false)})</td></tr>` : ''}
          <tr style="border-top: 1px dashed #aaa;">
            <td style="padding: 6px 0; font-weight: 800; font-size: 13px;">${L.totalSales}:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 800; font-size: 14px; font-family: monospace;">${formatCurrency(totalSales, curr, false)}</td>
          </tr>
        </table>
      </div>

      <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #e9ecef;">
        <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">${L.cashDrawer}:</div>
        <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
          <tr>
            <td style="padding: 3px 0;">${L.openingBalance}:</td>
            <td style="padding: 3px 0; text-align: right; font-family: monospace;">${formatCurrency(opening, curr, false)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0;">${L.cashInflow}:</td>
            <td style="padding: 3px 0; text-align: right; font-family: monospace;">+ ${formatCurrency(cashSales, curr, false)}</td>
          </tr>
          ${cashRefunds > 0 ? `
          <tr style="color: #b91c1c;">
            <td style="padding: 3px 0;">${L.cashRefunds}:</td>
            <td style="padding: 3px 0; text-align: right; font-family: monospace;">- ${formatCurrency(cashRefunds, curr, false)}</td>
          </tr>` : ''}
          ${exchangeCashIn > 0 ? `
          <tr style="color: #15803d;">
            <td style="padding: 3px 0;">${L.exchangeCash}:</td>
            <td style="padding: 3px 0; text-align: right; font-family: monospace;">+ ${formatCurrency(exchangeCashIn, curr, false)}</td>
          </tr>` : ''}
          <tr style="border-top: 1px solid #ccc;">
            <td style="padding: 4px 0; font-weight: bold;">${L.expectedCash}:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(expected, curr, false)}</td>
          </tr>
          ${shift.status === 'closed' ? `
          <tr>
            <td style="padding: 4px 0; font-weight: bold;">${L.countedCash}:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(closing, curr, false)}</td>
          </tr>
          <tr style="border-top: 1px solid #ccc; color: ${diff === 0 ? '#15803d' : diff < 0 ? '#b91c1c' : '#0369a1'};">
            <td style="padding: 4px 0; font-weight: 800;">${L.variance}:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 800;">
              ${diff === 0 ? L.balanced : diff < 0 ? `${L.shortage}: ${formatCurrency(Math.abs(diff), curr, false)}` : `${L.surplus}: +${formatCurrency(diff, curr, false)}`}
            </td>
          </tr>
          ` : ''}
        </table>
      </div>

      <div style="margin-top: 25px; padding-top: 10px; border-top: 1px dashed #888; text-align: center; font-size: 11px; color: #777;">
        <div>${L.signatures}</div>
        <div style="margin-top: 8px;">${L.footer}</div>
      </div>
    </div>
  `;

  printHtml(html, { title: `Z-Report_Shift_${shift.id}` });
};
