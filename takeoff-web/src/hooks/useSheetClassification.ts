'use client';

/**
 * Auto-runs sheet classification when PDF pages become available.
 *
 * Triggers /api/classify-sheets once per project once `pdfPages` is non-empty.
 * Persists the manifest to localStorage. Re-runs only if the page count
 * changes (e.g. user replaces the PDF) — otherwise the cached manifest is
 * loaded on mount.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useProjectStore } from './useProjectStore';
import {
  loadSheetManifestLocal,
  saveSheetManifestLocal,
} from '@/lib/data/local-persistence';
import type { SheetManifest, SheetClassification } from '@/lib/types/sheet-manifest';
import { backfillTradeRelevance } from '@/lib/types/sheet-manifest';

export interface SheetClassificationStatus {
  /** Last error from a failed classification, if any. */
  error: string | null;
  /** Manually retry classification (clears the error and triggers a fresh run). */
  retry: () => void;
}

export function useSheetClassification(projectId: string | undefined): SheetClassificationStatus {
  const { state, setSheetManifest, setClassifyingSheets } = useProjectStore();
  const { pdfPages, pdfFile, sheetManifest, classifyingSheets } = state;

  // Track in-flight requests so we don't double-fire on re-renders.
  const inFlightRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumping this counter is how `retry()` re-triggers the classify effect.
  const [retryNonce, setRetryNonce] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    inFlightRef.current = null;
    setRetryNonce((n) => n + 1);
  }, []);

  // ── Load cached manifest on mount ──
  useEffect(() => {
    if (!projectId || sheetManifest) return;
    const cached = loadSheetManifestLocal(projectId);
    if (cached) setSheetManifest(cached);
    // setSheetManifest is stable from useCallback in store
  }, [projectId, sheetManifest, setSheetManifest]);

  // ── Auto-classify when pages arrive and manifest is missing or stale ──
  useEffect(() => {
    if (!projectId || pdfPages.length === 0 || classifyingSheets) return;

    const filename = pdfFile?.name ?? 'unknown.pdf';
    const cacheKey = `${projectId}:${filename}:${pdfPages.length}`;

    // Already classified for this exact pdf?
    if (
      sheetManifest &&
      sheetManifest.pdfFilename === filename &&
      sheetManifest.sheets.length === pdfPages.length
    ) {
      return;
    }

    // Already running this exact request?
    if (inFlightRef.current === cacheKey) return;
    inFlightRef.current = cacheKey;

    (async () => {
      setClassifyingSheets(true);
      setError(null);

      // Fan out one fetch per page. Each request body stays well under the
      // 4.5 MB Vercel function body limit (a single 150 DPI PNG is ~1-3 MB
      // base64). The endpoint already supports a 1-page list, so no API
      // changes needed.
      //
      // Concurrency cap of 4 keeps the Anthropic call-rate sane and matches
      // the bound the server-side classifier was using.
      const CONCURRENCY = 4;
      const sheets: (SheetClassification | null)[] = new Array(pdfPages.length).fill(null);
      const failures: string[] = [];

      async function classifyOne(idx: number): Promise<void> {
        const page = pdfPages[idx];
        try {
          const resp = await fetch('/api/classify-sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              pdfFilename: filename,
              pages: [page],
            }),
          });
          if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            failures.push(`page ${page.page_number}: ${resp.status} ${body.slice(0, 80)}`);
            sheets[idx] = unknownSheet(page.page_number);
            return;
          }
          const partial = (await resp.json()) as SheetManifest;
          sheets[idx] = partial.sheets[0] ?? unknownSheet(page.page_number);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`page ${page.page_number}: ${msg.slice(0, 80)}`);
          sheets[idx] = unknownSheet(page.page_number);
        }

        // Stream a partial manifest so the UI fills in as pages complete.
        // Pages still in flight render as undefined slots in the array;
        // we keep them filtered out until they land.
        const completed = sheets.filter((s): s is SheetClassification => s !== null);
        if (projectId) {
          setSheetManifest({
            projectId,
            pdfFilename: filename,
            classifiedAt: new Date().toISOString(),
            sheets: completed.sort((a, b) => a.page - b.page),
          });
        }
      }

      try {
        // Worker pool: each worker pulls the next index until exhausted.
        let cursor = 0;
        const workers = Array.from(
          { length: Math.min(CONCURRENCY, pdfPages.length) },
          async () => {
            while (true) {
              const i = cursor++;
              if (i >= pdfPages.length) return;
              await classifyOne(i);
            }
          }
        );
        await Promise.all(workers);

        // Final manifest with all pages.
        const final: SheetManifest = {
          projectId,
          pdfFilename: filename,
          classifiedAt: new Date().toISOString(),
          sheets: sheets
            .filter((s): s is SheetClassification => s !== null)
            .sort((a, b) => a.page - b.page),
        };
        setSheetManifest(final);
        saveSheetManifestLocal(projectId, final);

        if (failures.length > 0 && failures.length === pdfPages.length) {
          // Every page failed — surface to the user
          setError(`All ${pdfPages.length} pages failed classification. First: ${failures[0]}`);
        } else if (failures.length > 0) {
          console.warn(`[classify-sheets] ${failures.length}/${pdfPages.length} pages failed:`, failures);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[classify-sheets] failed:', msg);
        setError(msg);
      } finally {
        setClassifyingSheets(false);
        inFlightRef.current = null;
      }
    })();
  }, [
    projectId,
    pdfPages,
    pdfFile,
    sheetManifest,
    classifyingSheets,
    setSheetManifest,
    setClassifyingSheets,
    retryNonce,
  ]);

  return { error, retry };
}

/** Fallback sheet entry when an individual page fails classification. */
function unknownSheet(pageNumber: number): SheetClassification {
  return {
    page: pageNumber,
    sheetType: 'unknown',
    title: '',
    sheetNumber: '',
    scale: null,
    tradeRelevance: backfillTradeRelevance('unknown', undefined),
    confidence: 'low',
  };
}
