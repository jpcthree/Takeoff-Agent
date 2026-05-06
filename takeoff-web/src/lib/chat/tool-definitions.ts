/**
 * V2 agent tools (per product plan §5.2).
 *
 * The agent's behavior is defined entirely by these tools. The model never
 * states a measurement or a dollar amount directly — it calls a tool, the
 * tool's executor mutates project state or surfaces UI, and the result is
 * fed back to the model on the next turn.
 *
 * Tools fall into three categories:
 *   • read     — return state to the model (no side effects)
 *   • mutate   — update project state (assumptions, scope items, phase)
 *   • ui       — render a card in chat or navigate the PDF viewer
 */

import type Anthropic from '@anthropic-ai/sdk';

type Tool = Anthropic.Tool;

export const CHAT_TOOLS: Tool[] = [
  // ── Read ────────────────────────────────────────────────────────────
  {
    name: 'get_sheet_manifest',
    description:
      "Returns the per-page sheet classification for the uploaded plan set. Each sheet has type, title, sheet number, scale, and per-trade relevance. Use this to know which sheets matter for the active trade and to refer to sheets by name (e.g. 'A-101 Floor Plan').",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_project_state',
    description:
      "Returns the full project state: enabled trades, current conversation phase, measurements taken (semantic tags + values), confirmed assumptions, open questions, inconsistencies, scope items already produced, and which required measurements are still missing for the active trade. Call this at the start of every turn so you operate on fresh state.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_trade_module',
    description:
      "Returns the active trade module config: prompt extension, sheet relevance, required measurements (with semantic tags + priority), required assumptions (with options), and scope items the rules engine will evaluate. Use this when you need to know what to ask the user next.",
    input_schema: {
      type: 'object' as const,
      properties: {
        trade_id: {
          type: 'string',
          description: 'Trade id (e.g. "insulation", "gutters"). Defaults to the active trade.',
        },
      },
      required: [],
    },
  },

  // ── UI / navigation ─────────────────────────────────────────────────
  {
    name: 'highlight_sheet_region',
    description:
      "Navigate the PDF viewer to a specific page (and optionally a region) so the user can see what you're talking about. Free to call — costs nothing and reduces confusion.",
    input_schema: {
      type: 'object' as const,
      properties: {
        page: { type: 'number', description: '1-indexed PDF page number to navigate to' },
        reason: { type: 'string', description: 'Brief reason shown to the user (e.g. "Showing Floor Plan A-101")' },
      },
      required: ['page'],
    },
  },
  {
    name: 'suggest_measurement',
    description:
      "Tell the user to take a measurement on a specific sheet. Renders a 'Measure this' card in the chat with a button that activates the measurement tool. ALWAYS include a clear semantic_tag (matches the trade module's required measurement tag) and a target page. Bad label: 'measure this'. Good label: 'Front elevation eave length, gable end to gable end'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        semantic_tag: { type: 'string', description: 'Canonical measurement tag from the trade module (e.g. "exterior_wall_area")' },
        label: { type: 'string', description: 'Human-readable label shown to the user' },
        target_page: { type: 'number', description: 'Page where the user should take the measurement' },
        mode: {
          type: 'string',
          enum: ['linear', 'area', 'surface_area'],
          description: 'Measurement mode required',
        },
      },
      required: ['semantic_tag', 'label', 'target_page', 'mode'],
    },
  },
  {
    name: 'request_user_confirmation',
    description:
      "Pause and ask the user to confirm something specific before you proceed. Renders a confirmation card in chat. Use sparingly — only for high-stakes decisions (advancing to the Estimate phase, recalculating after a major change).",
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The yes/no question to ask' },
        context: { type: 'string', description: 'Optional context shown beneath the question' },
      },
      required: ['question'],
    },
  },

  // ── Read (OCR helper) ───────────────────────────────────────────────
  {
    name: 'read_written_dimension',
    description:
      "Run OCR on a sheet to extract dimension callouts (e.g. 12'-6\"). Returns all parsed dimensions found on the page, in source order, each with text + total_feet + formatted form. Use this to cross-check a click-measurement against what the architect drew on the plan, or to read a dimension when the user is unsure. If region coords are omitted, OCR runs on the full page (slower but exhaustive). Specify x/y/width/height in image-pixel coords (150 DPI) to scope OCR to a smaller area for speed.",
    input_schema: {
      type: 'object' as const,
      properties: {
        page: { type: 'number', description: '1-indexed PDF page number' },
        x: { type: 'number', description: 'Optional region top-left x in image-pixel coords' },
        y: { type: 'number', description: 'Optional region top-left y in image-pixel coords' },
        width: { type: 'number', description: 'Optional region width in image pixels' },
        height: { type: 'number', description: 'Optional region height in image pixels' },
      },
      required: ['page'],
    },
  },

  // ── Mutate ──────────────────────────────────────────────────────────
  {
    name: 'add_assumption',
    description:
      "Record a confirmed assumption for the active trade. The key MUST match a key from the trade module's required_assumptions. The value MUST be one of the allowed option values. Use after the user has actively confirmed; prefer suggesting via a confirmation card if uncertain.",
    input_schema: {
      type: 'object' as const,
      properties: {
        trade_id: { type: 'string' },
        key: { type: 'string', description: 'Assumption key from the trade module' },
        value: { type: 'string', description: 'Selected option value' },
        source: {
          type: 'string',
          enum: ['agent_suggested', 'user_confirmed', 'user_override', 'default'],
          description: "Where this came from. Use 'user_confirmed' when the user explicitly agreed.",
        },
      },
      required: ['trade_id', 'key', 'value'],
    },
  },
  {
    name: 'add_open_question',
    description:
      "Log a question that needs to be answered before estimate finalization. Used when the plan can't answer something. Surfaces in the chat panel as an open item.",
    input_schema: {
      type: 'object' as const,
      properties: {
        trade_id: { type: 'string', description: 'Optional trade context' },
        question: { type: 'string' },
      },
      required: ['question'],
    },
  },
  {
    name: 'flag_inconsistency',
    description:
      "Record an inconsistency you detected (e.g., measurement disagrees with a written dimension, two sheets disagree). False positives are cheap; missed errors are expensive. Renders a warning card in chat.",
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string', description: 'One-line summary' },
        detail: { type: 'string', description: 'Optional longer explanation' },
        page_number: { type: 'number', description: 'Page where it surfaces (if applicable)' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'mark_phase_complete',
    description:
      "Advance the conversation to the next phase (orientation → discovery → measurement → assumptions → estimate). Call this only when the goals of the current phase are met. The user can override at any time.",
    input_schema: {
      type: 'object' as const,
      properties: {
        completed_phase: {
          type: 'string',
          enum: ['orientation', 'discovery', 'measurement', 'assumptions', 'estimate'],
        },
        rationale: { type: 'string', description: 'Brief reason this phase is complete' },
      },
      required: ['completed_phase'],
    },
  },
  {
    name: 'generate_estimate_draft',
    description:
      "Trigger the deterministic rules engine for a trade. Validates that all required measurements and assumptions are present, then evaluates each scope item formula. Returns the produced line items and any items that were skipped (with reasons). Call this only after the user confirms assumptions.",
    input_schema: {
      type: 'object' as const,
      properties: {
        trade_id: { type: 'string', description: 'Trade to estimate. Defaults to the active trade.' },
      },
      required: [],
    },
  },
];
