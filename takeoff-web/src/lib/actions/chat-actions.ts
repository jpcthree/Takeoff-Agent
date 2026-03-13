/**
 * Chat action parser and executor.
 * When Claude's response contains ```action blocks, this module
 * parses them and dispatches the appropriate store actions.
 */

import type { SpreadsheetLineItem } from '@/lib/types/line-item';
import type { LineItemDict } from '@/lib/api/python-service';
import { calculateTrade } from '@/lib/api/python-service';
import { pythonLineItemToSpreadsheet } from '@/lib/utils/calculations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecalculateTradeAction {
  type: 'recalculate_trade';
  trade: string;
  reason?: string;
}

interface UpdateBuildingModelAction {
  type: 'update_building_model';
  changes: Record<string, unknown>;
  reason?: string;
}

interface AddLineItemAction {
  type: 'add_line_item';
  item: {
    trade: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    material_unit_cost?: number;
  };
}

interface RemoveLineItemAction {
  type: 'remove_line_item';
  description: string;
}

type ChatAction =
  | RecalculateTradeAction
  | UpdateBuildingModelAction
  | AddLineItemAction
  | RemoveLineItemAction;

export interface ActionResult {
  success: boolean;
  message: string;
  updatedItems?: SpreadsheetLineItem[];
  updatedRawItems?: LineItemDict[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Extract action blocks from Claude's response text.
 * Looks for ```action ... ``` code blocks containing JSON.
 */
export function parseActions(responseText: string): ChatAction[] {
  const actions: ChatAction[] = [];
  const regex = /```action\s*\n?([\s\S]*?)\n?```/g;
  let match;

  while ((match = regex.exec(responseText)) !== null) {
    try {
      const action = JSON.parse(match[1]) as ChatAction;
      if (action.type) {
        actions.push(action);
      }
    } catch {
      // Skip malformed action blocks
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

interface StoreCallbacks {
  updateBuildingModel: (changes: Record<string, unknown>) => void;
  replaceTradeItems: (trade: string, items: SpreadsheetLineItem[], raw: LineItemDict[]) => void;
  addLineItem: (item: SpreadsheetLineItem, raw?: LineItemDict) => void;
  removeLineItem: (id: string) => void;
  getBuildingModel: () => Record<string, unknown> | null;
  getCosts: () => Record<string, unknown> | null;
  getLineItems: () => SpreadsheetLineItem[];
}

/**
 * Execute a parsed action against the store.
 */
export async function executeAction(
  action: ChatAction,
  store: StoreCallbacks
): Promise<ActionResult> {
  switch (action.type) {
    case 'recalculate_trade': {
      const model = store.getBuildingModel();
      if (!model) {
        return { success: false, message: 'No building model available' };
      }

      try {
        const result = await calculateTrade(
          action.trade,
          model,
          store.getCosts() || undefined
        );
        const items = result.items.map((item, i) =>
          pythonLineItemToSpreadsheet(item, i)
        );
        store.replaceTradeItems(action.trade, items, result.items);
        return {
          success: true,
          message: `Recalculated ${action.trade}: ${result.count} items`,
          updatedItems: items,
          updatedRawItems: result.items,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to recalculate ${action.trade}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'update_building_model': {
      store.updateBuildingModel(action.changes);
      return {
        success: true,
        message: `Updated building model: ${Object.keys(action.changes).join(', ')}`,
      };
    }

    case 'add_line_item': {
      const newItem: SpreadsheetLineItem = {
        id: `manual-${Date.now()}`,
        trade: action.item.trade,
        category: action.item.category,
        description: action.item.description,
        quantity: action.item.quantity,
        unit: action.item.unit,
        unitCost: action.item.material_unit_cost || 0,
        laborRatePct: 0,
        unitPrice: 0,
        materialTotal: (action.item.quantity || 0) * (action.item.material_unit_cost || 0),
        materialPct: 0,
        laborTotal: 0,
        laborPct: 0,
        laborPlusMaterials: (action.item.quantity || 0) * (action.item.material_unit_cost || 0),
        amount: 0,
        grossProfit: 0,
        gpm: 0,
        sortOrder: store.getLineItems().length,
        isUserAdded: true,
      };
      store.addLineItem(newItem);
      return {
        success: true,
        message: `Added line item: ${action.item.description}`,
      };
    }

    case 'remove_line_item': {
      const items = store.getLineItems();
      const match = items.find(
        (i) => i.description.toLowerCase() === action.description.toLowerCase()
      );
      if (match) {
        store.removeLineItem(match.id);
        return {
          success: true,
          message: `Removed line item: ${action.description}`,
        };
      }
      return {
        success: false,
        message: `Line item not found: ${action.description}`,
      };
    }

    default:
      return { success: false, message: `Unknown action type` };
  }
}
