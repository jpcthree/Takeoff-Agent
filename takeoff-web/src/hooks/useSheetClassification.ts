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
import type { SheetManifest } from '@/lib/types/sheet-manifest';

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
      try {
        const resp = await fetch('/api/classify-sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            pdfFilename: filename,
            pages: pdfPages,
          }),
        });
        if (!resp.ok) {
          const body = await resp.text().catch(() => '');
          const msg = `Classification failed (${resp.status})${body ? ': ' + body.slice(0, 200) : ''}`;
          console.warn('[classify-sheets]', msg);
          setError(msg);
          return;
        }
        const manifest = (await resp.json()) as SheetManifest;
        setSheetManifest(manifest);
        saveSheetManifestLocal(projectId, manifest);
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
