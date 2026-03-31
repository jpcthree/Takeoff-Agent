/**
 * Chat action parser and executor.
 *
 * Supports two modes:
 * 1. Native tool_use (new): Claude calls structured tools via Anthropic API
 * 2. Legacy action blocks (deprecated): ```action JSON``` in response text
 */

import type { SpreadsheetLineItem } from '@/lib/types/line-item';
import type { LineItemDict } from '@/lib/api/python-service';
import type { ToolCall } from '@/hooks/useChat';
import { calculateTrade } from '@/lib/api/python-service';
import { pythonLineItemToSpreadsheet, calculateRow } from '@/lib/utils/calculations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionResult {
  success: boolean;
  message: string;
  updatedItems?: SpreadsheetLineItem[];
  updatedRawItems?: LineItemDict[];
}

export interface StoreCallbacks {
  updateBuildingModel: (changes: Record<string, unknown>) => void;
  replaceTradeItems: (trade: string, items: SpreadsheetLineItem[], raw: LineItemDict[]) => void;
  addLineItem: (item: SpreadsheetLineItem, raw?: LineItemDict) => void;
  removeLineItem: (id: string) => void;
  updateLineItem: (id: string, changes: Partial<SpreadsheetLineItem>) => void;
  getBuildingModel: () => Record<string, unknown> | null;
  getCosts: () => Record<string, unknown> | null;
  getLineItems: () => SpreadsheetLineItem[];
}

// ---------------------------------------------------------------------------
// Native tool_use executor (new)
// ---------------------------------------------------------------------------

/**
 * Execute a tool call from Claude's native tool_use response.
 */
