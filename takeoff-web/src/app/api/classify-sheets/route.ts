/**
 * Layer 1 — Sheet classification.
 *
 * Takes a list of PDF pages (base64-encoded thumbnails) and returns a
 * SheetManifest with per-page type, title, scale, sheet number, and
 * per-trade relevance.
 *
 * Uses Claude vision; one model call per page (parallelized with bounded
 * concurrency) so that one bad page doesn't tank the whole manifest.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  type SheetClassification,
  type SheetManifest,
  type SheetType,
  type Relevance,
  backfillTradeRelevance,
} from '@/lib/types/sheet-manifest';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Bounded concurrency keeps cost predictable and avoids rate-limit storms
// on large plan sets. Tuned conservatively; raise once stable.
const MAX_CONCURRENT = 4;

const VALID_TYPES: SheetType[] = [
  'cover', 'site_plan', 'floor_plan', 'reflected_ceiling_plan', 'roof_plan',
  'elevation', 'building_section', 'wall_section', 'detail',
  'window_schedule', 'door_schedule', 'wall_types', 'specifications',
  'mechanical', 'electrical', 'plumbing', 'structural', 'unknown',
];

const CLASSIFICATION_PROMPT = `You are classifying a single sheet from a residential construction plan set.

Return a JSON object with this exact shape (no surrounding text, no markdown):
{
  "sheetType": "<one of: ${VALID_TYPES.join(', ')}>",
  "title": "<title from the title block, or empty string>",
  "sheetNumber": "<sheet number like A-101, or empty string>",
  "scale": "<scale string like '1/4\\" = 1\\'-0\\"' or null if not visible>",
  "tradeRelevance": {
    "insulation": "<primary|secondary|irrelevant>",
    "gutters": "<primary|secondary|irrelevant>"
  },
  "confidence": "<high|medium|low>"
}

Trade relevance guidance:
- insulation cares about: floor plans, wall sections, building sections, specifications (R-values), wall types schedule
- gutters cares about: roof plans, elevations, site plans (drainage), wall sections (fascia detail)
- Mark "primary" only if a contractor would actively use this sheet to take measurements for that trade
- Mark "secondary" if the sheet provides supporting context (specs, references, cross-checks)
- Mark "irrelevant" otherwise

Return ONLY the JSON object.`;

interface ClassifyRequest {
  projectId: string;
  pdfFilename: string;
  pages: { page_number: number; data: string; mime_type: string }[];
}

async function classifyOnePage(
  page: { page_number: number; data: string; mime_type: string }
): Promise<SheetClassification> {
  try {
    const resp = await anthropic.messages.create({
      // Sheet-type classification is a low-complexity vision task — Haiku 4.5
      // handles it well at ~5x lower cost than Sonnet, and on a 25-page set
      // that drops the per-project classification spend from ~$0.25 to ~$0.05.
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: page.mime_type as 'image/png' | 'image/jpeg',
                data: page.data,
              },
            },
            { type: 'text', text: CLASSIFICATION_PROMPT },
          ],
        },
      ],
    });

    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();

    // Strip optional markdown fence
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(jsonStr) as Partial<SheetClassification>;

    const sheetType: SheetType = VALID_TYPES.includes(parsed.sheetType as SheetType)
      ? (parsed.sheetType as SheetType)
      : 'unknown';

    return {
      page: page.page_number,
      sheetType,
      title: parsed.title ?? '',
      sheetNumber: parsed.sheetNumber ?? '',
      scale: parsed.scale ?? null,
      tradeRelevance: backfillTradeRelevance(
        sheetType,
        parsed.tradeRelevance as Record<string, Relevance> | undefined
      ),
      confidence: (['high', 'medium', 'low'] as const).includes(parsed.confidence as 'high')
        ? (parsed.confidence as 'high' | 'medium' | 'low')
        : 'low',
    };
  } catch (err) {
    console.error(`[classify-sheets] page ${page.page_number} failed:`, err);
    return {
      page: page.page_number,
      sheetType: 'unknown',
      title: '',
      sheetNumber: '',
      scale: null,
      tradeRelevance: backfillTradeRelevance('unknown', undefined),
      confidence: 'low',
    };
  }
}

/** Run an array of async tasks with bounded concurrency, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ClassifyRequest;
    if (!body.pages?.length) {
      return Response.json({ error: 'No pages supplied' }, { status: 400 });
    }

    const sheets = await mapWithConcurrency(body.pages, MAX_CONCURRENT, classifyOnePage);

    const manifest: SheetManifest = {
      projectId: body.projectId,
      pdfFilename: body.pdfFilename,
      classifiedAt: new Date().toISOString(),
      sheets,
    };

    return Response.json(manifest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[classify-sheets] failed:', err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
