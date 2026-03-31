'use client';

import { useState, useCallback, useRef } from 'react';

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

interface ProjectContext {
  projectName?: string;
  projectAddress?: string;
  buildingModel?: Record<string, unknown>;
  lineItemsSummary?: string;
  /** Full line items grouped by trade for detailed context */
  lineItemsDetail?: Array<{
    trade: string;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unit: string;
      unitCost: number;
      unitPrice: number;
      amount: number;
    }>;
    subtotal: { materialTotal: number; laborTotal: number; amount: number };
  }>;
  /** Property data from address lookup */
  propertyData?: Record<string, unknown>;
  /** Assumptions used in the estimate */
  assumptions?: string[];
  /** Property notes */
  propertyNotes?: Array<{ title: string; lines: string[] }>;
  /** Insulation-specific notes */
  insulationNotes?: Array<{ title: string; lines: string[] }>;
}

interface UseChatOptions {
  /** Called when a stream completes with text and any tool calls. */
  onStreamComplete?: (messageText: string, toolCalls: ToolCall[]) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Welcome message
// ---------------------------------------------------------------------------

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hello! I'm your takeoff assistant. I can help you understand your construction estimate, adjust costs, or answer questions about materials and labor. How can I help?",
  timestamp: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(context: ProjectContext = {}, options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const onStreamCompleteRef = useRef(options.onStreamComplete);
  onStreamCompleteRef.current = options.onStreamComplete;

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

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
        if ((error as Error).name === 'AbortError') return;

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

  const clearMessages = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
  }, []);

  return { messages, isStreaming, sendMessage, clearMessages };
}
