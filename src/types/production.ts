import { Status } from './index';

export type RawMaterialCategory =
  | 'fabric'       // Fabric
  | 'thread'       // Thread
  | 'zipper'       // Zipper
  | 'button'       // Button
  | 'lining'       // Interfacing / Lining
  | 'label'        // Brand & Care Labels
  | 'packaging'    // Cover / Packaging
  | 'other';       // Other trims & accessories

export type ContractorSpecialty =
  | 'cutting'      // Pattern & Cutting
  | 'sewing'       // Sewing / Stitching
  | 'embroidery'   // Embroidery
  | 'printing'     // Printing
  | 'washing'      // Stone-washing / Laundry
  | 'iron_pack'    // Ironing & Packaging
  | 'general';     // General

export type ProductionOrderStatus =
  | 'draft'        // Draft
  | 'cutting'      // Cutting
  | 'in_progress'  // Sewing / Outsourced
  | 'qc'           // Quality Control
  | 'completed'    // Completed
  | 'cancelled';   // Cancelled

export type ProductionStageType =
  | 'cutting'      // Cutting
  | 'printing'     // Printing
  | 'embroidery'   // Embroidery
  | 'sewing'       // Sewing
  | 'washing'      // Washing
  | 'iron_pack'    // Ironing & Packaging
  | 'qc';          // Quality Control

export type ProductionStageStatus =
  | 'pending'      // Pending
  | 'in_progress'  // In Progress
  | 'completed';   // Completed

/**
 * Raw materials, fabrics & trims inventory
 */
export interface RawMaterial {
  id: number;
  organization_id: number;
  name: string;
  code: string; // Material code (e.g. MAT-001)
  unit: string; // Unit of measure (m, kg, roll, pcs, dozen...)
  category: RawMaterialCategory;
  warehouse_id?: number | null;
  current_stock: number;
  min_stock?: number | null;
  unit_cost: number;
  color_hex?: string | null;
  description?: string | null;
  status: Status;
  date_created?: string;
  date_updated?: string;
}

/**
 * Bill of Materials line item (BOM Item)
 */
export interface BomItem {
  id: number;
  bom_id: number;
  raw_material_id: number;
  quantity_required: number; // Quantity of material required per 1 finished unit
  unit_cost?: number;
  notes?: string | null;
  // Joined fields
  raw_material?: RawMaterial;
}

/**
 * Production recipe & Bill of Materials
 */
export interface BillOfMaterials {
  id: number;
  organization_id: number;
  product_id: number;
  variant_id?: number | null; // Optional variant override if formula differs by size/color
  name: string;
  version?: string; // e.g. "v1.0"
  waste_percentage?: number; // Standard waste percentage (e.g. 5%)
  notes?: string | null;
  status: Status;
  date_created?: string;
  date_updated?: string;
  // Joined / nested items
  items?: BomItem[];
  product_name?: string;
  variant_sku?: string;
  estimated_cost?: number;
}

/**
 * External workshops & contractors (sewing, printing, finishing...)
 */
export interface Contractor {
  id: number;
  organization_id: number;
  name: string;
  specialty: ContractorSpecialty;
  phone?: string | null;
  address?: string | null;
  current_balance?: number; // Positive = creditor (payable), negative = debtor
  status: Status;
  date_created?: string;
  date_updated?: string;
}

/**
 * Production Order / Cut Order
 */
export interface ProductionOrder {
  id: number;
  organization_id: number;
  order_number: string; // Order number (e.g. CUT-2026-001)
  product_id: number;
  bom_id?: number | null;
  target_warehouse_id?: number | null; // Target warehouse for finished goods
  total_quantity: number;
  status: ProductionOrderStatus;
  start_date?: string | null;
  due_date?: string | null;
  completed_date?: string | null;
  estimated_unit_cost?: number;
  actual_unit_cost?: number;
  notes?: string | null;
  date_created?: string;
  date_updated?: string;
  // Joined fields
  product_name?: string;
  target_warehouse_name?: string;
  items?: ProductionOrderItem[];
  stages?: ProductionStage[];
}

/**
 * Variant & size breakdown of a production order
 */
export interface ProductionOrderItem {
  id: number;
  production_order_id: number;
  variant_id: number;
  quantity_planned: number;
  quantity_completed?: number;
  quantity_rejected?: number;
  // Joined fields
  variant_sku?: string;
  variant_label?: string;
  color_name?: string;
  size_name?: string;
}

/**
 * Production line stages & outsourced contractor work
 */
export interface ProductionStage {
  id: number;
  production_order_id: number;
  contractor_id?: number | null;
  stage_type: ProductionStageType;
  status: ProductionStageStatus;
  unit_fee: number; // Contractor fee per unit
  total_fee: number;
  quantity_sent: number;
  quantity_received: number;
  quantity_damaged?: number;
  sent_date?: string | null;
  received_date?: string | null;
  notes?: string | null;
  // Joined fields
  contractor_name?: string;
}
