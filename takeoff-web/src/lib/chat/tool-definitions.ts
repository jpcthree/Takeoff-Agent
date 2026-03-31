/**
 * Anthropic tool definitions for the chat agent.
 *
 * These are passed to `anthropic.messages.stream({ tools })` so Claude
 * can call structured tools instead of embedding custom JSON blocks.
 */

import type Anthropic from '@anthropic-ai/sdk';

type Tool = Anthropic.Tool;

export const CHAT_TOOLS: Tool[] = [
  {
    name: 'update_line_items',
    description:
      'Update one or more existing line items in the estimate. Use this when the user asks to change quantities, costs, descriptions, categories, or units on specific items. You can update multiple items in a single call. Always reference items by their ID (shown in the estimate context as [item-X-XXXX]).',
    input_schema: {
      type: 'object' as const,
      properties: {
        updates: {
          type: 'array',
          description: 'List of updates to apply',
          items: {
            type: 'object',
            properties: {
              item_id: {
                type: 'string',
                description: 'The ID of the line item to update (e.g., "item-3-1234567890")',
              },
              field: {
                type: 'string',
                enum: ['quantity', 'unitCost', 'laborRatePct', 'unitPrice', 'description', 'category', 'unit'],
                description: 'The field to update',
              },
              value: {
                description: 'The new value. Use number for quantity/unitCost/laborRatePct/unitPrice, string for description/category/unit.',
              },
            },
            required: ['item_id', 'field', 'value'],
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'add_line_items',
    description:
      'Add one or more new line items to the estimate. Use this when the user asks to add materials, labor, or scope that is not currently in the estimate. Each item needs a trade, category, description, quantity, and unit.',
    input_schema: {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array',
          description: 'Line items to add',
          items: {
            type: 'object',
            properties: {
              trade: {
                type: 'string',
                description: 'The trade this item belongs to (e.g., "insulation", "drywall", "roofing", "framing", "electrical", "plumbing", "hvac", "exterior", "interior")',
              },
              category: {
                type: 'string',
                description: 'Category within the trade (e.g., "Material", "Labor", "Equipment")',
              },
              description: {
                type: 'string',
                description: 'Description of the line item',
              },
              quantity: {
                type: 'number',
                description: 'Quantity',
              },
              unit: {
                type: 'string',
                description: 'Unit of measure (e.g., "SF", "LF", "EA", "roll", "bag", "sheet", "bundle")',
              },
              unitCost: {
                type: 'number',
                description: 'Optional material unit cost. Defaults to 0 (user fills in).',
              },
            },
            required: ['trade', 'category', 'description', 'quantity', 'unit'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'remove_line_items',
    description:
      'Remove one or more line items from the estimate by their IDs. Use this when the user asks to delete or remove specific items from the estimate.',
    input_schema: {
      type: 'object' as const,
      properties: {
        item_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of the line items to remove',
        },
        reason: {
          type: 'string',
          description: 'Brief reason for removal',
        },
      },
      required: ['item_ids'],
    },
  },
  {
    name: 'update_building_model',
    description:
      'Update fields on the building model (dimensions, insulation specs, roof details, etc.) and optionally recalculate affected trades. Use this when the user provides new information about the building that should change the underlying model. When you update model fields that affect a trade\'s calculations, include that trade in recalculate_trades to regenerate its line items.',
    input_schema: {
      type: 'object' as const,
      properties: {
        changes: {
          type: 'object',
          description:
            'Key-value pairs to merge into the building model. Supports nested paths for arrays (e.g., {"walls": [...], "roof": {"pitch": 8}}). Common fields: walls[].insulation_type/r_value, attic_insulation_type/r_value, roof.pitch/material/sections, rooms[].floor_finish, foundation.type, climate_zone, siding_type.',
        },
        recalculate_trades: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Trades to recalculate after applying model changes (e.g., ["insulation", "drywall"]). Available trades: insulation, drywall, roofing, gutters.',
        },
        reason: {
          type: 'string',
          description: 'Brief reason for the change',
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'recalculate_trade',
    description:
      'Re-run the calculator for a specific trade to regenerate all its line items from the current building model. Use this when no model changes are needed but the user wants to refresh a trade\'s quantities. Available trades: insulation, drywall, roofing, gutters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        trade: {
          type: 'string',
          description: 'The trade to recalculate',
        },
        reason: {
          type: 'string',
          description: 'Brief reason for recalculation',
        },
      },
      required: ['trade'],
    },
  },
];
