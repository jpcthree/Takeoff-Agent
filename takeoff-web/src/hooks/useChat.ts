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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Tool calls made by the assistant (populated after stream completes) */
  toolCalls?: ToolCall[];
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
  /** Called when a stream completes with text and any tool calls. */
  onStreamComplete?: (messageText: string, toolCalls: ToolCall[]) => void;
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

export function useChat(context: ProjectContext = {}, options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onStreamCompleteRef = useRef(options.onStreamComplete);
  onStreamCompleteRef.current = options.onStreamComplete;
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

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;
      setLastError(null);

      // Add user message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };

      const assistantMsgId = `asst-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      // Abort any previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Build message history for the API (exclude welcome, only last 20 messages)
        const apiMessages = [...messages.filter((m) => m.id !== 'welcome'), userMsg]
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
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

        // Tool use accumulation
        const pendingToolCalls = new Map<string, { name: string; jsonChunks: string[] }>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === 'text') {
                // Streamed text content
                fullText += event.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + event.text }
                      : m
                  )
                );
              } else if (event.type === 'content_block_delta' && event.delta?.text) {
                // Legacy format (mock responses)
                fullText += event.delta.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + event.delta.text }
                      : m
                  )
                );
              } else if (event.type === 'tool_use_start') {
                // Tool call begins — start accumulating input JSON
                pendingToolCalls.set(event.id, { name: event.name, jsonChunks: [] });
              } else if (event.type === 'tool_use_delta') {
                // Streamed tool input JSON chunk
                const pending = pendingToolCalls.get(event.id);
                if (pending) {
                  pending.jsonChunks.push(event.partial_json);
                }
              } else if (event.type === 'tool_use_end') {
                // Tool call complete — nothing else to do here, we'll parse at the end
              } else if (event.type === 'done' || event.type === 'message_stop') {
                // Stream complete
              } else if (event.type === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: `Error: ${event.error}` }
                      : m
                  )
                );
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }

        // Parse completed tool calls
        const completedToolCalls: ToolCall[] = [];
        for (const [id, tc] of pendingToolCalls) {
          try {
            const inputJson = tc.jsonChunks.join('');
            const input = inputJson ? JSON.parse(inputJson) : {};
            completedToolCalls.push({ id, name: tc.name, input });
          } catch {
            // Skip malformed tool call JSON
            console.warn(`Failed to parse tool call ${id} (${tc.name}):`, tc.jsonChunks.join(''));
          }
        }

        // Attach tool calls to the assistant message
        if (completedToolCalls.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, toolCalls: completedToolCalls }
                : m
            )
          );
        }

        // Stream finished — notify caller with text + tool calls
        if (onStreamCompleteRef.current) {
          onStreamCompleteRef.current(fullText, completedToolCalls);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // User-initiated abort. Mark the assistant message so it's clear
          // the response was stopped, and surface the cancellation as an
          // error that the UI can show alongside a Retry affordance.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content || '(stopped)' }
                : m
            )
          );
          return;
        }

        const msg = error instanceof Error ? error.message : String(error);
        setLastError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: m.content || 'Sorry, I encountered an error. Please try again.',
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages, context]
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
