/**
 * Project entities introduced in v2 to support the conversation-driven flow.
 *
 * The agent operates over these as the source of truth:
 *   - ConversationPhase: where in the 5-phase flow we are
 *   - Assumption: a confirmed answer to a trade-module question
 *   - OpenQuestion: something the agent flagged for the user to resolve
 *   - Inconsistency: a conflict the agent detected (e.g., measurement vs.
 *     written dimension)
 *   - ScopeItem: a deterministic estimate line item produced by the engine
 */

import type { ScopeItemResult } from '@/lib/engine/estimate-engine';

// ---------------------------------------------------------------------------
// Conversation phases (per product plan §4.1)
// ---------------------------------------------------------------------------

export const CONVERSATION_PHASES = [
  'orientation',
  'discovery',
  'measurement',
  'assumptions',
  'estimate',
] as const;

export type ConversationPhase = typeof CONVERSATION_PHASES[number];

export const PHASE_LABELS: Record<ConversationPhase, string> = {
  orientation: 'Orientation',
  discovery: 'Discovery',
  measurement: 'Measurement',
  assumptions: 'Assumptions',
  estimate: 'Estimate',
};

/** What the agent should be doing in each phase. Used in the system prompt. */
export const PHASE_GOALS: Record<ConversationPhase, string> = {
  orientation:
    'Confirm the trades in scope, summarize the plan set, and identify which sheets are relevant.',
  discovery:
    'Walk the relevant sheets, surface trade-specific features, and ask clarifying scope questions.',
  measurement:
    "Walk the user through measurements in priority order. The user clicks; you suggest where and what. Never state a measurement value yourself.",
  assumptions:
    'Present every accumulated assumption for explicit confirmation. Allow edits.',
  estimate:
    'Trigger the rules engine. Walk the user through the resulting line items.',
};

// ---------------------------------------------------------------------------
// Assumption — a confirmed answer to a trade-module question
// ---------------------------------------------------------------------------

export interface Assumption {
  id: string;
  /** Trade this assumption belongs to */
  tradeId: string;
  /** Variable key from the trade module's required_assumptions */
  key: string;
  /** Selected value */
  value: string;
  /** Where it came from */
  source: 'agent_suggested' | 'user_confirmed' | 'user_override' | 'default';
  /** ISO timestamp */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// OpenQuestion — something the agent flagged that needs user input
// ---------------------------------------------------------------------------

export interface OpenQuestion {
  id: string;
  /** Trade context (optional — could be project-wide) */
  tradeId?: string;
  question: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolution?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Inconsistency — a conflict the agent detected
// ---------------------------------------------------------------------------

export interface Inconsistency {
  id: string;
  /** Short description, e.g. "Measurement disagrees with written dimension" */
  summary: string;
  /** Longer detail */
  detail?: string;
  /** Page number where it surfaces */
  pageNumber?: number;
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// ScopeItem — concrete line item produced by the rules engine
// ---------------------------------------------------------------------------

/**
 * A ScopeItem is the persisted form of a ScopeItemResult. Identical shape
 * for now; carved out as its own type so the persistence surface and the
 * engine output can evolve independently.
 */
export type ScopeItem = ScopeItemResult & {
  /** Stable id (engine emits scopeItemId; we keep both for traceability) */
  id: string;
  /** When the rules engine produced this item */
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function nextPhase(current: ConversationPhase): ConversationPhase | null {
  const idx = CONVERSATION_PHASES.indexOf(current);
  if (idx < 0 || idx >= CONVERSATION_PHASES.length - 1) return null;
  return CONVERSATION_PHASES[idx + 1];
}

export function newAssumption(input: Omit<Assumption, 'id' | 'createdAt'>): Assumption {
  return {
    ...input,
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
}

export function newOpenQuestion(
  input: Omit<OpenQuestion, 'id' | 'status' | 'createdAt'>
): OpenQuestion {
  return {
    ...input,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
}

export function newInconsistency(
  input: Omit<Inconsistency, 'id' | 'status' | 'createdAt'>
): Inconsistency {
  return {
    ...input,
    id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
}

export function scopeItemFromResult(result: ScopeItemResult): ScopeItem {
  return {
    ...result,
    id: `s-${result.scopeItemId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    generatedAt: new Date().toISOString(),
  };
}
