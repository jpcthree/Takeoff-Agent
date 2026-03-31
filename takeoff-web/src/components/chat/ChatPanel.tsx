'use client';

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { MessageSquare, PanelRightClose, PanelRightOpen, Trash2 } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useChat } from '@/hooks/useChat';
import { useProjectStore } from '@/hooks/useProjectStore';
import { executeToolCall } from '@/lib/actions/chat-actions';
import type { ToolCall } from '@/hooks/useChat';

function ChatPanel() {
  const { state, updateBuildingModel, replaceTradeItems, addLineItem, removeLineItem, updateLineItem } =
    useProjectStore();
  const { projectMeta, buildingModel, lineItems, costs, propertyData, assumptions, propertyNotes, insulationNotes } = state;

  // Build a summary of line items by trade for the chat context
  const lineItemsSummary = useMemo(() => {
    if (lineItems.length === 0) return '';
    const byTrade: Record<string, number> = {};
    for (const item of lineItems) {
      byTrade[item.trade] = (byTrade[item.trade] || 0) + 1;
    }
    return Object.entries(byTrade)
      .map(([trade, count]) => `${trade}: ${count} items`)
      .join('. ');
  }, [lineItems]);

  // Build detailed line items grouped by trade for rich context
  const lineItemsDetail = useMemo(() => {
    if (lineItems.length === 0) return undefined;
    const tradeMap = new Map<string, typeof lineItems>();
    for (const item of lineItems) {
      const existing = tradeMap.get(item.trade) || [];
      existing.push(item);
      tradeMap.set(item.trade, existing);
    }
    return Array.from(tradeMap.entries()).map(([trade, items]) => ({
      trade,
      items: items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitCost: i.unitCost,
        unitPrice: i.unitPrice,
        amount: i.amount,
      })),
      subtotal: {
        materialTotal: items.reduce((s, i) => s + i.materialTotal, 0),
        laborTotal: items.reduce((s, i) => s + i.laborTotal, 0),
        amount: items.reduce((s, i) => s + i.amount, 0),
      },
    }));
  }, [lineItems]);

  // Execute tool calls when the assistant finishes streaming
  const handleStreamComplete = useCallback(
    async (_text: string, toolCalls: ToolCall[]) => {
      if (toolCalls.length === 0) return;

      const store = {
        updateBuildingModel,
        replaceTradeItems,
        addLineItem,
        removeLineItem,
        updateLineItem,
        getBuildingModel: () => buildingModel,
        getCosts: () => costs,
        getLineItems: () => lineItems,
      };

      for (const toolCall of toolCalls) {
        await executeToolCall(toolCall, store);
      }
    },
    [updateBuildingModel, replaceTradeItems, addLineItem, removeLineItem, updateLineItem, buildingModel, costs, lineItems]
  );

  const { messages, isStreaming, sendMessage, clearMessages } = useChat(
    {
      projectName: projectMeta.name,
      projectAddress: projectMeta.address,
      buildingModel: buildingModel || undefined,
      lineItemsSummary: lineItemsSummary || undefined,
      lineItemsDetail,
      propertyData: propertyData ? (propertyData as unknown as Record<string, unknown>) : undefined,
      assumptions: assumptions.length > 0 ? assumptions : undefined,
      propertyNotes: propertyNotes.length > 0 ? propertyNotes : undefined,
      insulationNotes: insulationNotes.length > 0 ? insulationNotes : undefined,
    },
    { onStreamComplete: handleStreamComplete }
  );

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
            toolCalls={msg.toolCalls}
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
