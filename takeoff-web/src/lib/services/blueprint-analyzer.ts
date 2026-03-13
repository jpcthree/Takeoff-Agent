/**
 * Client-side blueprint analysis service.
 *
 * Calls Claude directly from the browser to avoid Vercel's body size
 * and timeout limits. Uses a hybrid text-primary / vision-fallback
 * strategy for optimal speed and accuracy.
 *
 * Flow:
 * 1. Extract text layer from each page (pdf.js getTextContent)
 * 2. Create small thumbnails for visual context
 * 3. Per-page Claude calls (text+thumb or vision, depending on text availability)
 * 4. Merge per-page results into a unified BuildingModel
 */

import Anthropic from '@anthropic-ai/sdk';
import { extractPdfText, type ExtractedPageText } from '@/lib/utils/pdf-text-extract';
import { createThumbnails, createVisionPage } from '@/lib/utils/pdf-to-images';
import {
  TEXT_PRIMARY_PAGE_PROMPT,
  VISION_FALLBACK_PAGE_PROMPT,
  MERGE_PAGES_PROMPT,
} from '@/lib/prompts/analyze-blueprint';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisProgress {
  phase: 'extracting' | 'analyzing' | 'merging' | 'done' | 'error';
  currentPage: number;
  totalPages: number;
  message: string;
}

export type ProgressCallback = (progress: AnalysisProgress) => void;

// ---------------------------------------------------------------------------
// JSON Extraction Utility
// ---------------------------------------------------------------------------

function extractJsonFromText(text: string): Record<string, unknown> | null {
  // Try code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // Fall through
    }
  }

  // Try bare JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Return null
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Per-Page Analysis
// ---------------------------------------------------------------------------

async function analyzePageWithText(
  client: Anthropic,
  pageText: ExtractedPageText,
  thumbnail: { data: string; mime_type: string } | null,
  projectMeta: { name?: string; address?: string; buildingType?: string },
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  // Context about the project
  const metaContext = [
    projectMeta.name && `Project: ${projectMeta.name}`,
    projectMeta.address && `Address: ${projectMeta.address}`,
    projectMeta.buildingType && `Building type: ${projectMeta.buildingType}`,
  ]
    .filter(Boolean)
    .join('. ');

  // Add the spatial text
  contentBlocks.push({
    type: 'text',
    text: `Analyze page ${pageText.pageNumber} of a construction blueprint set.${metaContext ? ` ${metaContext}.` : ''}

## Extracted Text with Spatial Positions:

${pageText.spatialText}

## Raw text (for reference):
${pageText.rawText.slice(0, 3000)}`,
  });

  // Add thumbnail if available
  if (thumbnail) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: (thumbnail.mime_type || 'image/jpeg') as 'image/jpeg',
        data: thumbnail.data,
      },
    });
    contentBlocks.push({
      type: 'text',
      text: '(Small thumbnail of this page for visual layout context)',
    });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: TEXT_PRIMARY_PAGE_PROMPT,
    messages: [{ role: 'user', content: contentBlocks }],
  });

  // Check for abort
  if (signal?.aborted) return null;

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return extractJsonFromText(text);
}

async function analyzePageWithVision(
  client: Anthropic,
  file: File,
  pageNumber: number,
  projectMeta: { name?: string; address?: string; buildingType?: string },
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  const visionPage = await createVisionPage(file, pageNumber);

  const metaContext = [
    projectMeta.name && `Project: ${projectMeta.name}`,
    projectMeta.address && `Address: ${projectMeta.address}`,
    projectMeta.buildingType && `Building type: ${projectMeta.buildingType}`,
  ]
    .filter(Boolean)
    .join('. ');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: VISION_FALLBACK_PAGE_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze page ${pageNumber} of a construction blueprint set.${metaContext ? ` ${metaContext}.` : ''}`,
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (visionPage.mime_type || 'image/jpeg') as 'image/jpeg',
              data: visionPage.data,
            },
          },
        ],
      },
    ],
  });

  if (signal?.aborted) return null;

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return extractJsonFromText(text);
}

// ---------------------------------------------------------------------------
// Merge Per-Page Results
// ---------------------------------------------------------------------------

async function mergePageResults(
  client: Anthropic,
  pageResults: { pageNumber: number; model: Record<string, unknown> }[],
  projectMeta: { name?: string; address?: string; buildingType?: string },
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  // If only one page, return it directly (no merge needed)
  if (pageResults.length === 1) {
    return pageResults[0].model;
  }

  const pagesDescription = pageResults
    .map(
      (r) =>
        `### Page ${r.pageNumber} extraction:\n\`\`\`json\n${JSON.stringify(r.model, null, 2)}\n\`\`\``
    )
    .join('\n\n');

  const metaContext = [
    projectMeta.name && `Project: ${projectMeta.name}`,
    projectMeta.address && `Address: ${projectMeta.address}`,
    projectMeta.buildingType && `Building type: ${projectMeta.buildingType}`,
  ]
    .filter(Boolean)
    .join('. ');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: MERGE_PAGES_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Merge these ${pageResults.length} per-page blueprint extractions into a single unified BuildingModel.${metaContext ? ` ${metaContext}.` : ''}

