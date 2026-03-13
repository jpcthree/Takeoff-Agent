import Anthropic from '@anthropic-ai/sdk';
import { ANALYSIS_SYSTEM_PROMPT } from '@/lib/prompts/analyze-blueprint';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export const maxDuration = 120; // Allow up to 2 minutes for vision analysis

// ---------------------------------------------------------------------------
// Route handler — POST /api/analyze
// Receives base64 PNG pages, sends them to Claude vision, streams back
// progress events and the final BuildingModel JSON.
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pages, projectMeta } = body as {
      pages: { data: string; mime_type: string; page_number: number }[];
      projectMeta?: { name?: string; address?: string; buildingType?: string };
    };

    if (!pages || pages.length === 0) {
      return Response.json({ error: 'No pages provided' }, { status: 400 });
    }

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key'
    ) {
      // Mock response when API key isn't configured
      return streamMockAnalysis();
    }

    // Build the vision message with all pages as images
    const imageBlocks: Anthropic.Messages.ContentBlockParam[] = [];

    // Add a text intro
    imageBlocks.push({
      type: 'text',
      text: `Analyze these ${pages.length} blueprint page(s) for a construction takeoff. ${
        projectMeta?.name ? `Project: ${projectMeta.name}.` : ''
      } ${projectMeta?.address ? `Address: ${projectMeta.address}.` : ''} ${
        projectMeta?.buildingType ? `Building type: ${projectMeta.buildingType}.` : ''
      }

Please analyze each page, identify what it shows (floor plan, elevation, section, detail, schedule, etc.), and extract all dimensions, specifications, and construction details into a complete BuildingModel JSON.`,
    });

    // Add each page as an image
    for (const page of pages) {
      imageBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (page.mime_type || 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: page.data,
        },
      });
      imageBlocks.push({
        type: 'text',
        text: `(Page ${page.page_number})`,
      });
    }

    // Stream the response
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: imageBlocks,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta') {
              const delta = event.delta;
              if ('text' in delta) {
                fullText += delta.text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'text',
                      text: delta.text,
                    })}\n\n`
                  )
                );
              }
            } else if (event.type === 'message_stop') {
              // Extract the JSON from the full response
              const buildingModel = extractJsonFromResponse(fullText);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'building_model',
                    model: buildingModel,
                  })}\n\n`
                )
              );
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
              `data: ${JSON.stringify({
                type: 'error',
                error: String(error),
              })}\n\n`
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
    console.error('Analyze API error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Extract JSON from Claude's response text
// ---------------------------------------------------------------------------

function extractJsonFromResponse(text: string): Record<string, unknown> | null {
  // Try to find JSON in a code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // Fall through to try the whole text
    }
  }

  // Try to find a JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Return null if we can't parse
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Mock analysis for dev mode
// ---------------------------------------------------------------------------

function streamMockAnalysis(): Response {
  const encoder = new TextEncoder();
  const mockModel = {
    project_name: 'Demo ADU',
    project_address: '123 Main Street',
    building_type: 'residential',
    stories: 1,
    sqft: 520,
    walls: [
      {
        id: 'w1',
        floor: 1,
        wall_type: 'exterior',
        length: { feet: 26, inches: 0 },
        height: { feet: 9, inches: 0 },
        thickness: '2x6',
        is_exterior: true,
        stud_spacing: 16,
        insulation_type: 'closed_cell_spray',
        insulation_r_value: 30,
        drywall_type: 'standard_1_2',
      },
      {
        id: 'w2',
        floor: 1,
        wall_type: 'exterior',
        length: { feet: 20, inches: 0 },
        height: { feet: 9, inches: 0 },
        thickness: '2x6',
        is_exterior: true,
        stud_spacing: 16,
        insulation_type: 'closed_cell_spray',
        insulation_r_value: 30,
        drywall_type: 'standard_1_2',
      },
      {
        id: 'w3',
        floor: 1,
        wall_type: 'exterior',
        length: { feet: 26, inches: 0 },
        height: { feet: 9, inches: 0 },
        thickness: '2x6',
        is_exterior: true,
        stud_spacing: 16,
        insulation_type: 'closed_cell_spray',
        insulation_r_value: 30,
        drywall_type: 'standard_1_2',
      },
      {
        id: 'w4',
        floor: 1,
        wall_type: 'exterior',
        length: { feet: 20, inches: 0 },
        height: { feet: 9, inches: 0 },
        thickness: '2x6',
        is_exterior: true,
        stud_spacing: 16,
        insulation_type: 'closed_cell_spray',
        insulation_r_value: 30,
        drywall_type: 'standard_1_2',
      },
    ],
    rooms: [
      { id: 'r1', floor: 1, name: 'Living Room', length: { feet: 14, inches: 0 }, width: { feet: 12, inches: 0 }, height: { feet: 9, inches: 0 }, floor_finish: 'vinyl_plank' },
      { id: 'r2', floor: 1, name: 'Bedroom', length: { feet: 12, inches: 0 }, width: { feet: 10, inches: 0 }, height: { feet: 9, inches: 0 }, floor_finish: 'vinyl_plank' },
      { id: 'r3', floor: 1, name: 'Kitchen', length: { feet: 10, inches: 0 }, width: { feet: 8, inches: 0 }, height: { feet: 9, inches: 0 }, is_kitchen: true, floor_finish: 'vinyl_plank' },
      { id: 'r4', floor: 1, name: 'Bathroom', length: { feet: 8, inches: 0 }, width: { feet: 6, inches: 0 }, height: { feet: 9, inches: 0 }, is_bathroom: true, floor_finish: 'tile' },
    ],
    roof: {
      style: 'gable',
      material: 'architectural_shingle',
      pitch: 5,
      total_area_sf: 650,
      ridge_length: { feet: 26, inches: 0 },
      eave_length: { feet: 52, inches: 0 },
    },
    foundation: {
      type: 'slab',
      perimeter_lf: 92,
    },
    siding_type: 'fiber_cement',
  };

  const analysisText = `## Blueprint Analysis

**Page 1: Floor Plan**
- 1-story ADU, approximately 26' × 20' (520 SF)
- 4 rooms identified: Living Room, Bedroom, Kitchen, Bathroom
- 9' ceiling heights throughout
- 2×6 exterior wall framing

**Key Measurements:**
- Exterior walls: 92 LF perimeter
- Roof: Gable style, 5/12 pitch
- Foundation: Slab-on-grade

**Building Model Extracted:**

\`\`\`json
${JSON.stringify(mockModel, null, 2)}
\`\`\``;

  const stream = new ReadableStream({
    async start(controller) {
      // Stream the analysis text character by character (in chunks for speed)
      const chunkSize = 20;
      for (let i = 0; i < analysisText.length; i += chunkSize) {
        const chunk = analysisText.slice(i, i + chunkSize);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'text', text: chunk })}\n\n`
          )
        );
        // Small delay to simulate streaming
        await new Promise((r) => setTimeout(r, 10));
      }

      // Send the building model
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'building_model',
            model: mockModel,
          })}\n\n`
        )
      );
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
