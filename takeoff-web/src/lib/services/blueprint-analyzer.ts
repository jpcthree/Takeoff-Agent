/**
 * Client-side blueprint analysis service — v2 (5-phase pipeline).
 *
 * Calls Claude directly from the browser to avoid Vercel's body size
 * and timeout limits. Uses a multi-phase approach:
 *
 * Phase 1: Local preprocessing (text, thumbnails, vectors, scale) — parallel, no API
 * Phase 2: Page classification — ONE Claude call for all pages
 * Phase 3: Vector measurement — local, apply scale to vector paths
 * Phase 4: Deep analysis — 3-4 parallel Claude calls on relevant pages only (200 DPI)
 * Phase 5: Smart merge — ONE Claude call to combine results
 *
 * Total: ~60-90 seconds, ~6 API calls (vs. old: ~15 min, ~38 calls)
 */

import Anthropic from '@anthropic-ai/sdk';
import { extractPdfText, getTextExcerpt, type ExtractedPageText } from '@/lib/utils/pdf-text-extract';
import { createThumbnails, createHighResPages } from '@/lib/utils/pdf-to-images';
import { extractAllVectorPaths, type PageVectorData } from '@/lib/utils/pdf-vector-extract';
import { detectScalesFromText, parseScaleString, type ScaleInfo } from '@/lib/utils/scale-detection';
import { measureAllPages, type PageMeasurements } from '@/lib/utils/vector-measurement';
import { PAGE_CLASSIFICATION_PROMPT } from '@/lib/prompts/classify-pages';
import { DEEP_ANALYSIS_PAGE_PROMPT, SMART_MERGE_PROMPT } from '@/lib/prompts/deep-analysis';

// Keep legacy imports for backward compatibility
import {
  TEXT_PRIMARY_PAGE_PROMPT,
  VISION_FALLBACK_PAGE_PROMPT,
  MERGE_PAGES_PROMPT,
} from '@/lib/prompts/analyze-blueprint';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisProgress {
  phase: 'preprocessing' | 'classifying' | 'measuring' | 'analyzing' | 'merging' | 'done' | 'error';
  currentPage: number;
  totalPages: number;
  message: string;
  relevantPages?: number;
}

export type ProgressCallback = (progress: AnalysisProgress) => void;

interface PageClassification {
  page: number;
  type: string;
  description: string;
  scale: string | null;
  relevance: 'analyze' | 'skip';
  construction_data: boolean;
}

interface ProjectTeamMember {
  role: string;
  name: string;
  company?: string;
  license?: string;
  phone?: string;
  email?: string;
}

interface ClassificationResult {
  project_name: string | null;
  project_address: string | null;
  building_type: string;
  project_team?: ProjectTeamMember[];
  pages: PageClassification[];
}

/** Maximum pages to deeply analyze (cap for very large plan sets) */
const MAX_DEEP_ANALYSIS_PAGES = 12;

/** Maximum concurrent Claude calls in Phase 4 */
const MAX_PARALLEL_ANALYSIS = 4;

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

function getResponseText(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function buildMetaContext(projectMeta: { name?: string; address?: string; buildingType?: string }): string {
  return [
    projectMeta.name && `Project: ${projectMeta.name}`,
    projectMeta.address && `Address: ${projectMeta.address}`,
    projectMeta.buildingType && `Building type: ${projectMeta.buildingType}`,
  ]
    .filter(Boolean)
    .join('. ');
}

// ---------------------------------------------------------------------------
// Phase 2: Page Classification
// ---------------------------------------------------------------------------

async function classifyPages(
  client: Anthropic,
  thumbnails: { data: string; mime_type: string }[],
  textPages: ExtractedPageText[],
  projectMeta: { name?: string; address?: string; buildingType?: string },
  signal?: AbortSignal
): Promise<ClassificationResult | null> {
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  const metaContext = buildMetaContext(projectMeta);
  contentBlocks.push({
    type: 'text',
    text: `Classify all ${textPages.length} pages of this blueprint set.${metaContext ? ` ${metaContext}.` : ''}\n\nBelow are thumbnails and text excerpts for each page:`,
  });

  for (let i = 0; i < textPages.length; i++) {
    // Add thumbnail image
    if (thumbnails[i]) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (thumbnails[i].mime_type || 'image/jpeg') as 'image/jpeg',
          data: thumbnails[i].data,
        },
      });
    }

    // Add text excerpt
    const excerpt = getTextExcerpt(textPages[i], 200);
    contentBlocks.push({
      type: 'text',
      text: `--- Page ${i + 1} ---${textPages[i].hasTextLayer ? '' : ' (scanned, no text layer)'}\n${excerpt || '(no extractable text)'}`,
    });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    temperature: 0,
    system: PAGE_CLASSIFICATION_PROMPT,
    messages: [{ role: 'user', content: contentBlocks }],
  });

  if (signal?.aborted) return null;

  const text = getResponseText(response);
  const parsed = extractJsonFromText(text);

  if (!parsed || !Array.isArray(parsed.pages)) {
    return null;
  }

  return parsed as unknown as ClassificationResult;
}

