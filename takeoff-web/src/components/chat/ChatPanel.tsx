'use client';

import React, { useRef, useEffect } from 'react';
import { MessageSquare, PanelRightClose, PanelRightOpen, Trash2 } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useChat } from '@/hooks/useChat';

interface ChatPanelProps {
  projectName?: string;
  projectAddress?: string;
  buildingModel?: Record<string, unknown>;
  lineItemsSummary?: string;
}

function ChatPanel({
  projectName,
  projectAddress,
  buildingModel,
  lineItemsSummary,
}: ChatPanelProps) {
  const { messages, isStreaming, sendMessage, clearMessages } = useChat({
    projectName,
    projectAddress,
    buildingModel,
    lineItemsSummary,
  });

  const [collapsed, setCollapsed] = React.useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (collapsed) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 border-l border-gray-200">
        <button
          onClick={() => setCollapsed(false)}
          className="flex flex-col items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <PanelRightOpen className="h-5 w-5" />
          <span className="text-xs [writing-mode:vertical-lr]">
            AI Assistant
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-gray-900">AI Assistant</h3>
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              typing
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearMessages}
            title="Clear chat"
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1 rounded"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1 rounded"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
            isStreaming={isStreaming && msg.id === messages[messages.length - 1]?.id && msg.role === 'assistant'}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}

export { ChatPanel };
export type { ChatPanelProps };
