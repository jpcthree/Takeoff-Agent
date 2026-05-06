'use client';

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { MessageSquare, PanelRightClose, PanelRightOpen, Trash2, Square, AlertCircle } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { PhaseIndicator } from './PhaseIndicator';
import { PendingActionCard } from './PendingActionCard';
import { useChat } from '@/hooks/useChat';
import { useProjectStore } from '@/hooks/useProjectStore';
import { executeToolCall } from '@/lib/actions/chat-actions';
import type { StoreCallbacks } from '@/lib/actions/chat-actions';
import type { ToolCall } from '@/hooks/useChat';
import { getTradeModule } from '@/lib/trades/trade-loader';
import type { CostDatabase } from '@/lib/engine/estimate-engine';

function ChatPanel() {
  const {
    state,
    addAssumption,
    addOpenQuestion,
    addInconsistency,
    setConversationPhase,
    setActiveTrade,
    replaceTradeScopeItems,
    setPendingAgentAction,
    setActiveMeasurementTool,
  } = useProjectStore();
  const {
    projectMeta,
    pdfPages,
    measurements,
    assumptions,
    openQuestions,
    inconsistencies,
    scopeItems,
    conversationPhase,
    activeTradeId,
    sheetManifest,
    costs,
    pendingAgentAction,
  } = state;

  // ── Build the v2 state snapshot the agent receives ──
  const agentContext = useMemo(() => {
    // Aggregate measurements by semantic tag
    const byTag: Record<string, { value: number; unit: string }> = {};
    for (const m of measurements) {
      if (!m.semanticTag) continue;
      const existing = byTag[m.semanticTag];
      if (existing) {
        existing.value += m.resultValue;
      } else {
        byTag[m.semanticTag] = { value: m.resultValue, unit: m.resultUnit };
      }
    }

    // Compute gaps for the active trade
    let missingMeasurements: string[] = [];
    let missingAssumptions: string[] = [];
    if (activeTradeId) {
      const mod = getTradeModule(activeTradeId);
      if (mod) {
        missingMeasurements = mod.requiredMeasurements
          .filter((rm) => !(rm.tag in byTag))
          .map((rm) => rm.tag);
        const have = new Set(
          assumptions.filter((a) => a.tradeId === activeTradeId).map((a) => a.key)
        );
        missingAssumptions = mod.requiredAssumptions
          .filter((ra) => !have.has(ra.key))
          .map((ra) => ra.key);
      }
    }

    // Compact sheet summary
    let sheetSummary: string | undefined;
    if (sheetManifest && sheetManifest.sheets.length) {
      const counts: Record<string, number> = {};
      for (const s of sheetManifest.sheets) {
        counts[s.sheetType] = (counts[s.sheetType] ?? 0) + 1;
      }
      sheetSummary = `${sheetManifest.sheets.length} sheets: ${Object.entries(counts)
        .map(([t, c]) => `${c} ${t.replace(/_/g, ' ')}`)
        .join(', ')}`;
    }

    return {
      state: {
        project_name: projectMeta.name || undefined,
        project_address: projectMeta.address || undefined,
        enabled_trades: projectMeta.selectedTrades?.length ? projectMeta.selectedTrades : undefined,
        active_trade: activeTradeId,
        conversation_phase: conversationPhase,
        sheet_summary: sheetSummary,
        measurements_by_tag: byTag,
        assumptions: assumptions.map((a) => ({ trade: a.tradeId, key: a.key, value: a.value })),
        open_questions: openQuestions
          .filter((q) => q.status === 'open')
          .map((q) => ({ id: q.id, question: q.question })),
        gaps: {
          missing_measurements: missingMeasurements,
          missing_assumptions: missingAssumptions,
        },
        scope_items_count: scopeItems.length,
      },
    };
  }, [
    projectMeta,
    measurements,
    assumptions,
    openQuestions,
    scopeItems,
    conversationPhase,
    activeTradeId,
    sheetManifest,
  ]);

  // ── Tool execution ──
  const handleStreamComplete = useCallback(
    async (_text: string, toolCalls: ToolCall[]) => {
      if (toolCalls.length === 0) return;

      const store: StoreCallbacks = {
        getProjectMeta: () => projectMeta,
        getMeasurements: () => measurements,
        getAssumptions: () => assumptions,
        getOpenQuestions: () => openQuestions,
        getInconsistencies: () => inconsistencies,
        getScopeItems: () => scopeItems,
        getConversationPhase: () => conversationPhase,
        getActiveTradeId: () => activeTradeId,
        getSheetManifest: () => sheetManifest,
        getCosts: () => (costs as CostDatabase | null) ?? null,
        getPdfPage: (page: number) => {
          const pageData = pdfPages[page - 1];
          if (!pageData) return null;
          return { data: pageData.data, mime_type: pageData.mime_type };
        },

        addAssumption,
        addOpenQuestion,
        addInconsistency,
        setConversationPhase,
        setActiveTrade,
        replaceTradeScopeItems,
        setPendingAgentAction,

        navigateToPage: (page: number) => {
          // Surface page-nav requests via a custom event the PdfViewer listens for.
          window.dispatchEvent(new CustomEvent('takeoff:navigate-page', { detail: { page } }));
        },
        startMeasurementTool: (tool) => setActiveMeasurementTool(tool),
      };

      for (const toolCall of toolCalls) {
        await executeToolCall(toolCall, store);
      }
    },
    [
      projectMeta,
      measurements,
      assumptions,
      openQuestions,
      inconsistencies,
      scopeItems,
      conversationPhase,
      activeTradeId,
      sheetManifest,
      costs,
      pdfPages,
      addAssumption,
      addOpenQuestion,
      addInconsistency,
      setConversationPhase,
      setActiveTrade,
      replaceTradeScopeItems,
      setPendingAgentAction,
      setActiveMeasurementTool,
    ]
  );

  const { messages, isStreaming, lastError, sendMessage, stopStreaming, clearMessages } = useChat(agentContext, {
    onStreamComplete: handleStreamComplete,
    projectId: projectMeta.id ?? null,
  });

  // Track the last user message so we can offer a one-click retry on error.
  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return '';
  }, [messages]);

  const [collapsed, setCollapsed] = React.useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingAgentAction]);

  if (collapsed) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 border-l border-gray-200">
        <button
          onClick={() => setCollapsed(false)}
          className="flex flex-col items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <PanelRightOpen className="h-5 w-5" />
          <span className="text-xs [writing-mode:vertical-lr]">AI Assistant</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 shrink-0">
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
          {isStreaming && (
            <button
              onClick={stopStreaming}
              title="Stop response"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 cursor-pointer px-1.5 py-0.5 rounded border border-gray-200 hover:border-red-300"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          )}
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

      {/* Phase breadcrumb */}
      <PhaseIndicator phase={conversationPhase} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
            toolCalls={msg.toolCalls}
            isStreaming={
              isStreaming &&
              msg.id === messages[messages.length - 1]?.id &&
              msg.role === 'assistant'
            }
          />
        ))}
        {pendingAgentAction && (
          <PendingActionCard
            action={pendingAgentAction}
            onResolved={() => setPendingAgentAction(null)}
          />
        )}
        {lastError && !isStreaming && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-800">Chat error</p>
                <p className="text-xs text-red-700 mt-0.5 break-words">{lastError}</p>
              </div>
            </div>
            {lastUserMessage && (
              <button
                onClick={() => sendMessage(lastUserMessage)}
                className="text-xs font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
              >
                Retry last message
              </button>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}

export { ChatPanel };
