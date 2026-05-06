/**
 * Chat orchestration endpoint (Layer 3 in the v2 architecture).
 *
 * Builds a phase-aware system prompt from:
 *   - the v2 base agent prompt (product plan §6.1)
 *   - the prompt extensions of the active trade modules (§6.1.1, §6.1.3)
 *   - the current conversation phase + its goals
 *   - a compact snapshot of project state
 *
 * The model gets the 12 v2 tools. Tool execution happens client-side
 * (chat-actions.ts) so UI tools can mutate the project store.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CHAT_TOOLS } from '@/lib/chat/tool-definitions';
import { getPromptExtensions, getTradeModule } from '@/lib/trades/trade-loader';
import {
  PHASE_GOALS,
  PHASE_LABELS,
} from '@/lib/types/project';
import type { ConversationPhase } from '@/lib/types/project';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ---------------------------------------------------------------------------
// Base agent prompt (product plan §6.1, condensed)
// ---------------------------------------------------------------------------

const BASE_PROMPT = `# Identity and Role

You are a senior takeoff estimator paired with a contractor on a single residential construction project. You are an expert in residential and light-commercial construction, fluent in reading architectural plans, and familiar with the trades the contractor selected.

You operate inside a software product that pairs you with two deterministic engines: a calibrated measurement engine and a pricing rules engine. You NEVER produce numerical measurements or dollar amounts directly. You guide the contractor through the takeoff, suggest what to measure and where, catch inconsistencies, and confirm assumptions. The engines do the math.

# Hard Rules (non-negotiable)

1. NEVER state a measurement (linear feet, square feet, count) yourself. If you don't have a measurement and need one, call \`suggest_measurement\` and ask the user to take it.
2. NEVER state a dollar amount, labor hour estimate, or material quantity. Those come from the rules engine via \`generate_estimate_draft\` after assumptions are confirmed.
3. NEVER advance phases without explicit or strongly implicit user agreement. Use \`mark_phase_complete\`.
4. NEVER assume a scope decision the user hasn't made. Surface it via \`add_assumption\` (source: agent_suggested) and confirm before treating it as final.
5. ALWAYS flag inconsistencies you detect via \`flag_inconsistency\` (e.g., measurement disagrees with a written dimension, two sheets disagree).
6. ALWAYS prefer reading written dimensions over inferring visually. Use \`read_written_dimension\` when a callout is visible.
7. ALWAYS call \`get_project_state\` near the start of every turn so you operate on fresh state.

# The Five Phases

You drive the conversation through five phases, in order, but the user can interrupt or jump at any time. Track which phase is active in project state.

- **orientation** — confirm trade(s), summarize the plan set, identify relevant sheets, dismiss irrelevant ones.
- **discovery** — walk through relevant sheets, surface trade-specific features, ask clarifying scope questions, log open questions for things the plan can't answer.
- **measurement** — walk the user through measurements in priority order (defined by the trade module). Highlight regions on the plan viewer. Watch for inconsistencies.
- **assumptions** — present every assumption the takeoff has accumulated, get explicit confirmation on each, allow edits.
- **estimate** — trigger \`generate_estimate_draft\`. The pricing engine produces line items. Walk the user through the result and offer next steps.

# Conversational Style

Direct, expert, peer-to-peer. The user is a working contractor, not a customer. No filler ("I'd be happy to help..."). No apologies for being an AI. Use trade vocabulary correctly. When you must clarify, ask one question at a time.

# Tool Usage Notes

- \`get_project_state\` at the start of every turn. Don't operate on stale state.
- Use \`highlight_sheet_region\` whenever you want the user to look at something specific. It's free and reduces confusion.
- \`suggest_measurement\` should always include a clear \`semantic_tag\` (matching the trade module's required measurement tag) and a target page. Bad label: "measure this." Good label: "Front elevation eave length, gable end to gable end."
- \`flag_inconsistency\` early and often. False positives are cheap; missed errors are expensive.

# Output Format

Your text response is rendered in chat. Keep it tight — typically 1-4 sentences plus any tool calls. The user does not want a wall of text. If you have a long list of items, use a short bulleted list, not prose.`;

// ---------------------------------------------------------------------------
// Phase-aware prompt assembly
// ---------------------------------------------------------------------------

function buildPhaseSection(phase: ConversationPhase): string {
  return `# Current Phase: ${PHASE_LABELS[phase]}

Goal: ${PHASE_GOALS[phase]}

Stay focused on this phase's goal. If you've completed it, call \`mark_phase_complete\` to advance.`;
}

function buildStateSection(state: ProjectStateSummary): string {
  const lines: string[] = ['# Project Snapshot', ''];

  if (state.project_name) lines.push(`Project: ${state.project_name}`);
  if (state.project_address) lines.push(`Address: ${state.project_address}`);
  if (state.enabled_trades?.length) lines.push(`Trades: ${state.enabled_trades.join(', ')}`);
  if (state.active_trade) lines.push(`Active trade: ${state.active_trade}`);

  if (state.sheet_summary) {
    lines.push('', `Sheets: ${state.sheet_summary}`);
  } else {
    lines.push('', 'Sheets: PDF not yet uploaded or not yet classified.');
  }

  if (state.measurements_by_tag && Object.keys(state.measurements_by_tag).length) {
    lines.push('', 'Measurements taken:');
    for (const [tag, info] of Object.entries(state.measurements_by_tag)) {
      lines.push(`- ${tag}: ${info.value.toFixed(1)} ${info.unit}`);
    }
  } else {
    lines.push('', 'Measurements taken: none yet.');
  }

  if (state.assumptions?.length) {
    lines.push('', 'Confirmed assumptions:');
    for (const a of state.assumptions) {
      lines.push(`- ${a.trade}.${a.key} = ${a.value}`);
    }
  }

  if (state.gaps) {
    if (state.gaps.missing_measurements?.length) {
      lines.push('', `Missing measurements for ${state.active_trade}: ${state.gaps.missing_measurements.join(', ')}`);
    }
    if (state.gaps.missing_assumptions?.length) {
      lines.push(`Missing assumptions for ${state.active_trade}: ${state.gaps.missing_assumptions.join(', ')}`);
    }
  }

  if (state.open_questions?.length) {
    lines.push('', 'Open questions:');
    for (const q of state.open_questions) {
      lines.push(`- [${q.id}] ${q.question}`);
    }
  }

  if (state.scope_items_count) {
    lines.push('', `Scope items already produced: ${state.scope_items_count}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Request shape
// ---------------------------------------------------------------------------

interface ProjectStateSummary {
  project_name?: string;
  project_address?: string;
  enabled_trades?: string[];
  active_trade?: string | null;
  conversation_phase?: ConversationPhase;
  sheet_summary?: string;
  measurements_by_tag?: Record<string, { value: number; unit: string }>;
  assumptions?: { trade: string; key: string; value: string }[];
  open_questions?: { id: string; question: string }[];
  gaps?: {
    missing_measurements?: string[];
    missing_assumptions?: string[];
  };
  scope_items_count?: number;
}

interface ChatRequestBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** v2 conversation context */
  state?: ProjectStateSummary;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const { messages, state } = body;

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'No messages provided' }, { status: 400 });
    }

    const phase: ConversationPhase = state?.conversation_phase ?? 'orientation';
    const enabledTrades = state?.enabled_trades ?? [];

    // Mock response when no API key (dev convenience)
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key') {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const mock = "I'm the takeoff agent. Add ANTHROPIC_API_KEY to .env.local to enable real responses. The v2 conversation flow is wired — try uploading a PDF and selecting a trade.";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: mock })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    // Split the system prompt into:
    //   • stablePrefix — base + active-trade extension. Same every turn for
    //     a project session, so we mark it cacheable. Anthropic's prompt
    //     cache (5-min TTL, refreshed on every read) drops this from a
    //     ~3K-token re-charge per turn to ~10% on cache hits.
    //   • dynamicSuffix — phase context + project state snapshot. Changes
    //     every turn; not cached.
    const tradeExtensions = getPromptExtensions(enabledTrades);
    const prefixParts = [BASE_PROMPT];

    if (state?.active_trade) {
      const mod = getTradeModule(state.active_trade);
      if (mod) {
        const requiredTags = mod.requiredMeasurements
          .map((m) => `${m.tag} (${m.mode}, ${m.label})`)
          .join('; ');
        const requiredKeys = mod.requiredAssumptions.map((a) => a.key).join(', ');
        prefixParts.push(
          '',
          `# Active Trade: ${mod.displayName}`,
          ``,
          `Required measurement tags: ${requiredTags}`,
          `Required assumption keys: ${requiredKeys}`,
          ``,
          mod.promptExtension
        );
      }
    } else if (tradeExtensions.length > 0) {
      prefixParts.push('', '# Trade Knowledge', '', tradeExtensions.join('\n\n---\n\n'));
    }

    const stablePrefix = prefixParts.filter(Boolean).join('\n');

    const suffixParts = [buildPhaseSection(phase)];
    if (state) suffixParts.push('', buildStateSection(state));
    const dynamicSuffix = suffixParts.filter(Boolean).join('\n');

    // Cache-controlled tool definitions. The schema is constant across all
    // turns in any project session, so caching it pays back on every turn
    // after the first.
    const cachedTools = CHAT_TOOLS.map((tool, i) =>
      i === CHAT_TOOLS.length - 1
        ? { ...tool, cache_control: { type: 'ephemeral' as const } }
        : tool
    );

    const anthropicStream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: [
        // Mark the end of the stable prefix as a cache breakpoint. Anything
        // before (and including) this block is read from cache on subsequent
        // turns within the 5-minute TTL.
        { type: 'text', text: stablePrefix, cache_control: { type: 'ephemeral' } },
        // Dynamic — re-tokenized every turn.
        { type: 'text', text: dynamicSuffix },
      ],
      tools: cachedTools,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    let currentToolUseId: string | null = null;

    // Per-turn token accounting. Anthropic reports cache stats on
    // `message_start`; output_tokens stream up on `message_delta` and
    // `message_stop`. We assemble all four numbers and log a single line
    // at the end of the turn so dev usage is easy to eyeball.
    const usage = {
      input: 0,
      cacheCreate: 0,
      cacheRead: 0,
      output: 0,
    };
    const isDev = process.env.NODE_ENV !== 'production';

    const readableStream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          for await (const event of anthropicStream) {
            if (event.type === 'message_start') {
              const u = event.message?.usage;
              if (u) {
                usage.input = u.input_tokens ?? 0;
                usage.cacheCreate = u.cache_creation_input_tokens ?? 0;
                usage.cacheRead = u.cache_read_input_tokens ?? 0;
                usage.output = u.output_tokens ?? 0;
              }
            } else if (event.type === 'message_delta') {
              if (event.usage?.output_tokens) {
                usage.output = event.usage.output_tokens;
              }
            } else if (event.type === 'content_block_start') {
              const block = event.content_block;
              if (block.type === 'tool_use') {
                currentToolUseId = block.id;
                send({ type: 'tool_use_start', id: block.id, name: block.name });
              }
            } else if (event.type === 'content_block_delta') {
              const delta = event.delta;
              if ('text' in delta) {
                send({ type: 'text', text: delta.text });
              } else if ('partial_json' in delta && currentToolUseId) {
                send({ type: 'tool_use_delta', id: currentToolUseId, partial_json: delta.partial_json });
              }
            } else if (event.type === 'content_block_stop') {
              if (currentToolUseId) {
                send({ type: 'tool_use_end', id: currentToolUseId });
                currentToolUseId = null;
              }
            } else if (event.type === 'message_stop') {
              send({ type: 'done' });
              if (isDev) {
                // Hit ratio = cache_read / (cache_read + cache_create + input)
                // First turn of a session: 0% (cache being warmed)
                // Subsequent turns within 5min TTL: should show ~80-95%
                const cacheable = usage.cacheRead + usage.cacheCreate + usage.input;
                const hitPct = cacheable > 0
                  ? Math.round((usage.cacheRead / cacheable) * 100)
                  : 0;
                console.log(
                  `[chat] in=${usage.input} cache_write=${usage.cacheCreate} cache_read=${usage.cacheRead} out=${usage.output} hit=${hitPct}%`
                );
              }
            }
          }
        } catch (error) {
          send({ type: 'error', error: String(error) });
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
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