// ---------------------------------------------------------------------------
// Phase 4: Deep Analysis (parallel)
// ---------------------------------------------------------------------------

async function analyzePageDeep(
  client: Anthropic,
  pageImage: { data: string; mime_type: string },
  textPage: ExtractedPageText,
  measurements: PageMeasurements | null,
  classification: PageClassification,
  projectMeta: { name?: string; address?: string; buildingType?: string },
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];
  const metaContext = buildMetaContext(projectMeta);
  const pageNum = classification.page;

  // Text context
  let textBlock = `Analyze page ${pageNum} (${classification.type}: ${classification.description}).${metaContext ? ` ${metaContext}.` : ''}`;

  // Add scale info
  if (measurements?.scale) {
    textBlock += `\n\nDetected Scale: ${measurements.scale.scaleString} (factor ${measurements.scale.scaleFactor})`;
  } else if (classification.scale) {
    textBlock += `\n\nScale from classification: ${classification.scale}`;
  }

  contentBlocks.push({ type: 'text', text: textBlock });

  // High-res image
  contentBlocks.push({
    type: 'image',
    source: {
      type: 'base64',
      media_type: (pageImage.mime_type || 'image/jpeg') as 'image/jpeg',
      data: pageImage.data,
    },
  });

  // Extracted text with spatial positions
  if (textPage.hasTextLayer && textPage.spatialText) {
    contentBlocks.push({
      type: 'text',
      text: `## Extracted Text with Spatial Positions:\n\n${textPage.spatialText}\n\n## Raw text:\n${textPage.rawText.slice(0, 3000)}`,
    });
  }

  // Vector measurement summary
  if (measurements && measurements.segments.length > 0) {
    contentBlocks.push({
      type: 'text',
      text: `## Vector Measurement Summary:\n\n${measurements.summary}`,
    });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    temperature: 0,
    system: DEEP_ANALYSIS_PAGE_PROMPT,
    messages: [{ role: 'user', content: contentBlocks }],
  });

  if (signal?.aborted) return null;
  return extractJsonFromText(getResponseText(response));
}

/**
 * Run deep analysis on multiple pages with controlled parallelism.
 */
