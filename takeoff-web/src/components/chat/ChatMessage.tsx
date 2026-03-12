'use client';

import React from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function ChatMessage({ role, content, timestamp, isStreaming = false }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div
      className={[
        'flex flex-col',
        isUser ? 'items-end' : 'items-start',
      ].join(' ')}
    >
      <div
        className={[
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-primary text-white rounded-br-md'
            : 'bg-gray-100 text-gray-800 rounded-bl-md',
        ].join(' ')}
      >
        {content}
        {isStreaming && !content && (
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
          </span>
        )}
        {isStreaming && content && (
          <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
      {!isStreaming && (
        <span className="mt-1 text-[10px] text-gray-400 px-1">
          {formatTime(timestamp)}
        </span>
      )}
    </div>
  );
}

export { ChatMessage };
export type { ChatMessageProps };
