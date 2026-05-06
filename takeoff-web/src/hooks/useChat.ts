'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  /** Stringified result fed back to Claude on the next turn */
  content: string;
  is_error?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Tool calls made by the assistant (populated after stream completes) */
  toolCalls?: ToolCall[];
  /** Tool results paired to a previous turn's toolCalls; sent back to Claude */
  toolResults?: ToolResult[];
}

/**
 * v2 state snapshot sent to /api/chat on every turn so the agent can
 * compose a phase-aware system prompt without doing its own state read.
 */
interface ProjectContext {
  state?: {
    project_name?: string;
    project_address?: string;
    enabled_trades?: string[];
    active_trade?: string | null;
    conversation_phase?: 'orientation' | 'discovery' | 'measurement' | 'assumptions' | 'estimate';
    sheet_summary?: string;
    measurements_by_tag?: Record<string, { value: number; unit: string }>;
    assumptions?: { trade: string; key: string; value: string }[];
    open_questions?: { id: string; question: string }[];
    gaps?: {
      missing_measurements?: string[];
      missing_assumptions?: string[];
    };
    scope_items_count?: number;
  };
}

interface UseChatOptions {
  /**
   * Execute a tool call and return the structured result that gets fed
   * back to Claude on the next loop iteration. The result's `content`
   * field is what Claude sees; it should be a compact, model-friendly
   * string (JSON-stringified payload + summary, typically).
   */
  executeTool?: (toolCall: ToolCall) => Promise<ToolResult>;
  /** Project id used to scope conversation history in localStorage. Pass null/undefined to disable persistence. */
  projectId?: string | null;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** Last error from a failed stream, if any. Cleared on next sendMessage(). */
  lastError: string | null;
  sendMessage: (content: string) => Promise<void>;
  /** Abort the in-flight stream. Safe to call when nothing is streaming. */
  stopStreaming: () => void;
  clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Welcome message
// ---------------------------------------------------------------------------

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi — I'm your takeoff agent. Upload a plan set, pick a trade, and I'll guide you through the takeoff. I'll suggest measurements, confirm assumptions with you, then run the rules engine to produce the estimate. Ready when you are.",
  timestamp: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Conversation persistence
// ---------------------------------------------------------------------------

const HISTORY_KEY_PREFIX = 'takeoff-';
const HISTORY_KEY_SUFFIX = '-conversationHistory';
/** Cap on stored turns to avoid unbounded localStorage growth. */
const MAX_STORED_MESSAGES = 200;

function historyKey(projectId: string): string {
  return `${HISTORY_KEY_PREFIX}${projectId}${HISTORY_KEY_SUFFIX}`;
}

function saveHistory(projectId: string, messages: ChatMessage[]): void {
  try {
    // Drop the welcome message and cap to MAX_STORED_MESSAGES
    const real = messages.filter((m) => m.id !== 'welcome').slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(historyKey(projectId), JSON.stringify(real));
  } catch {
    // ignore
  }
}

function loadHistory(projectId: string): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(historyKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Cap on agentic loop iterations per user turn. Anthropic best practice
 *  is a hard ceiling so a misbehaving agent can't burn unbounded tokens. */
const MAX_AGENT_LOOP_ITERATIONS = 8;

/** Cap on stored conversation turns sent back to the model. Older turns are
 *  trimmed from the API payload (still kept in localStorage / UI). */
const MAX_API_HISTORY = 20;

// ---------------------------------------------------------------------------
// API message types (mirror Anthropic's content-block shape)
// ---------------------------------------------------------------------------

type ApiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

type ApiMessage =
  | { role: 'user'; content: string | ApiContentBlock[] }
  | { role: 'assistant'; content: string | ApiContentBlock[] };

/**
 * Build the API message history from our internal ChatMessage[]. For each
 * historical assistant turn that included tool_use blocks, expand it into
 * a structured assistant message + a synthetic user "tool_result" message,
 * matching Anthropic's expected shape.
 *
 * The current user message is appended last as a plain text turn.
 */
function buildApiHistory(messages: ChatMessage[], userMsg: ChatMessage): ApiMessage[] {
  const out: ApiMessage[] = [];
  const recent = messages.filter((m) => m.id !== 'welcome').slice(-MAX_API_HISTORY);

  for (const m of recent) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    // assistant — may carry tool calls + results
    if (m.toolCalls?.length) {
      const blocks: ApiContentBlock[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      out.push({ role: 'assistant', content: blocks });

      if (m.toolResults?.length) {
        out.push({
          role: 'user',
          content: m.toolResults.map((r) => ({
            type: 'tool_result' as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
            ...(r.is_error ? { is_error: true } : {}),
          })),
        });
      }
    } else if (m.content) {
      out.push({ role: 'assistant', content: m.content });
    }
  }

  out.push({ role: 'user', content: userMsg.content });
  return out;
}

export function useChat(context: ProjectContext = {}, options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const executeToolRef = useRef(options.executeTool);
  executeToolRef.current = options.executeTool;
  const projectId = options.projectId ?? null;

  // ── Load persisted history on mount ──
  const loadedHistoryRef = useRef(false);
  useEffect(() => {
    if (!projectId || loadedHistoryRef.current) return;
    loadedHistoryRef.current = true;
    const persisted = loadHistory(projectId);
    if (persisted && persisted.length > 0) {
      setMessages([WELCOME_MESSAGE, ...persisted]);
    }
  }, [projectId]);

  // ── Save on change (skip while loading & while streaming to avoid churn) ──
  useEffect(() => {
    if (!projectId || !loadedHistoryRef.current || isStreaming) return;
    saveHistory(projectId, messages);
  }, [projectId, messages, isStreaming]);

  /**
   * Run one streaming turn: POST current history, append a new assistant
   * message that grows as tokens arrive, parse any tool_use blocks. Returns
   * the captured text + tool calls so the caller can decide whether to loop.
   */
  const streamOneTurn = useCallback(
    async (
      historyForApi: ApiMessage[],
      controller: AbortController
    ): Promise<{ assistantMsgId: string; text: string; toolCalls: ToolCall[] }> => {
      const assistantMsgId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyForApi,
          ...context,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Chat API error: ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const pendingToolCalls = new Map<string, { name: string; jsonChunks: string[] }>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'text') {
              fullText += event.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + event.text } : m
                )
              );
            } else if (event.type === 'content_block_delta' && event.delta?.text) {
              fullText += event.delta.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.delta.text }
                    : m
                )
              );
            } else if (event.type === 'tool_use_start') {
              pendingToolCalls.set(event.id, { name: event.name, jsonChunks: [] });
            } else if (event.type === 'tool_use_delta') {
              const pending = pendingToolCalls.get(event.id);
              if (pending) pending.jsonChunks.push(event.partial_json);
            } else if (event.type === 'tool_use_end') {
              // No-op; we'll parse at the end
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: `Error: ${event.error}` } : m
                )
              );
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }

      const toolCalls: ToolCall[] = [];
      for (const [id, tc] of pendingToolCalls) {
        try {
          const inputJson = tc.jsonChunks.join('');
          const input = inputJson ? JSON.parse(inputJson) : {};
          toolCalls.push({ id, name: tc.name, input });
        } catch {
          console.warn(`Failed to parse tool call ${id} (${tc.name}):`, tc.jsonChunks.join(''));
        }
      }
      if (toolCalls.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, toolCalls } : m
          )
        );
      }

      return { assistantMsgId, text: fullText, toolCalls };
    },
    [context]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;
      setLastError(null);

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Working API history — grows across loop iterations as we feed
        // tool results back to Claude. Cap base history at 20 turns.
        let apiHistory: ApiMessage[] = buildApiHistory(messages, userMsg);

        for (let iter = 0; iter < MAX_AGENT_LOOP_ITERATIONS; iter++) {
          const { text, toolCalls } = await streamOneTurn(apiHistory, controller);

          // No tool calls? Agent is done with this turn.
          if (toolCalls.length === 0) break;

          // Execute every tool call, collect results, then loop.
          const exec = executeToolRef.current;
          if (!exec) {
            console.warn('[useChat] tool calls received but no executor configured');
            break;
          }

          const results: ToolResult[] = [];
          for (const tc of toolCalls) {
            try {
              const r = await exec(tc);
              results.push(r);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              results.push({ tool_use_id: tc.id, content: `Tool execution failed: ${msg}`, is_error: true });
            }
          }

          // Stash results on the assistant message for persistence/replay.
          setMessages((prev) => {
            const lastAssistantIdx = (() => {
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].role === 'assistant') return i;
              }
              return -1;
            })();
            if (lastAssistantIdx < 0) return prev;
            return prev.map((m, i) =>
              i === lastAssistantIdx ? { ...m, toolResults: results } : m
            );
          });

          // Build the structured assistant message + tool_result user message
          // and append to the running API history for the next iteration.
          const assistantBlocks: ApiContentBlock[] = [
            ...(text ? [{ type: 'text' as const, text }] : []),
            ...toolCalls.map((tc) => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.input,
            })),
          ];
          const toolResultBlocks: ApiContentBlock[] = results.map((r) => ({
            type: 'tool_result' as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
            ...(r.is_error ? { is_error: true } : {}),
          }));
          apiHistory = [
            ...apiHistory,
            { role: 'assistant', content: assistantBlocks },
            { role: 'user', content: toolResultBlocks },
          ];

          if (controller.signal.aborted) break;
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // User-initiated abort: mark the most recent assistant bubble as stopped.
          setMessages((prev) => {
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === 'assistant') {
                return prev.map((m, idx) =>
                  idx === i ? { ...m, content: m.content || '(stopped)' } : m
                );
              }
            }
            return prev;
          });
          return;
        }

        const msg = error instanceof Error ? error.message : String(error);
        setLastError(msg);
        setMessages((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === 'assistant') {
              return prev.map((m, idx) =>
                idx === i
                  ? {
                      ...m,
                      content: m.content || 'Sorry, I encountered an error. Please try again.',
                    }
                  : m
              );
            }
          }
          return prev;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages, streamOneTurn]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setLastError(null);
    if (projectId) {
      try {
        localStorage.removeItem(historyKey(projectId));
      } catch {
        // ignore
      }
    }
  }, [projectId]);

  return { messages, isStreaming, lastError, sendMessage, stopStreaming, clearMessages };
}