async function analyzeDeepParallel(
  client: Anthropic,
  pageImages: Map<number, { data: string; mime_type: string }>,
  textPages: ExtractedPageText[],
  measurements: PageMeasurements[],
  classifications: PageClassification[],
  projectMeta: { name?: string; address?: string; buildingType?: string },
  onProgress: ProgressCallback,
  totalPages: number,
  signal?: AbortSignal
): Promise<{ pageNumber: number; model: Record<string, unknown> }[]> {
  const textByPage = new Map(textPages.map(p => [p.pageNumber, p]));
  const measureByPage = new Map(measurements.map(m => [m.pageNumber, m]));
  const results: { pageNumber: number; model: Record<string, unknown> }[] = [];

  // Build the list of pages to analyze
  const pagesToAnalyze = classifications
    .filter(c => c.relevance === 'analyze')
    .slice(0, MAX_DEEP_ANALYSIS_PAGES);

  // Process in batches with concurrency limit
  for (let i = 0; i < pagesToAnalyze.length; i += MAX_PARALLEL_ANALYSIS) {
    if (signal?.aborted) return results;

    const batch = pagesToAnalyze.slice(i, i + MAX_PARALLEL_ANALYSIS);
    const batchLabel = batch.map(c => c.page).join(', ');

    onProgress({
      phase: 'analyzing',
      currentPage: i + batch.length,
      totalPages,
      relevantPages: pagesToAnalyze.length,
      message: `Analyzing pages ${batchLabel} (${Math.min(i + batch.length, pagesToAnalyze.length)}/${pagesToAnalyze.length} relevant pages)...`,
    });

    const batchPromises = batch.map(async (classification) => {
      const pageNum = classification.page;
      const image = pageImages.get(pageNum);
      const textPage = textByPage.get(pageNum);
      const measurement = measureByPage.get(pageNum) ?? null;

      if (!image || !textPage) return null;

      try {
        const model = await analyzePageDeep(
          client,
          image,
          textPage,
          measurement,
          classification,
          projectMeta,
          signal
        );
        return model ? { pageNumber: pageNum, model } : null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onProgress({
          phase: 'analyzing',
          currentPage: pageNum,
          totalPages,
          message: `⚠ Page ${pageNum} error: ${msg}`,
        });
        return null;
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
        onProgress({
          phase: 'analyzing',
          currentPage: result.value.pageNumber,
          totalPages,
          message: `✓ Page ${result.value.pageNumber} analyzed`,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Phase 5: Smart Merge
// ---------------------------------------------------------------------------

async function smartMerge(
  client: Anthropic,
  pageResults: { pageNumber: number; model: Record<string, unknown> }[],
  classifications: PageClassification[],
  projectMeta: { name?: string; address?: string; buildingType?: string },
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  if (pageResults.length === 1) {
    return pageResults[0].model;
  }

  const metaContext = buildMetaContext(projectMeta);

  const pagesDescription = pageResults
    .map((r) => {
      const cls = classifications.find(c => c.page === r.pageNumber);
      const typeLabel = cls ? `${cls.type}: ${cls.description}` : 'unknown';
      return `### Page ${r.pageNumber} (${typeLabel}):\n\`\`\`json\n${JSON.stringify(r.model, null, 2)}\n\`\`\``;
    })
    .join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    temperature: 0,
    system: SMART_MERGE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Merge these ${pageResults.length} per-page blueprint extractions into a single unified BuildingModel.${metaContext ? ` ${metaContext}.` : ''}

${pagesDescription}`,
      },
    ],
  });

  if (signal?.aborted) return null;
  return extractJsonFromText(getResponseText(response));
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Analyze a construction blueprint PDF and extract a BuildingModel.
 *
 * 5-phase pipeline:
 * 1. Local preprocessing (text, thumbnails, vectors, scale) — parallel, no API calls
 * 2. Page classification — ONE Claude call
 * 3. Vector measurement — local, apply scale
 * 4. Deep analysis — parallel Claude calls on relevant pages at 200 DPI
 * 5. Smart merge — ONE Claude call
 *
 * Runs entirely in the browser — no Vercel function involved.
 */
export interface AnalysisResult {
  model: Record<string, unknown>;
  pageScales: Record<number, ScaleInfo>;
  pageClassifications: { page: number; type: string; description: string }[];
}

export async function analyzeBlueprint(
  file: File,
  projectMeta: { name?: string; address?: string; buildingType?: string },
  apiKey: string,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<AnalysisResult | null> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: Local Preprocessing (parallel — no API calls)
  // ═══════════════════════════════════════════════════════════════════════════

  onProgress({
    phase: 'preprocessing',
    currentPage: 0,
    totalPages: 0,
    message: 'Extracting text, thumbnails, and vector paths...',
  });

  // Run text extraction, thumbnail creation, and vector extraction in parallel
  let textResult: Awaited<ReturnType<typeof extractPdfText>>;
  let thumbnails: { data: string; mime_type: string }[] = [];
  let vectorPages: PageVectorData[] = [];

  try {
    const [textRes, thumbRes, vectorRes] = await Promise.allSettled([
      extractPdfText(file),
      createThumbnails(file, 50, 0.5),
      extractAllVectorPaths(file),
    ]);

    // Text extraction is critical
    if (textRes.status === 'rejected') {
      throw new Error(`Text extraction failed: ${textRes.reason}`);
    }
    textResult = textRes.value;

    // Thumbnails and vectors are optional — degrade gracefully
    if (thumbRes.status === 'fulfilled') {
      thumbnails = thumbRes.value.map(t => ({ data: t.data, mime_type: t.mime_type }));
    }
    if (vectorRes.status === 'fulfilled') {
      vectorPages = vectorRes.value;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ phase: 'error', currentPage: 0, totalPages: 0, message: `Preprocessing failed: ${msg}` });
    return null;
  }

  const { pages: textPages, totalPages } = textResult;

  // Detect scales from text (fast, local)
  const detectedScales = detectScalesFromText(textPages);

  onProgress({
    phase: 'preprocessing',
    currentPage: 0,
    totalPages,
    message: `${totalPages} pages: ${textResult.pagesWithText} with text, ${textResult.pagesWithoutText} scanned. ${vectorPages.reduce((sum, p) => sum + p.totalLines, 0)} vector lines extracted. ${detectedScales.length} scales detected.`,
  });

  if (signal?.aborted) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2: Page Classification (ONE Claude call)
  // ═══════════════════════════════════════════════════════════════════════════

  onProgress({
    phase: 'classifying',
    currentPage: 0,
    totalPages,
    message: `Classifying ${totalPages} pages...`,
  });

  let classification: ClassificationResult | null = null;

  try {
    classification = await classifyPages(client, thumbnails, textPages, projectMeta, signal);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      phase: 'classifying',
      currentPage: 0,
      totalPages,
      message: `⚠ Classification failed (${msg}), falling back to analyzing all pages`,
    });
  }

  if (signal?.aborted) return null;

  // Build effective page list — if classification failed, treat all pages as relevant
  let pageClassifications: PageClassification[];
  if (classification?.pages?.length) {
    pageClassifications = classification.pages;

    // Merge Claude's scale detection with local regex detection
    const scaleByPage = new Map(detectedScales.map(s => [s.pageNumber, s]));
    for (const pc of pageClassifications) {
      const localScale = scaleByPage.get(pc.page);
      if (localScale && localScale.confidence === 'high') {
        // Local regex wins (it's reading exact text)
        pc.scale = localScale.scaleString;
      } else if (pc.scale && !localScale) {
        // Claude found it, regex didn't — add to our scale list
        const factor = parseScaleString(pc.scale);
        if (factor) {
          detectedScales.push({
            pageNumber: pc.page,
            scaleString: pc.scale,
            scaleFactor: factor,
            source: 'claude_classification',
            confidence: 'medium',
          });
        }
      }
    }
  } else {
    // Fallback: all pages are relevant
    pageClassifications = textPages.map((_, i) => ({
      page: i + 1,
      type: 'unknown',
      description: 'Classification unavailable',
      scale: detectedScales.find(s => s.pageNumber === i + 1)?.scaleString ?? null,
      relevance: 'analyze' as const,
      construction_data: true,
    }));
  }

  const relevantPages = pageClassifications.filter(c => c.relevance === 'analyze');
  const relevantPageNumbers = relevantPages.map(c => c.page).slice(0, MAX_DEEP_ANALYSIS_PAGES);

  onProgress({
    phase: 'classifying',
    currentPage: 0,
    totalPages,
    relevantPages: relevantPageNumbers.length,
    message: `✓ ${relevantPageNumbers.length} of ${totalPages} pages identified for deep analysis: ${relevantPages.slice(0, MAX_DEEP_ANALYSIS_PAGES).map(p => `p${p.page}(${p.type})`).join(', ')}`,
  });

  if (relevantPageNumbers.length === 0) {
    onProgress({
      phase: 'error',
      currentPage: totalPages,
      totalPages,
      message: 'No pages with construction data found in this blueprint set',
    });
    return null;
  }

  if (signal?.aborted) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3: Vector Measurement (local — no API call)
  // ═══════════════════════════════════════════════════════════════════════════

  onProgress({
    phase: 'measuring',
    currentPage: 0,
    totalPages,
    message: 'Applying scale to vector measurements...',
  });

  const measurements = measureAllPages(vectorPages, textPages, detectedScales, relevantPageNumbers);

  const measuredCount = measurements.filter(m => m.segments.length > 0).length;
  onProgress({
    phase: 'measuring',
    currentPage: 0,
    totalPages,
    message: `✓ Vector measurements applied to ${measuredCount} pages`,
  });

  // Build per-page scale lookup (highest confidence wins per page)
  const pageScales: Record<number, ScaleInfo> = {};
  for (const s of detectedScales) {
    const existing = pageScales[s.pageNumber];
    if (!existing || (s.confidence === 'high' && existing.confidence !== 'high')) {
      pageScales[s.pageNumber] = s;
    }
  }

  // Build simplified page classification list for UI (thumbnail titles)
  const pageClassificationsSimple = pageClassifications.map((c) => ({
    page: c.page,
    type: c.type,
    description: c.description,
  }));

  if (signal?.aborted) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 4: Deep Analysis — Parallel Claude calls at 200 DPI
  // ═══════════════════════════════════════════════════════════════════════════

  onProgress({
    phase: 'analyzing',
    currentPage: 0,
    totalPages,
    relevantPages: relevantPageNumbers.length,
    message: `Rendering ${relevantPageNumbers.length} pages at high resolution...`,
  });

  // Render high-res images only for relevant pages
  let highResPages: Map<number, { data: string; mime_type: string }>;
  try {
    const rendered = await createHighResPages(file, relevantPageNumbers, 200, 0.80);
    highResPages = new Map(rendered.map(p => [p.page_number, { data: p.data, mime_type: p.mime_type }]));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      phase: 'error',
      currentPage: 0,
      totalPages,
      message: `Failed to render high-res pages: ${msg}`,
    });
    return null;
  }

  if (signal?.aborted) return null;

  const pageResults = await analyzeDeepParallel(
    client,
    highResPages,
    textPages,
    measurements,
    pageClassifications.filter(c => c.relevance === 'analyze').slice(0, MAX_DEEP_ANALYSIS_PAGES),
    projectMeta,
    onProgress,
    totalPages,
    signal
  );

  if (signal?.aborted) return null;

  if (pageResults.length === 0) {
    onProgress({
      phase: 'error',
      currentPage: totalPages,
      totalPages,
      message: 'No construction details extracted from any page',
    });
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 5: Smart Merge (ONE Claude call)
  // ═══════════════════════════════════════════════════════════════════════════

  onProgress({
    phase: 'merging',
    currentPage: totalPages,
    totalPages,
    message: pageResults.length > 1
      ? `Merging ${pageResults.length} page analyses into unified model...`
      : 'Finalizing building model...',
  });

  try {
    const mergedModel = await smartMerge(
      client,
      pageResults,
      pageClassifications,
      projectMeta,
      signal
    );

    if (mergedModel) {
      // Inject project info from classification if available
      if (classification?.project_name && !mergedModel.project_name) {
        mergedModel.project_name = classification.project_name;
      }
      if (classification?.project_address && !mergedModel.project_address) {
        mergedModel.project_address = classification.project_address;
      }
      if (classification?.building_type && !mergedModel.building_type) {
        mergedModel.building_type = classification.building_type;
      }
      if (classification?.project_team?.length && !mergedModel.project_team) {
        mergedModel.project_team = classification.project_team;
      }

      onProgress({
        phase: 'done',
        currentPage: totalPages,
        totalPages,
        message: `✓ Building model complete (${pageResults.length} pages analyzed)`,
      });
      return { model: mergedModel, pageScales, pageClassifications: pageClassificationsSimple };
    } else {
      // Fallback: return the best single page result
      onProgress({
        phase: 'merging',
        currentPage: totalPages,
        totalPages,
        message: '⚠ Merge failed, using best single-page result',
      });
      return { model: pageResults[0].model, pageScales, pageClassifications: pageClassificationsSimple };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      phase: 'error',
      currentPage: totalPages,
      totalPages,
      message: `Merge error: ${msg}`,
    });
    // Still try to return something useful
    if (pageResults.length > 0) {
      return { model: pageResults[0].model, pageScales, pageClassifications: pageClassificationsSimple };
    }
    return null;
  }
}
