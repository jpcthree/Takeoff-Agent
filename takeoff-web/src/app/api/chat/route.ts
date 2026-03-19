import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(context: {
  projectName?: string;
  projectAddress?: string;
  buildingModel?: Record<string, unknown>;
  lineItemsSummary?: string;
}): string {
  const parts = [
    `You are a construction takeoff assistant embedded in a project workspace. You help users understand, verify, and adjust their construction cost estimates.`,
    ``,
    `Your capabilities:`,
    `- Explain why specific quantities were calculated (e.g., "14 sheets of drywall because...")`,
    `- Verify quantities against building dimensions`,
    `- Suggest adjustments when the user provides information not on the plans`,
    `- Explain trade-specific concepts (waste factors, labor rates, material choices)`,
    `- Help users understand the relationship between building model data and line items`,
    ``,
    `When the user asks you to make changes to the estimate, respond with your analysis and include a JSON action block that the frontend will execute. Format actions as:`,
    `\`\`\`action`,
    `{"type": "recalculate_trade", "trade": "insulation", "reason": "User requested R-60 spray foam"}`,
    `\`\`\``,
    ``,
    `Available action types:`,
    `- recalculate_trade: Re-run a specific trade calculator (trades: insulation, drywall, roofing, gutters)`,
    `- update_building_model: Modify a field on the building model, e.g. {"type": "update_building_model", "changes": {"roof_insulation_r_value": 60}}`,
    ``,
    `Insulation covers many assembly types. Modifiable fields include: walls[].insulation_type/r_value/continuous_insulation_type/continuous_insulation_r_value, attic_insulation_type/r_value, attic_baffles/attic_baffle_count, attic_hatch_insulation, roof_insulation_type/r_value (cathedral), slab_edge_insulation/r_value/type/depth/perimeter, under_slab_insulation/r_value/area, basement_wall_insulation/type/r_value/location/area, rim_joist_insulation/type/r_value/perimeter, knee_wall_insulation/type/r_value/area, floor_over_unconditioned/type/r_value/area/support, garage_ceiling_insulation/type/r_value/area, garage_wall_insulation/type/r_value/area, crawlspace_wall_insulation/type/r_value, air_sealing, vapor_barrier, house_wrap. After updating fields, always recalculate_trade insulation.`,
    `- add_line_item: Add a manual line item`,
    `- remove_line_item: Remove a line item by description`,
    ``,
    `Be concise but thorough. Use bullet points for clarity. When discussing costs, always note that Unit Cost and Unit Price columns are user-input fields.`,
  ];

  if (context.projectName) {
    parts.push(``, `PROJECT: ${context.projectName}`);
  }
  if (context.projectAddress) {
    parts.push(`ADDRESS: ${context.projectAddress}`);
  }
  if (context.buildingModel) {
    parts.push(``, `BUILDING MODEL:`, JSON.stringify(context.buildingModel, null, 2));
  }
  if (context.lineItemsSummary) {
    parts.push(``, `CURRENT ESTIMATE SUMMARY:`, context.lineItemsSummary);
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
    } = body as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      projectName?: string;
      projectAddress?: string;
      buildingModel?: Record<string, unknown>;
      lineItemsSummary?: string;
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

    const systemPrompt = buildSystemPrompt({
      projectName,
      projectAddress,
      buildingModel,
      lineItemsSummary,
    });

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
