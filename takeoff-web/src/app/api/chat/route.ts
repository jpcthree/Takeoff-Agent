import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ---------------------------------------------------------------------------
// Learning loop: query adjustment patterns
// ---------------------------------------------------------------------------

async function getLearningContext(trades: string[]): Promise<string> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('estimate_adjustments')
      .select('item_description, field_changed, original_value, new_value, trade')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data || data.length === 0) return '';

    // Aggregate by (trade, item_description, field_changed)
    const agg = new Map<string, {
      trade: string;
      item_description: string;
      field_changed: string;
      originals: number[];
      newValues: number[];
    }>();

    for (const row of data) {
      const key = `${row.trade}::${row.item_description}::${row.field_changed}`;
      const existing = agg.get(key);
      if (existing) {
        existing.originals.push(row.original_value);
        existing.newValues.push(row.new_value);
      } else {
        agg.set(key, {
          trade: row.trade,
          item_description: row.item_description,
          field_changed: row.field_changed,
          originals: [row.original_value],
          newValues: [row.new_value],
        });
      }
    }

    const patterns = Array.from(agg.values())
      .filter((v) => v.originals.length >= 2) // Only patterns with 2+ occurrences
      .filter((v) => trades.length === 0 || trades.includes(v.trade))
      .sort((a, b) => b.originals.length - a.originals.length)
      .slice(0, 15);

    if (patterns.length === 0) return '';

    const lines = [
      ``,
      `## Historical Adjustment Patterns`,
      `Based on previous estimates, users frequently make these corrections:`,
    ];

    for (const p of patterns) {
      const avgOrig = p.originals.reduce((a, b) => a + b, 0) / p.originals.length;
      const avgNew = p.newValues.reduce((a, b) => a + b, 0) / p.newValues.length;
      const pctChange = avgOrig !== 0 ? ((avgNew - avgOrig) / avgOrig) * 100 : 0;
      const direction = pctChange > 0 ? 'increased' : 'decreased';
      lines.push(
        `- [${p.trade}] "${p.item_description}" ${p.field_changed} typically ${direction} by ~${Math.abs(pctChange).toFixed(0)}% (${p.originals.length} times)`
      );
    }

    lines.push(``, `Consider proactively suggesting these adjustments when relevant.`);
    return lines.join('\n');
  } catch {
    // Don't block chat if learning query fails
    return '';
  }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

interface ChatContext {
  projectName?: string;
  projectAddress?: string;
  buildingModel?: Record<string, unknown>;
  lineItemsSummary?: string;
  /** Full line items grouped by trade for detailed context */
  lineItemsDetail?: Array<{
    trade: string;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unit: string;
      unitCost: number;
      unitPrice: number;
      amount: number;
    }>;
    subtotal: { materialTotal: number; laborTotal: number; amount: number };
  }>;
  /** Property data from address lookup */
  propertyData?: Record<string, unknown>;
  /** Assumptions used in the estimate */
  assumptions?: string[];
  /** Property notes */
  propertyNotes?: Array<{ title: string; lines: string[] }>;
  /** Insulation-specific notes */
  insulationNotes?: Array<{ title: string; lines: string[] }>;
}