export async function executeToolCall(
  toolCall: ToolCall,
  store: StoreCallbacks
): Promise<ActionResult> {
  try {
    switch (toolCall.name) {
      case 'update_line_items':
        return executeUpdateLineItems(toolCall.input as unknown as UpdateLineItemsInput, store);
      case 'add_line_items':
        return executeAddLineItems(toolCall.input as unknown as AddLineItemsInput, store);
      case 'remove_line_items':
        return executeRemoveLineItems(toolCall.input as unknown as RemoveLineItemsInput, store);
      case 'update_building_model':
        return await executeUpdateBuildingModel(toolCall.input as unknown as UpdateBuildingModelInput, store);
      case 'recalculate_trade':
        return await executeRecalculateTrade(toolCall.input as unknown as RecalculateTradeInput, store);
      default:
        return { success: false, message: `Unknown tool: ${toolCall.name}` };
    }
  } catch (err) {
    return {
      success: false,
      message: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Tool input types
// ---------------------------------------------------------------------------

interface UpdateLineItemsInput {
  updates: Array<{
    item_id: string;
    field: string;
    value: number | string;
  }>;
}

interface AddLineItemsInput {
  items: Array<{
    trade: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost?: number;
  }>;
}

interface RemoveLineItemsInput {
  item_ids: string[];
  reason?: string;
}

interface UpdateBuildingModelInput {
  changes: Record<string, unknown>;
  recalculate_trades?: string[];
  reason?: string;
}

interface RecalculateTradeInput {
  trade: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

function executeUpdateLineItems(
  input: UpdateLineItemsInput,
  store: StoreCallbacks
): ActionResult {
  const allItems = store.getLineItems();
  const results: string[] = [];
  let updated = 0;

  for (const update of input.updates) {
    const target = allItems.find((i) => i.id === update.item_id);
    if (!target) {
      results.push(`Item ${update.item_id} not found`);
      continue;
    }

    const numericFields = ['quantity', 'unitCost', 'laborRatePct', 'unitPrice'];

    if (numericFields.includes(update.field)) {
      // Numeric field — apply change and recalculate derived fields
      const updatedItem = { ...target, [update.field]: Number(update.value) };
      const calc = calculateRow(
        updatedItem.quantity,
        updatedItem.unitCost,
        updatedItem.laborRatePct,
        updatedItem.unitPrice
      );
      store.updateLineItem(update.item_id, {
        [update.field]: Number(update.value),
        ...calc,
      });
    } else {
      // Text field — direct update
      store.updateLineItem(update.item_id, {
        [update.field]: String(update.value),
      });
    }

    results.push(`${target.description}: ${update.field} → ${update.value}`);
    updated++;
  }

  return {
    success: updated > 0,
    message: updated > 0
      ? `Updated ${updated} item${updated !== 1 ? 's' : ''}: ${results.join('; ')}`
      : `No items updated: ${results.join('; ')}`,
  };
}

function executeAddLineItems(
  input: AddLineItemsInput,
  store: StoreCallbacks
): ActionResult {
  const currentItems = store.getLineItems();
  const added: string[] = [];

  for (const item of input.items) {
    const unitCost = item.unitCost || 0;
    const materialTotal = (item.quantity || 0) * unitCost;

    const newItem: SpreadsheetLineItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trade: item.trade,
      category: item.category,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitCost,
      laborRatePct: 0,
      unitPrice: 0,
      materialTotal,
      materialPct: 0,
      laborTotal: 0,
      laborPct: 0,
      laborPlusMaterials: materialTotal,
      amount: 0,
      grossProfit: 0,
      gpm: 0,
      sortOrder: currentItems.length + added.length,
      isUserAdded: true,
    };

    store.addLineItem(newItem);
    added.push(item.description);
  }

  return {
    success: added.length > 0,
    message: `Added ${added.length} item${added.length !== 1 ? 's' : ''}: ${added.join(', ')}`,
  };
}

function executeRemoveLineItems(
  input: RemoveLineItemsInput,
  store: StoreCallbacks
): ActionResult {
  const allItems = store.getLineItems();
  const removed: string[] = [];
  const notFound: string[] = [];

  for (const id of input.item_ids) {
    const item = allItems.find((i) => i.id === id);
    if (item) {
      store.removeLineItem(id);
      removed.push(item.description);
    } else {
      notFound.push(id);
    }
  }

  const parts: string[] = [];
  if (removed.length > 0) parts.push(`Removed ${removed.length}: ${removed.join(', ')}`);
  if (notFound.length > 0) parts.push(`Not found: ${notFound.join(', ')}`);

  return {
    success: removed.length > 0,
    message: parts.join('. '),
  };
}

async function executeUpdateBuildingModel(
  input: UpdateBuildingModelInput,
  store: StoreCallbacks
): Promise<ActionResult> {
  // Apply model changes
  store.updateBuildingModel(input.changes);
  const changedFields = Object.keys(input.changes).join(', ');

  // Optionally recalculate affected trades
  const recalcResults: string[] = [];
  if (input.recalculate_trades && input.recalculate_trades.length > 0) {
    const model = store.getBuildingModel();
    if (!model) {
      return {
        success: true,
        message: `Updated building model (${changedFields}) but could not recalculate — no model available`,
      };
    }

    for (const trade of input.recalculate_trades) {
      try {
        const result = await calculateTrade(trade, model, store.getCosts() || undefined);
        const items = result.items.map((item, i) => pythonLineItemToSpreadsheet(item, i));
        store.replaceTradeItems(trade, items, result.items);
        recalcResults.push(`${trade}: ${result.count} items`);
      } catch (err) {
        recalcResults.push(`${trade}: failed (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }

  const message = recalcResults.length > 0
    ? `Updated model (${changedFields}) and recalculated: ${recalcResults.join(', ')}`
    : `Updated building model: ${changedFields}`;

  return { success: true, message };
}

async function executeRecalculateTrade(
  input: RecalculateTradeInput,
  store: StoreCallbacks
): Promise<ActionResult> {
  const model = store.getBuildingModel();
  if (!model) {
    return { success: false, message: 'No building model available' };
  }

  try {
    const result = await calculateTrade(
      input.trade,
      model,
      store.getCosts() || undefined
    );
    const items = result.items.map((item, i) => pythonLineItemToSpreadsheet(item, i));
    store.replaceTradeItems(input.trade, items, result.items);
    return {
      success: true,
      message: `Recalculated ${input.trade}: ${result.count} items`,
      updatedItems: items,
      updatedRawItems: result.items,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to recalculate ${input.trade}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

