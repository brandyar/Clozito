import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { useOrganization } from '../../context/OrganizationContext';
import { storageManager } from '../../storage';
import {
  LandedCost,
  LandedCostAllocation,
  PurchaseOrder,
  PurchaseOrderItem,
  ProductVariant,
  Product,
  Supplier,
} from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DateInput } from '../../components/ui/DateInput';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { formatCurrency, formatDate, roundCurrency, resolveCurrencyCode } from '../../utils/formatters';
import {
  Scale,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  FileText,
  CheckCircle2,
  RefreshCw,
  Truck,
  ShieldCheck,
  Box,
  Percent,
  AlertCircle,
  TrendingUp,
  Layers,
  ArrowRight,
  Eye,
  Check,
} from 'lucide-react';

interface CalculatedItemAllocation {
  purchase_order_item_id: number;
  product_title: string;
  sku: string;
  quantity: number;
  base_unit_cost: number;
  base_total: number;
  allocated_cost: number;
  effective_unit_cost: number;
  effective_total: number;
  increase_percentage: number;
}

export const LandedCostsPage: React.FC = () => {
  const { t, locale } = useTranslation();
  const isIt = locale === 'it';
  const { activeOrganization } = useOrganization();
  const activeCurrency = resolveCurrencyCode(activeOrganization?.currency);
  const [landedCosts, setLandedCosts] = useState<LandedCost[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCostType, setSelectedCostType] = useState<string>('all');

  // Modal: Add / Edit Landed Cost
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<LandedCost | null>(null);

  // Form State
  const [selectedPoId, setSelectedPoId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [costType, setCostType] = useState<'freight' | 'customs' | 'packaging' | 'commission' | 'insurance' | 'other'>('freight');
  const [amount, setAmount] = useState<number>(0);
  const [allocationMethod, setAllocationMethod] = useState<'by_value' | 'by_quantity' | 'manual'>('by_value');
  const [dateApplied, setDateApplied] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [createExpense, setCreateExpense] = useState(false);
  const [autoApplyToVariants, setAutoApplyToVariants] = useState(true);

  // Active PO Items for allocation
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([]);
  const [variantsMap, setVariantsMap] = useState<Record<number, { sku: string; title: string; currentBuyPrice: number }>>({});
  const [manualAllocations, setManualAllocations] = useState<Record<number, number>>({});

  // Detail Drawer / Modal for View
  const [viewCost, setViewCost] = useState<LandedCost | null>(null);
  const [viewAllocations, setViewAllocations] = useState<LandedCostAllocation[]>([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isApplyingVariants, setIsApplyingVariants] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const storage = storageManager.getAdapter();
      const [costs, pos, sups, variants, products] = await Promise.all([
        storage.getLandedCosts(),
        storage.getPurchaseOrders(),
        storage.getSuppliers(),
        storage.getVariants(),
        storage.getProducts(),
      ]);

      setLandedCosts(costs || []);
      setPurchaseOrders(pos || []);
      setSuppliers(sups || []);

      const vMap: Record<number, { sku: string; title: string; currentBuyPrice: number }> = {};
      (variants || []).forEach((v) => {
        const prod = (products || []).find((p) => p.id === (typeof v.product_id === 'object' ? (v.product_id as any)?.id : v.product_id));
        vMap[v.id] = {
          sku: v.sku || '',
          title: prod?.title || '',
          currentBuyPrice: v.buy_price || 0,
        };
      });
      setVariantsMap(vMap);
    } catch (err) {
      console.error('Failed to load landed costs data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When PO changes in form, load its items
  useEffect(() => {
    if (!selectedPoId) {
      setPoItems([]);
      return;
    }
    const loadItems = async () => {
      try {
        const storage = storageManager.getAdapter();
        const items = await storage.getPurchaseOrderItems(Number(selectedPoId));
        setPoItems(items);

        // Reset manual allocation inputs
        const initialManual: Record<number, number> = {};
        items.forEach((item) => {
          initialManual[item.id] = 0;
        });
        setManualAllocations(initialManual);
      } catch (err) {
        console.error('Failed to load PO items', err);
      }
    };
    loadItems();
  }, [selectedPoId]);

  // Compute live allocations
  const calculatedAllocations: CalculatedItemAllocation[] = useMemo(() => {
    if (!poItems.length || amount <= 0) {
      return poItems.map((item) => {
        const vId = typeof item.variant_id === 'object' ? (item.variant_id as any)?.id : item.variant_id;
        const vInfo = (vId ? variantsMap[vId] : undefined) || { sku: '', title: '', currentBuyPrice: 0 };
        const qty = item.quantity_ordered || item.quantity_received || 1;
        const unitCost = item.unit_cost || 0;
        const total = item.total || qty * unitCost;
        return {
          purchase_order_item_id: item.id,
          product_title: vInfo.title,
          sku: vInfo.sku,
          quantity: qty,
          base_unit_cost: unitCost,
          base_total: total,
          allocated_cost: 0,
          effective_unit_cost: unitCost,
          effective_total: total,
          increase_percentage: 0,
        };
      });
    }

    const totalPoValue = poItems.reduce((acc, item) => acc + (item.total || (item.quantity_ordered || 1) * (item.unit_cost || 0)), 0);
    const totalPoQty = poItems.reduce((acc, item) => acc + (item.quantity_ordered || item.quantity_received || 1), 0);

    return poItems.map((item) => {
      const vId = typeof item.variant_id === 'object' ? (item.variant_id as any)?.id : item.variant_id;
      const vInfo = (vId ? variantsMap[vId] : undefined) || { sku: '', title: '', currentBuyPrice: 0 };
      const qty = item.quantity_ordered || item.quantity_received || 1;
      const unitCost = item.unit_cost || 0;
      const baseTotal = item.total || qty * unitCost;

      let itemAllocatedCost = 0;
      if (allocationMethod === 'by_value') {
        const ratio = totalPoValue > 0 ? baseTotal / totalPoValue : 1 / poItems.length;
        itemAllocatedCost = roundCurrency(amount * ratio);
      } else if (allocationMethod === 'by_quantity') {
        const ratio = totalPoQty > 0 ? qty / totalPoQty : 1 / poItems.length;
        itemAllocatedCost = roundCurrency(amount * ratio);
      } else {
        itemAllocatedCost = roundCurrency(manualAllocations[item.id] || 0);
      }

      const overheadPerUnit = qty > 0 ? itemAllocatedCost / qty : 0;
      const effectiveUnit = roundCurrency(unitCost + overheadPerUnit);
      const effectiveTotal = roundCurrency(baseTotal + itemAllocatedCost);
      const increasePct = unitCost > 0 ? ((effectiveUnit - unitCost) / unitCost) * 100 : 0;

      return {
        purchase_order_item_id: item.id,
        product_title: vInfo.title,
        sku: vInfo.sku,
        quantity: qty,
        base_unit_cost: unitCost,
        base_total: baseTotal,
        allocated_cost: itemAllocatedCost,
        effective_unit_cost: effectiveUnit,
        effective_total: effectiveTotal,
        increase_percentage: Math.round(increasePct * 10) / 10,
      };
    });
  }, [poItems, amount, allocationMethod, manualAllocations, variantsMap]);

  // Overall stats
  const totalLandedCostAmount = useMemo(() => {
    return landedCosts.reduce((acc, c) => acc + (c.amount || 0), 0);
  }, [landedCosts]);

  const uniquePoCount = useMemo(() => {
    const ids = new Set(landedCosts.map((c) => (typeof c.purchase_order_id === 'object' ? (c.purchase_order_id as any)?.id : c.purchase_order_id)));
    return ids.size;
  }, [landedCosts]);

  const handleOpenNew = () => {
    setEditingCost(null);
    setSelectedPoId('');
    setTitle('');
    setCostType('freight');
    setAmount(0);
    setAllocationMethod('by_value');
    setDateApplied(new Date().toISOString().split('T')[0]);
    setNotes('');
    setCreateExpense(false);
    setAutoApplyToVariants(true);
    setIsModalOpen(true);
  };

  const handleEdit = async (cost: LandedCost) => {
    setEditingCost(cost);
    const pId = typeof cost.purchase_order_id === 'object' ? (cost.purchase_order_id as any)?.id : cost.purchase_order_id;
    setSelectedPoId(pId || '');
    setTitle(cost.title || '');
    setCostType((cost.cost_type as any) || 'freight');
    setAmount(cost.amount || 0);
    setAllocationMethod(cost.allocation_method || 'by_value');
    setDateApplied(cost.date_applied || new Date().toISOString().split('T')[0]);
    setNotes(cost.notes || '');
    setCreateExpense(false);
    setAutoApplyToVariants(false);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('accounting.deleteLandedCostConfirm'))) return;
    try {
      const storage = storageManager.getAdapter();
      await storage.deleteLandedCost(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete landed cost', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPoId || amount <= 0 || !title.trim()) {
      alert(isIt ? 'Specifica correttamente ordine di acquisto, titolo e importo.' : 'Please specify a purchase order, title, and valid cost amount.');
      return;
    }

    try {
      setLoading(true);
      const storage = storageManager.getAdapter();

      const costPayload: Partial<LandedCost> = {
        title: title.trim(),
        cost_type: costType,
        amount: Number(amount),
        allocation_method: allocationMethod,
        date_applied: dateApplied,
        notes: notes.trim(),
        purchase_order_id: Number(selectedPoId),
      };

      if (editingCost) {
        costPayload.id = editingCost.id;
      }

      // Prepare allocations payload
      const allocationsPayload: Partial<LandedCostAllocation>[] = calculatedAllocations.map((calc) => ({
        purchase_order_item_id: calc.purchase_order_item_id,
        allocated_cost: calc.allocated_cost,
        effective_unit_cost: calc.effective_unit_cost,
      }));

      const savedCost = await storage.saveLandedCost(costPayload, allocationsPayload);

      // If requested, apply to variants right away
      if (autoApplyToVariants && savedCost.id) {
        await storage.applyLandedCostToVariants(savedCost.id);
      }

      // If requested, automatically create operational expense
      if (createExpense && !editingCost) {
        const categories = await storage.getExpenseCategories();
        const defaultCat = categories.find((c) => c.code === 'freight' || c.code === 'production') || categories[0];
        await storage.saveExpense({
          title: `Landed Cost (${t(`accounting.${costType}`)}): ${title} (PO #${selectedPoId})`,
          amount: Number(amount),
          category_id: defaultCat?.id || 1,
          expense_date: dateApplied,
          payment_method: 'bank_account',
          paid_to: 'Freight / Customs Broker',
          description: `Allocated to Purchase Order #${selectedPoId}`,
        });
      }

      setIsModalOpen(false);
      setSuccessMessage(t('accounting.applyToVariantsSuccess'));
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err) {
      console.error('Failed to save landed cost', err);
      alert(isIt ? 'Errore nel salvataggio del costo accessorio.' : 'Failed to save landed cost.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenView = async (cost: LandedCost) => {
    setViewCost(cost);
    try {
      const storage = storageManager.getAdapter();
      const pId = typeof cost.purchase_order_id === 'object' ? (cost.purchase_order_id as any)?.id : cost.purchase_order_id;
      const allocs = await storage.getLandedCostAllocations(cost.id, Number(pId));
      setViewAllocations(allocs);
      setIsViewModalOpen(true);
    } catch (err) {
      console.error('Failed to view landed cost allocations', err);
    }
  };

  const handleApplyToVariantsDirectly = async (costId: number) => {
    if (!window.confirm(t('accounting.applyToVariantsConfirm'))) return;
    try {
      setIsApplyingVariants(true);
      const storage = storageManager.getAdapter();
      const res = await storage.applyLandedCostToVariants(costId);
      setSuccessMessage(
        isIt
          ? `${res.updatedVariantsCount} varianti aggiornate con il nuovo costo unitario effettivo.`
          : `${res.updatedVariantsCount} variants updated with new effective unit cost.`
      );
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err) {
      console.error('Failed to apply to variants', err);
    } finally {
      setIsApplyingVariants(false);
    }
  };

  // Filtered Landed Costs List
  const filteredCosts = useMemo(() => {
    return landedCosts.filter((cost) => {
      const matchesSearch =
        !search ||
        cost.title.toLowerCase().includes(search.toLowerCase()) ||
        cost.purchase_number?.toLowerCase().includes(search.toLowerCase()) ||
        cost.supplier_name?.toLowerCase().includes(search.toLowerCase());

      const matchesType = selectedCostType === 'all' || cost.cost_type === selectedCostType;
      return matchesSearch && matchesType;
    });
  }, [landedCosts, search, selectedCostType]);

  const getCostTypeBadge = (type: string) => {
    switch (type) {
      case 'freight':
        return (
          <Badge variant="primary" className="gap-1">
            <Truck className="w-3 h-3" />
            <span>{t('accounting.freight')}</span>
          </Badge>
        );
      case 'customs':
        return (
          <Badge variant="warning" className="gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span>{t('accounting.customs')}</span>
          </Badge>
        );
      case 'packaging':
        return (
          <Badge variant="secondary" className="gap-1">
            <Box className="w-3 h-3" />
            <span>{t('accounting.packaging')}</span>
          </Badge>
        );
      case 'commission':
        return (
          <Badge variant="secondary" className="gap-1">
            <Percent className="w-3 h-3" />
            <span>{t('accounting.commission')}</span>
          </Badge>
        );
      case 'insurance':
        return (
          <Badge variant="success" className="gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span>{t('accounting.insurance')}</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="default" className="gap-1">
            <Layers className="w-3 h-3" />
            <span>{t('accounting.otherCost')}</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-lg flex items-center gap-2 text-xs animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-3.5 sm:p-4 flex items-center justify-between border-neutral-200/80 dark:border-neutral-800">
          <div>
            <p className="text-xs text-neutral-500 mb-1">{t('accounting.totalLandedCostAmount')}</p>
            <p className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
              {formatCurrency(totalLandedCostAmount, activeCurrency)}
            </p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 shrink-0">
            <Scale className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4 flex items-center justify-between border-neutral-200/80 dark:border-neutral-800">
          <div>
            <p className="text-xs text-neutral-500 mb-1">{isIt ? 'Ordini d\'acquisto con costi accessori' : 'Purchase Orders with Landed Costs'}</p>
            <p className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
              {uniquePoCount} <span className="text-xs font-normal text-neutral-400">{isIt ? 'ordini' : 'orders'}</span>
            </p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 shrink-0">
            <Truck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4 flex items-center justify-between border-neutral-200/80 dark:border-neutral-800">
          <div>
            <p className="text-xs text-neutral-500 mb-1">{isIt ? 'Ripartizioni registrate' : 'Recorded Allocations'}</p>
            <p className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
              {landedCosts.length} <span className="text-xs font-normal text-neutral-400">{isIt ? 'voci' : 'records'}</span>
            </p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </Card>
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row flex-1 items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1 max-w-full sm:max-w-sm">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isIt ? 'Cerca per titolo, numero ordine o fornitore...' : 'Search by title, PO number, or supplier...'}
              className="ps-9 h-9 text-xs"
            />
          </div>

          <Select
            value={selectedCostType}
            onChange={(e) => setSelectedCostType(e.target.value)}
            className="w-full sm:w-44 h-9 text-xs"
          >
            <option value="all">{isIt ? 'Tutti i tipi di costo' : 'All Cost Types'}</option>
            <option value="freight">{t('accounting.freight')}</option>
            <option value="customs">{t('accounting.customs')}</option>
            <option value="packaging">{t('accounting.packaging')}</option>
            <option value="commission">{t('accounting.commission')}</option>
            <option value="insurance">{t('accounting.insurance')}</option>
            <option value="other">{t('accounting.otherCost')}</option>
          </Select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            className="h-9 shrink-0 whitespace-nowrap"
          >
            <span className="hidden sm:inline">{t('common.refresh', isIt ? 'Aggiorna' : 'Refresh')}</span>
          </Button>

          <Button
            onClick={handleOpenNew}
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            className="h-9 shrink-0 whitespace-nowrap flex-1 sm:flex-none justify-center"
          >
            <span>{t('accounting.newLandedCost')}</span>
          </Button>
        </div>
      </div>

      {/* Landed Costs Table */}
      <Card className="overflow-hidden border-neutral-200/80 dark:border-neutral-800">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200/80 dark:border-neutral-800 text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold text-start">{isIt ? 'Titolo costo' : 'Cost Title'}</th>
                <th className="px-4 py-3 font-semibold text-start">{t('accounting.costType')}</th>
                <th className="px-4 py-3 font-semibold text-start">{isIt ? 'Ordine di acquisto' : 'Purchase Order'}</th>
                <th className="px-4 py-3 font-semibold text-start">{isIt ? 'Importo totale' : 'Total Cost'}</th>
                <th className="px-4 py-3 font-semibold text-start">{isIt ? 'Metodo di ripartizione' : 'Allocation Method'}</th>
                <th className="px-4 py-3 font-semibold text-start">{isIt ? 'Data applicazione' : 'Date Applied'}</th>
                <th className="px-4 py-3 font-semibold text-center">{isIt ? 'Articoli' : 'Items'}</th>
                <th className="px-4 py-3 font-semibold text-end">{isIt ? 'Azioni' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
              {filteredCosts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-neutral-400">
                    <Scale className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>{t('accounting.noLandedCosts')}</p>
                  </td>
                </tr>
              ) : (
                filteredCosts.map((cost) => (
                  <tr key={cost.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-neutral-900 dark:text-white">{cost.title}</div>
                      {cost.notes && (
                        <div className="text-[11px] text-neutral-400 truncate max-w-xs">{cost.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getCostTypeBadge(cost.cost_type)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                        {cost.purchase_number || `PO-${cost.purchase_order_id}`}
                      </div>
                      {cost.supplier_name && (
                        <div className="text-[11px] text-neutral-400">{cost.supplier_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-neutral-900 dark:text-white">
                      {formatCurrency(cost.amount, activeCurrency)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {cost.allocation_method === 'by_value'
                        ? (isIt ? 'Per valore' : 'By Value')
                        : cost.allocation_method === 'by_quantity'
                        ? (isIt ? 'Per quantità' : 'By Quantity')
                        : (isIt ? 'Manuale' : 'Manual')}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {formatDate(cost.date_applied)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline">
                        {cost.allocations_count || 0} {isIt ? 'art.' : 'items'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenView(cost)}
                          title={isIt ? 'Visualizza ripartizione costi' : 'View allocation breakdown'}
                          className="h-7 w-7 p-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApplyToVariantsDirectly(cost.id)}
                          title={t('accounting.applyToVariantsBtn')}
                          className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(cost)}
                          title={t('common.edit', isIt ? 'Modifica' : 'Edit')}
                          className="h-7 w-7 p-0 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(cost.id)}
                          title={t('common.delete', isIt ? 'Elimina' : 'Delete')}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: New / Edit Landed Cost */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCost ? t('accounting.editLandedCost') : t('accounting.newLandedCost')}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                {t('accounting.purchaseOrderSelect')} *
              </label>
              <Select
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value ? Number(e.target.value) : '')}
                required
                className="w-full text-xs"
                disabled={!!editingCost}
              >
                <option value="">{t('accounting.selectPurchaseOrder')}</option>
                {purchaseOrders.map((po) => {
                  const sId = typeof po.supplier_id === 'object' ? (po.supplier_id as any)?.id : po.supplier_id;
                  const sup = suppliers.find((s) => s.id === Number(sId));
                  return (
                    <option key={po.id} value={po.id}>
                      {po.purchase_number} - {sup?.name || po.supplier_name || (isIt ? 'Fornitore' : 'Supplier')} ({formatCurrency(po.total, activeCurrency)})
                    </option>
                  );
                })}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                {isIt ? 'Titolo costo accessorio *' : 'Landed Cost Title *'}
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isIt ? 'es. Spedizione DHL / Sdoganamento' : 'e.g. Freight Shipping & Customs Clearance'}
                required
                className="w-full text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                {t('accounting.costType')}
              </label>
              <Select
                value={costType}
                onChange={(e) => setCostType(e.target.value as any)}
                className="w-full text-xs"
              >
                <option value="freight">{t('accounting.freight')}</option>
                <option value="customs">{t('accounting.customs')}</option>
                <option value="packaging">{t('accounting.packaging')}</option>
                <option value="commission">{t('accounting.commission')}</option>
                <option value="insurance">{t('accounting.insurance')}</option>
                <option value="other">{t('accounting.otherCost')}</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                {t('accounting.costAmount')} ({activeCurrency}) *
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="0.00"
                required
                className="w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                {t('accounting.allocationMethod')}
              </label>
              <Select
                value={allocationMethod}
                onChange={(e) => setAllocationMethod(e.target.value as any)}
                className="w-full text-xs"
              >
                <option value="by_value">{t('accounting.byValue')}</option>
                <option value="by_quantity">{t('accounting.byQuantity')}</option>
                <option value="manual">{t('accounting.manualAllocation')}</option>
              </Select>
            </div>

            <DateInput
              label={t('accounting.dateApplied')}
              value={dateApplied}
              onChange={(iso) => setDateApplied(iso)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              {isIt ? 'Note e dettagli aggiuntivi' : 'Notes & Additional Details'}
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isIt ? 'Riferimento bolla doganale, tracking o fattura corriere...' : 'Waybill reference, customs declaration, or freight invoice...'}
              className="w-full text-xs"
            />
          </div>

          {/* Live Breakdown Table */}
          {poItems.length > 0 && (
            <div className="mt-4 border border-neutral-200/80 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="bg-neutral-50 dark:bg-neutral-900/50 px-4 py-2 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  {t('accounting.allocatedTableTitle')}
                </span>
                <span className="text-[11px] text-neutral-400">
                  {calculatedAllocations.length} {isIt ? 'articoli' : 'items'}
                </span>
              </div>

              <div className="overflow-x-auto max-h-60 custom-scrollbar">
                <table className="w-full text-[11px] text-start">
                  <thead className="bg-neutral-100/50 dark:bg-neutral-900/30 text-neutral-500 border-b border-neutral-200/60 dark:border-neutral-800">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('accounting.itemVariant')}</th>
                      <th className="px-3 py-2 text-center">{t('accounting.itemQuantity')}</th>
                      <th className="px-3 py-2 text-end">{t('accounting.baseCost')}</th>
                      <th className="px-3 py-2 text-end">{t('accounting.allocatedCost')}</th>
                      <th className="px-3 py-2 text-end">{t('accounting.effectiveUnitCost')}</th>
                      <th className="px-3 py-2 text-center">{t('accounting.costIncreasePercent')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
                    {calculatedAllocations.map((calc) => (
                      <tr key={calc.purchase_order_item_id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-neutral-800 dark:text-neutral-200">{calc.product_title}</div>
                          <div className="font-mono text-[10px] text-neutral-400">{calc.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-center font-medium">
                          {calc.quantity}
                        </td>
                        <td className="px-3 py-2 text-end">
                          {formatCurrency(calc.base_unit_cost, activeCurrency)}
                        </td>
                        <td className="px-3 py-2 text-end font-semibold text-amber-600 dark:text-amber-400">
                          {allocationMethod === 'manual' ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={manualAllocations[calc.purchase_order_item_id] || ''}
                              onChange={(e) =>
                                setManualAllocations((prev) => ({
                                  ...prev,
                                  [calc.purchase_order_item_id]: Number(e.target.value),
                                }))
                              }
                              className="h-6 w-24 text-[10px] text-end p-1"
                            />
                          ) : (
                            `+${formatCurrency(calc.allocated_cost, activeCurrency)}`
                          )}
                        </td>
                        <td className="px-3 py-2 text-end font-bold text-neutral-900 dark:text-white">
                          {formatCurrency(calc.effective_unit_cost, activeCurrency)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={calc.increase_percentage > 20 ? 'warning' : 'default'} className="text-[10px]">
                            +{calc.increase_percentage}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action Checkboxes */}
          <div className="space-y-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-800">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={autoApplyToVariants}
                onChange={(e) => setAutoApplyToVariants(e.target.checked)}
                className="rounded border-neutral-300 text-neutral-900 dark:border-neutral-700 focus:ring-0"
              />
              <span>{t('accounting.applyToVariantsConfirm')}</span>
            </label>

            {!editingCost && (
              <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={createExpense}
                  onChange={(e) => setCreateExpense(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900 dark:border-neutral-700 focus:ring-0"
                />
                <span>{t('accounting.createExpenseCheck')}</span>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              {t('common.cancel', isIt ? 'Annulla' : 'Cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !selectedPoId || amount <= 0}
            >
              {editingCost ? (isIt ? 'Salva modifiche' : 'Save Changes') : (isIt ? 'Salva e applica ripartizione' : 'Save & Apply Allocation')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: View Landed Cost Allocations Breakdown */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title={viewCost ? `${isIt ? 'Dettaglio ripartizione:' : 'Allocation Breakdown:'} ${viewCost.title}` : (isIt ? 'Dettaglio articoli e ripartizione' : 'Items & Allocation Details')}
        maxWidth="max-w-3xl"
      >
        {viewCost && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 dark:bg-neutral-900/40 p-3 rounded-lg border border-neutral-200/80 dark:border-neutral-800 text-xs">
              <div>
                <span className="text-neutral-400 block mb-0.5">{isIt ? 'Ordine d\'acquisto' : 'Purchase Order'}</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {viewCost.purchase_number || `PO-${viewCost.purchase_order_id}`}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block mb-0.5">{isIt ? 'Tipo di costo' : 'Cost Type'}</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {t(`accounting.${viewCost.cost_type}`)}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block mb-0.5">{isIt ? 'Importo totale' : 'Total Amount'}</span>
                <span className="font-bold text-neutral-900 dark:text-white">
                  {formatCurrency(viewCost.amount, activeCurrency)}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block mb-0.5">{isIt ? 'Data applicazione' : 'Date Applied'}</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {formatDate(viewCost.date_applied)}
                </span>
              </div>
            </div>

            <div className="border border-neutral-200/80 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-neutral-100/60 dark:bg-neutral-900/50 text-neutral-500 border-b border-neutral-200/80 dark:border-neutral-800">
                    <tr>
                      <th className="px-3 py-2 text-start">{isIt ? 'Articolo e variante' : 'Product & Variant'}</th>
                      <th className="px-3 py-2 text-center">{isIt ? 'Qtà' : 'Qty'}</th>
                      <th className="px-3 py-2 text-end">{isIt ? 'Costo base' : 'Base Unit Cost'}</th>
                      <th className="px-3 py-2 text-end">{isIt ? 'Quota accessoria' : 'Allocated Share'}</th>
                      <th className="px-3 py-2 text-end">{isIt ? 'Costo effettivo unitario' : 'Effective Unit Cost'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
                    {viewAllocations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-neutral-400">
                          {isIt ? 'Nessuna ripartizione registrata.' : 'No allocation data recorded.'}
                        </td>
                      </tr>
                    ) : (
                      viewAllocations.map((alloc) => (
                        <tr key={alloc.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                              {alloc.product_title || alloc.variant_name || (isIt ? 'Articolo' : 'Item')}
                            </div>
                            <div className="font-mono text-[10px] text-neutral-400">{alloc.sku}</div>
                          </td>
                          <td className="px-3 py-2 text-center font-medium">
                            {alloc.quantity || 1}
                          </td>
                          <td className="px-3 py-2 text-end">
                            {formatCurrency(alloc.base_unit_cost || 0, activeCurrency)}
                          </td>
                          <td className="px-3 py-2 text-end font-semibold text-amber-600 dark:text-amber-400">
                            +{formatCurrency(alloc.allocated_cost, activeCurrency)}
                          </td>
                          <td className="px-3 py-2 text-end font-bold text-neutral-900 dark:text-white">
                            {formatCurrency(alloc.effective_unit_cost, activeCurrency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleApplyToVariantsDirectly(viewCost.id)}
                disabled={isApplyingVariants}
                className="gap-1 text-emerald-600 border-emerald-600/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t('accounting.applyToVariantsBtn')}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsViewModalOpen(false)}
              >
                {t('common.close', isIt ? 'Chiudi' : 'Close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