function buildSystemPrompt(context: ChatContext): string {
  const parts = [
    `You are a construction takeoff assistant embedded in a project workspace. You help users understand, verify, and adjust their construction cost estimates.`,
    ``,
    `Your capabilities:`,
    `- Explain why specific quantities were calculated (e.g., "14 sheets of drywall because...")`,
    `- Verify quantities against building dimensions`,
    `- Suggest adjustments when the user provides information not on the plans`,
    `- Explain trade-specific concepts (waste factors, labor rates, material choices)`,
    `- Help users understand the relationship between building model data and line items`,
    `- Directly modify individual line item values (quantity, unit cost, labor rate, unit price)`,
    ``,
    `When the user asks you to make changes to the estimate, respond with your analysis and include a JSON action block that the frontend will execute. Format actions as:`,
    `\`\`\`action`,
    `{"type": "recalculate_trade", "trade": "insulation", "reason": "User requested R-60 spray foam"}`,
    `\`\`\``,
    ``,
    `Available action types:`,
    `- recalculate_trade: Re-run a specific trade calculator (trades: insulation, drywall, roofing, gutters)`,
    `- update_building_model: Modify a field on the building model, e.g. {"type": "update_building_model", "changes": {"roof_insulation_r_value": 60}}`,
    `- update_line_item: Modify a specific line item field. Use the item's ID. Fields: "quantity", "unitCost", "laborRatePct", "unitPrice". Example: {"type": "update_line_item", "item_id": "item-3-1234", "field": "quantity", "value": 25}`,
    `- add_line_item: Add a manual line item`,
    `- remove_line_item: Remove a line item by description`,
    ``,
    `Insulation covers many assembly types. Modifiable fields include: walls[].insulation_type/r_value/continuous_insulation_type/continuous_insulation_r_value, attic_insulation_type/r_value, attic_baffles/attic_baffle_count, attic_hatch_insulation, roof_insulation_type/r_value (cathedral), slab_edge_insulation/r_value/type/depth/perimeter, under_slab_insulation/r_value/area, basement_wall_insulation/type/r_value/location/area, rim_joist_insulation/type/r_value/perimeter, knee_wall_insulation/type/r_value/area, floor_over_unconditioned/type/r_value/area/support, garage_ceiling_insulation/type/r_value/area, garage_wall_insulation/type/r_value/area, crawlspace_wall_insulation/type/r_value, air_sealing, vapor_barrier, house_wrap. After updating fields, always recalculate_trade insulation.`,
    ``,
    `Roofing modifiable fields: roof.sections[].underlayment_type/shingle_type, chimney_count, skylight_count, pipe_boot_count, soffit_vent_count, power_vent_count, step_flashing_lf, counter_flashing_lf, roof_complexity (simple/standard/complex/very_complex). Gutter fields: gutter_runs[].gutter_guard/gutter_guard_type/end_caps. After updating, recalculate_trade roofing.`,
    ``,
    `Drywall modifiable fields: walls[].drywall_type/drywall_layers/drywall_finish_level (GA-214 L0-L5), rooms[].ceiling_drywall_type/ceiling_drywall_layers/ceiling_finish_level, access_panel_count, l_bead_lf. Finish levels: L0=none, L1=fire-tape, L2=tile substrate, L3=textured, L4=standard smooth, L5=skim coat. After updating, recalculate_trade drywall.`,
    ``,
    `When using update_line_item, prefer it over recalculate_trade for simple quantity/cost changes. Use recalculate_trade when structural building model changes affect many items at once.`,
    ``,
    `Be concise but thorough. Use bullet points for clarity. When discussing costs, always note that Unit Cost and Unit Price columns are user-input fields.`,
  ];

  // Project identity
  if (context.projectName) {
    parts.push(``, `PROJECT: ${context.projectName}`);
  }
  if (context.projectAddress) {
    parts.push(`ADDRESS: ${context.projectAddress}`);
  }

  // Property data (for retrofit/address-based projects)
  if (context.propertyData) {
    parts.push(``, `PROPERTY DATA:`, JSON.stringify(context.propertyData, null, 2));
  }

  // Building model
  if (context.buildingModel) {
    parts.push(``, `BUILDING MODEL:`, JSON.stringify(context.buildingModel, null, 2));
  }

  // Assumptions
  if (context.assumptions && context.assumptions.length > 0) {
    parts.push(``, `ASSUMPTIONS USED IN ESTIMATE:`);
    for (const a of context.assumptions) {
      parts.push(`- ${a}`);
    }
  }

  // Detailed line items by trade
  if (context.lineItemsDetail && context.lineItemsDetail.length > 0) {
    parts.push(``, `CURRENT ESTIMATE — LINE ITEMS BY TRADE:`);
    for (const tradeGroup of context.lineItemsDetail) {
      parts.push(``, `### ${tradeGroup.trade.toUpperCase()} (${tradeGroup.items.length} items)`);
      parts.push(`Subtotal: Material $${tradeGroup.subtotal.materialTotal.toFixed(2)} | Labor $${tradeGroup.subtotal.laborTotal.toFixed(2)} | Total $${tradeGroup.subtotal.amount.toFixed(2)}`);
      for (const item of tradeGroup.items) {
        const costStr = item.unitCost > 0 ? `$${item.unitCost.toFixed(2)}/unit` : 'no cost set';
        parts.push(`- [${item.id}] ${item.description}: ${item.quantity} ${item.unit} (${costStr}, amount: $${item.amount.toFixed(2)})`);
      }
    }
  } else if (context.lineItemsSummary) {
    parts.push(``, `CURRENT ESTIMATE SUMMARY:`, context.lineItemsSummary);
  }

  // Notes
  if (context.propertyNotes && context.propertyNotes.length > 0) {
    parts.push(``, `PROPERTY NOTES:`);
    for (const note of context.propertyNotes) {
      parts.push(`**${note.title}**`);
      for (const line of note.lines) {
        parts.push(`- ${line}`);
      }
    }
  }
  if (context.insulationNotes && context.insulationNotes.length > 0) {
    parts.push(``, `INSULATION NOTES:`);
    for (const note of context.insulationNotes) {
      parts.push(`**${note.title}**`);
      for (const line of note.lines) {
        parts.push(`- ${line}`);
      }
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
      projectName,
      projectAddress,
      buildingModel,
      lineItemsSummary,
      lineItemsDetail,
      propertyData,
      assumptions,
      propertyNotes,
      insulationNotes,
    } = body as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      projectName?: string;
      projectAddress?: string;
      buildingModel?: Record<string, unknown>;
      lineItemsSummary?: string;
      lineItemsDetail?: ChatContext['lineItemsDetail'];
      propertyData?: Record<string, unknown>;
      assumptions?: string[];
      propertyNotes?: Array<{ title: string; lines: string[] }>;
      insulationNotes?: Array<{ title: string; lines: string[] }>;
    };

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'No messages provided' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key') {
      // Return a mock response when API key isn't configured
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const mockResponse = "I'm the AI takeoff assistant. To enable real AI responses, add your Anthropic API key to `.env.local`. For now, I can show you the UI works — try editing the Unit Cost or Unit Price columns in the spreadsheet!";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: mockResponse } })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    // Build the base system prompt
    let systemPrompt = buildSystemPrompt({
      projectName,
      projectAddress,
      buildingModel,
      lineItemsSummary,
      lineItemsDetail,
      propertyData,
      assumptions,
      propertyNotes,
      insulationNotes,
    });

    // Inject learning context from historical adjustments
    const trades = lineItemsDetail
      ? lineItemsDetail.map((g) => g.trade)
      : [];
    const learningContext = await getLearningContext(trades);
    if (learningContext) {
      systemPrompt += '\n' + learningContext;
    }

    // Stream the response
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Convert the Anthropic stream to an SSE ReadableStream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta') {
              const delta = event.delta;
              if ('text' in delta) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'text', text: delta.text })}\n\n`
                  )
                );
              }
            } else if (event.type === 'message_stop') {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'done' })}\n\n`
                )
              );
            }
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
