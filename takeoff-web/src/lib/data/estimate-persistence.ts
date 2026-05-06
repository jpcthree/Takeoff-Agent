/**
 * Estimate persistence layer.
 * Saves/loads estimates to Supabase and tracks user adjustments.
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { SpreadsheetLineItem } from '@/lib/types/line-item';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdjustmentRecord {
  project_id: string;
  trade: string;
  item_description: string;
  field_changed: string;
  original_value: number;
  new_value: number;
  source: 'user' | 'chat' | 'import';
  reason?: string;
}

// ---------------------------------------------------------------------------
// Save estimate line items
// ---------------------------------------------------------------------------

/**
 * Save (upsert) all line items for a project to Supabase.
 * Deletes existing items for the project, then inserts new ones.
 */
export async function saveLineItems(
  projectId: string,
  lineItems: SpreadsheetLineItem[]
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const supabase = createClient();

  // Delete existing line items for this project
  const { error: deleteError } = await supabase
    .from('line_items')
    .delete()
    .eq('project_id', projectId);

  if (deleteError) {
    console.error('Failed to delete old line items:', deleteError);
    return { success: false, error: deleteError.message };
  }

  // Insert new line items
  const rows = lineItems.map((item, idx) => ({
    project_id: projectId,
    trade: item.trade,
    category: item.category || '',
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    material_unit_cost: item.unitCost,
    material_total: item.materialTotal,
    labor_hours: 0,
    labor_rate: item.laborRatePct,
    labor_total: item.laborTotal,
    line_total: item.amount,
    user_unit_cost: item.unitCost > 0 ? item.unitCost : null,
    user_labor_rate_pct: item.laborRatePct > 0 ? item.laborRatePct : null,
    user_unit_price: item.unitPrice > 0 ? item.unitPrice : null,
    sort_order: idx,
    is_user_added: item.isUserAdded || false,
  }));

  if (rows.length === 0) {
    return { success: true };
  }

  const { error: insertError } = await supabase
    .from('line_items')
    .insert(rows);

  if (insertError) {
    console.error('Failed to save line items:', insertError);
    return { success: false, error: insertError.message };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Save property data + assumptions on the project
// ---------------------------------------------------------------------------

export async function saveProjectEstimateData(
  projectId: string,
  data: {
    assumptions?: string[];
    inputMethod?: 'plans' | 'address';
  }
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const supabase = createClient();
  const updates: Record<string, unknown> = {};
  if (data.assumptions) updates.assumptions = data.assumptions;
  if (data.inputMethod) updates.input_method = data.inputMethod;

  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId);

  if (error) {
    console.error('Failed to save project estimate data:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Load saved estimate
// ---------------------------------------------------------------------------

export async function loadSavedEstimate(projectId: string): Promise<{
  lineItems: Array<{
    trade: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    laborRatePct: number;
    unitPrice: number;
    sortOrder: number;
    isUserAdded: boolean;
  }>;
  propertyData: Record<string, unknown> | null;
  assumptions: string[];
} | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createClient();

  // Load project metadata
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('property_data, assumptions')
    .eq('id', projectId)
    .single();

  if (projError || !project) return null;

  // Load line items
  const { data: items, error: itemsError } = await supabase
    .from('line_items')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (itemsError || !items || items.length === 0) return null;

  return {
    lineItems: items.map((i: Record<string, unknown>) => ({
      trade: i.trade as string,
      category: i.category as string,
      description: i.description as string,
      quantity: (i.quantity as number) || 0,
      unit: i.unit as string,
      unitCost: (i.user_unit_cost as number) || 0,
      laborRatePct: (i.user_labor_rate_pct as number) || 0,
      unitPrice: (i.user_unit_price as number) || 0,
      sortOrder: (i.sort_order as number) || 0,
      isUserAdded: (i.is_user_added as boolean) || false,
    })),
    propertyData: (project as Record<string, unknown>).property_data as Record<string, unknown> | null,
    assumptions: ((project as Record<string, unknown>).assumptions as string[]) || [],
  };
}

// ---------------------------------------------------------------------------
// Track adjustments
// ---------------------------------------------------------------------------

/**
 * Record a user or chat adjustment to a line item.
 */
export async function trackAdjustment(
  adjustment: AdjustmentRecord
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const { error } = await supabase
    .from('estimate_adjustments')
    .insert(adjustment);

  if (error) {
    console.error('Failed to track adjustment:', error);
  }
}

// ---------------------------------------------------------------------------
// Query adjustment patterns (for learning loop)
// ---------------------------------------------------------------------------

/**
 * Get the most frequently adjusted items for a given trade.
 */
export async function getFrequentAdjustments(
  trade?: string,
  limit = 20
): Promise<Array<{
  item_description: string;
  field_changed: string;
  avg_original: number;
  avg_new: number;
  adjustment_count: number;
}>> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createClient();

  // Use RPC or direct query — since Supabase JS doesn't support GROUP BY natively,
  // we'll fetch recent adjustments and aggregate in JS
  let query = supabase
    .from('estimate_adjustments')
    .select('item_description, field_changed, original_value, new_value, trade')
    .order('created_at', { ascending: false })
    .limit(500);

  if (trade) {
    query = query.eq('trade', trade);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  // Aggregate by (item_description, field_changed)
  const agg = new Map<string, {
    item_description: string;
    field_changed: string;
    originals: number[];
    newValues: number[];
  }>();

  for (const row of data as Array<Record<string, unknown>>) {
    const key = `${row.item_description}::${row.field_changed}`;
    const existing = agg.get(key);
    if (existing) {
      existing.originals.push(row.original_value as number);
      existing.newValues.push(row.new_value as number);
    } else {
      agg.set(key, {
        item_description: row.item_description as string,
        field_changed: row.field_changed as string,
        originals: [row.original_value as number],
        newValues: [row.new_value as number],
      });
    }
  }

  const results = Array.from(agg.values())
    .map((v) => ({
      item_description: v.item_description,
      field_changed: v.field_changed,
      avg_original: v.originals.reduce((a, b) => a + b, 0) / v.originals.length,
      avg_new: v.newValues.reduce((a, b) => a + b, 0) / v.newValues.length,
      adjustment_count: v.originals.length,
    }))
    .filter((r) => r.adjustment_count >= 2) // Only patterns with 2+ occurrences
    .sort((a, b) => b.adjustment_count - a.adjustment_count)
    .slice(0, limit);

  return results;
}
