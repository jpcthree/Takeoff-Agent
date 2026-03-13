'use client';

import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ProjectContext {
  projectName?: string;
  projectAddress?: string;
  buildingModel?: Record<string, unknown>;
  lineItemsSummary?: string;
}

interface UseChatOptions {
  /** Called with the final assistant message text when a stream completes. */
  onStreamComplete?: (messageText: string) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hello! I'm your takeoff assistant. I can help you understand your construction estimate, adjust costs, or answer questions about materials and labor. How can I help?",
  timestamp: new Date().toISOString(),
};

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
                fullText += event.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + event.text }
                      : m
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
              } else if (event.type === 'done' || event.type === 'message_stop') {
                // Stream complete — fire callback for action parsing
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

        // Stream finished — notify caller so actions can be parsed & executed
        if (fullText && onStreamCompleteRef.current) {
          onStreamCompleteRef.current(fullText);
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