${pagesDescription}`,
      },
    ],
  });

  if (signal?.aborted) return null;

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return extractJsonFromText(text);
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Analyze a construction blueprint PDF and extract a BuildingModel.
 * Runs entirely in the browser — no Vercel function involved.
 */
export async function analyzeBlueprint(
  file: File,
  projectMeta: { name?: string; address?: string; buildingType?: string },
  apiKey: string,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  // Phase 1: Extract text from all pages
  onProgress({
    phase: 'extracting',
    currentPage: 0,
    totalPages: 0,
    message: 'Extracting text from PDF...',
  });

  const textResult = await extractPdfText(file);
  const { pages: textPages, totalPages } = textResult;

  onProgress({
    phase: 'extracting',
    currentPage: 0,
    totalPages,
    message: `Found ${textResult.pagesWithText} pages with text, ${textResult.pagesWithoutText} scanned`,
  });

  if (signal?.aborted) return null;

  // Phase 2: Create thumbnails for pages with text
  let thumbnails: { data: string; mime_type: string }[] = [];
  if (textResult.pagesWithText > 0) {
    onProgress({
      phase: 'extracting',
      currentPage: 0,
      totalPages,
      message: 'Creating page thumbnails...',
    });
    const thumbResult = await createThumbnails(file, 50, 0.5);
    thumbnails = thumbResult.map((t) => ({ data: t.data, mime_type: t.mime_type }));
  }

  if (signal?.aborted) return null;

  // Phase 3: Analyze each page
  const pageResults: { pageNumber: number; model: Record<string, unknown> }[] = [];

  for (let i = 0; i < totalPages; i++) {
    if (signal?.aborted) return null;

    const pageText = textPages[i];
    const pageNum = i + 1;

    onProgress({
      phase: 'analyzing',
      currentPage: pageNum,
      totalPages,
      message: `Analyzing page ${pageNum} of ${totalPages}${pageText.hasTextLayer ? ' (text mode)' : ' (vision mode)'}...`,
    });

    let pageModel: Record<string, unknown> | null = null;

    try {
      if (pageText.hasTextLayer) {
        // Text-primary mode
        pageModel = await analyzePageWithText(
          client,
          pageText,
          thumbnails[i] || null,
          projectMeta,
          signal
        );
      } else {
        // Vision-fallback mode
        pageModel = await analyzePageWithVision(
          client,
          file,
          pageNum,
          projectMeta,
          signal
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress({
        phase: 'analyzing',
        currentPage: pageNum,
        totalPages,
        message: `⚠ Page ${pageNum} analysis error: ${msg}`,
      });
      // Continue with other pages
      continue;
    }

    if (pageModel) {
      pageResults.push({ pageNumber: pageNum, model: pageModel });
      onProgress({
        phase: 'analyzing',
        currentPage: pageNum,
        totalPages,
        message: `✓ Page ${pageNum} analyzed`,
      });
    }
  }

  if (signal?.aborted) return null;

  if (pageResults.length === 0) {
    onProgress({
      phase: 'error',
      currentPage: totalPages,
      totalPages,
      message: 'No construction details found in any page',
    });
    return null;
  }

  // Phase 4: Merge results
  onProgress({
    phase: 'merging',
    currentPage: totalPages,
    totalPages,
    message:
      pageResults.length > 1
        ? `Merging ${pageResults.length} page analyses into unified model...`
        : 'Finalizing building model...',
  });

  try {
    const mergedModel = await mergePageResults(client, pageResults, projectMeta, signal);

    if (mergedModel) {
      onProgress({
        phase: 'done',
        currentPage: totalPages,
        totalPages,
        message: '✓ Building model complete',
      });
      return mergedModel;
    } else {
      onProgress({
        phase: 'error',
        currentPage: totalPages,
        totalPages,
        message: 'Failed to merge page results into building model',
      });
      return null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      phase: 'error',
      currentPage: totalPages,
      totalPages,
      message: `Merge error: ${msg}`,
    });
    return null;
  }
}
