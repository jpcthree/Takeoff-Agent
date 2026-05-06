'use client';

/**
 * Loads and saves the v2 conversation entities (assumptions, open questions,
 * inconsistencies, scope items, phase, active trade) to localStorage.
 *
 * Mount once at the workspace level. Loads on first render; saves whenever
 * the relevant state slice changes.
 */

import { useEffect, useRef } from 'react';
import { useProjectStore } from './useProjectStore';
import {
  loadAssumptionsLocal,
  saveAssumptionsLocal,
  loadOpenQuestionsLocal,
  saveOpenQuestionsLocal,
  loadInconsistenciesLocal,
  saveInconsistenciesLocal,
  loadScopeItemsLocal,
  saveScopeItemsLocal,
  loadConversationPhaseLocal,
  saveConversationPhaseLocal,
  loadActiveTradeLocal,
  saveActiveTradeLocal,
} from '@/lib/data/local-persistence';

export function useV2Persistence(projectId: string | undefined): void {
  const {
    state,
    setAssumptions,
    setScopeItems,
    setConversationPhase,
    setActiveTrade,
    dispatch,
  } = useProjectStore();

  const loadedRef = useRef(false);

  // ── Load on mount ──
  useEffect(() => {
    if (!projectId || loadedRef.current) return;
    loadedRef.current = true;

    const a = loadAssumptionsLocal(projectId);
    if (a && a.length) setAssumptions(a);

    const oq = loadOpenQuestionsLocal(projectId);
    if (oq && oq.length) {
      // Use direct dispatch for bulk load to avoid N renders
      for (const q of oq) dispatch({ type: 'ADD_OPEN_QUESTION', question: q });
    }

    const inc = loadInconsistenciesLocal(projectId);
    if (inc && inc.length) {
      for (const i of inc) dispatch({ type: 'ADD_INCONSISTENCY', inconsistency: i });
    }

    const si = loadScopeItemsLocal(projectId);
    if (si && si.length) setScopeItems(si);

    const phase = loadConversationPhaseLocal(projectId);
    if (phase) setConversationPhase(phase);

    const trade = loadActiveTradeLocal(projectId);
    if (trade !== null) setActiveTrade(trade);
  }, [projectId, setAssumptions, setScopeItems, setConversationPhase, setActiveTrade, dispatch]);

  // ── Save on change (debounced via state-watching effects) ──
  useEffect(() => {
    if (!projectId || !loadedRef.current) return;
    saveAssumptionsLocal(projectId, state.assumptions);
  }, [projectId, state.assumptions]);

  useEffect(() => {
    if (!projectId || !loadedRef.current) return;
    saveOpenQuestionsLocal(projectId, state.openQuestions);
  }, [projectId, state.openQuestions]);

  useEffect(() => {
    if (!projectId || !loadedRef.current) return;
    saveInconsistenciesLocal(projectId, state.inconsistencies);
  }, [projectId, state.inconsistencies]);

  useEffect(() => {
    if (!projectId || !loadedRef.current) return;
    saveScopeItemsLocal(projectId, state.scopeItems);
  }, [projectId, state.scopeItems]);

  useEffect(() => {
    if (!projectId || !loadedRef.current) return;
    saveConversationPhaseLocal(projectId, state.conversationPhase);
  }, [projectId, state.conversationPhase]);

  useEffect(() => {
    if (!projectId || !loadedRef.current) return;
    saveActiveTradeLocal(projectId, state.activeTradeId);
  }, [projectId, state.activeTradeId]);
}
