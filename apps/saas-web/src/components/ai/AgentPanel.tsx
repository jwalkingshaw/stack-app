'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, History, MessageSquare, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { AgentPromptInput } from './AgentPromptInput';
import { AgentChangeCard } from './AgentChangeCard';
import { AgentApproveBar } from './AgentApproveBar';
import { AgentHistory } from './AgentHistory';
import type { StagedChange } from '@/lib/claude-agent';

// Stable QueryClient for the agent panel — created once at module level so it
// persists across renders and is not recreated on every open/close.
const agentQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelState =
  | 'idle'
  | 'thinking'
  | 'clarification_needed'
  | 'proposal'
  | 'approved'
  | 'rejected';

interface EnvelopeDetail {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  stagedChanges: StagedChange[];
  summary: string;
  clarificationNeeded?: string[];
  inputTokens?: number;
  outputTokens?: number;
}

interface AgentPanelProps {
  tenant: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional pre-filled prompt (e.g. from a contextual "Rewrite with AI" button) */
  initialPrompt?: string;
}

type Tab = 'chat' | 'history';

// ---------------------------------------------------------------------------
// AgentPanel
// ---------------------------------------------------------------------------

function AgentPanelInner({ tenant, open, onOpenChange, initialPrompt }: AgentPanelProps) {

  const [tab, setTab] = useState<Tab>('chat');
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);
  const [summary, setSummary] = useState('');
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [selectedChangeIds, setSelectedChangeIds] = useState<Set<string>>(new Set());
  const [isCommitting, setIsCommitting] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const statusBottomRef = useRef<HTMLDivElement | null>(null);

  // Keep initialPrompt in sync when the panel re-opens with a new context
  useEffect(() => {
    if (open && initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [open, initialPrompt]);

  // Reset to idle when panel closes
  useEffect(() => {
    if (!open) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    }
  }, [open]);

  // Auto-scroll status messages
  useEffect(() => {
    statusBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statusMessages]);

  // ---------------------------------------------------------------------------
  // Poll envelope status while pending
  // ---------------------------------------------------------------------------

  const { data: envelopeDetail } = useQuery<EnvelopeDetail>({
    queryKey: ['agent-envelope', envelopeId],
    queryFn: async () => {
      const res = await fetch(`/api/${tenant}/ai-agent/${envelopeId}`);
      if (!res.ok) throw new Error('Failed to fetch envelope');
      return res.json();
    },
    enabled: !!envelopeId && panelState === 'thinking',
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      if (data.status === 'pending' || data.status === 'approved') return false;
      return 2000;
    },
  });

  // When envelope transitions out of thinking, update state
  useEffect(() => {
    if (!envelopeDetail) return;
    const { status, stagedChanges: changes, summary: sum, clarificationNeeded } = envelopeDetail;

    if (clarificationNeeded && clarificationNeeded.length > 0) {
      setClarificationQuestions(clarificationNeeded);
      setPanelState('clarification_needed');
    } else if (status === 'pending' && changes && changes.length > 0) {
      setStagedChanges(changes);
      setSummary(sum || '');
      setPanelState('proposal');
    } else if (status === 'failed') {
      setPanelState('idle');
      toast.error('The agent encountered an error. Please try again.');
    }
  }, [envelopeDetail]);

  // ---------------------------------------------------------------------------
  // Start agent run via SSE
  // ---------------------------------------------------------------------------

  const startRun = useCallback(async (userPrompt: string) => {
    if (!userPrompt.trim()) return;

    // Reset state for new run
    setStatusMessages([]);
    setEnvelopeId(null);
    setStagedChanges([]);
    setSummary('');
    setClarificationQuestions([]);
    setSelectedChangeIds(new Set());
    setPanelState('thinking');

    eventSourceRef.current?.close();

    try {
      // Use fetch for POST + ReadableStream (EventSource only supports GET)
      const res = await fetch(`/api/${tenant}/ai-agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        if (res.status === 402) {
          toast.error(err.error || 'You have reached your Agent task limit.');
        } else if (res.status === 429) {
          toast.error(err.error || 'Too many requests. Please wait a moment.');
        } else {
          toast.error(err.error || 'Failed to start agent task.');
        }
        setPanelState('idle');
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const lines = part.split('\n');
          let eventType = 'message';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: ')) dataStr = line.slice(6);
          }

          if (!dataStr) continue;

          try {
            const payload = JSON.parse(dataStr);

            if (eventType === 'status') {
              setStatusMessages((prev) => [...prev, payload.message]);
            } else if (eventType === 'clarification') {
              setClarificationQuestions(payload.questions ?? []);
              setPanelState('clarification_needed');
              setEnvelopeId(payload.envelopeId ?? null);
              break;
            } else if (eventType === 'result') {
              setEnvelopeId(payload.envelopeId);
              // Fetch the full envelope via React Query
              agentQueryClient.invalidateQueries({ queryKey: ['agent-envelope', payload.envelopeId] });
            } else if (eventType === 'error') {
              toast.error(payload.message || 'Agent encountered an error.');
              setPanelState('idle');
            }
          } catch {
            // Ignore malformed SSE data
          }
        }
      }
    } catch {
      toast.error('Connection lost. Please try again.');
      setPanelState('idle');
    }
  }, [tenant]);

  const handleSubmit = useCallback(() => {
    if (prompt.trim()) {
      startRun(prompt);
      setPrompt('');
    }
  }, [prompt, startRun]);

  const handleClarificationSubmit = useCallback(() => {
    if (clarificationAnswer.trim()) {
      startRun(clarificationAnswer);
      setClarificationAnswer('');
    }
  }, [clarificationAnswer, startRun]);

  // ---------------------------------------------------------------------------
  // Approve / Reject
  // ---------------------------------------------------------------------------

  const handleApproveSelected = useCallback(async () => {
    if (!envelopeId || selectedChangeIds.size === 0) return;
    setIsCommitting(true);
    try {
      const res = await fetch(`/api/${tenant}/ai-agent/${envelopeId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change_ids: Array.from(selectedChangeIds) }),
      });
      if (!res.ok) throw new Error('Approval failed');
      setStagedChanges((prev) =>
        prev.map((c) => selectedChangeIds.has(c.id) ? { ...c, approved: true } : c)
      );
      setSelectedChangeIds(new Set());
      agentQueryClient.invalidateQueries({ queryKey: ['agent-history', tenant] });
      // If all changes resolved, transition to approved
      const remaining = stagedChanges.filter(
        (c) => c.approved === null && !selectedChangeIds.has(c.id)
      );
      if (remaining.length === 0) {
        setPanelState('approved');
      }
    } catch {
      toast.error('Failed to apply selected changes.');
    } finally {
      setIsCommitting(false);
    }
  }, [envelopeId, selectedChangeIds, stagedChanges, tenant]);

  const handleApproveAll = useCallback(async () => {
    if (!envelopeId) return;
    setIsCommitting(true);
    try {
      const res = await fetch(`/api/${tenant}/ai-agent/${envelopeId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Approval failed');
      setStagedChanges((prev) => prev.map((c) => ({ ...c, approved: c.approved ?? true })));
      setSelectedChangeIds(new Set());
      setPanelState('approved');
      agentQueryClient.invalidateQueries({ queryKey: ['agent-history', tenant] });
    } catch {
      toast.error('Failed to apply changes.');
    } finally {
      setIsCommitting(false);
    }
  }, [envelopeId, tenant]);

  const handleRejectAll = useCallback(async () => {
    if (!envelopeId) return;
    setIsCommitting(true);
    try {
      const res = await fetch(`/api/${tenant}/ai-agent/${envelopeId}/reject`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Rejection failed');
      setStagedChanges((prev) => prev.map((c) => ({ ...c, approved: c.approved ?? false })));
      setPanelState('rejected');
      agentQueryClient.invalidateQueries({ queryKey: ['agent-history', tenant] });
    } catch {
      toast.error('Failed to reject changes.');
    } finally {
      setIsCommitting(false);
    }
  }, [envelopeId, tenant]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedChangeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setPanelState('idle');
    setEnvelopeId(null);
    setStagedChanges([]);
    setSummary('');
    setStatusMessages([]);
    setSelectedChangeIds(new Set());
  }, []);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const pendingChanges = stagedChanges.filter((c) => c.approved === null);
  const pendingCount = pendingChanges.length;
  const selectedCount = Array.from(selectedChangeIds).filter((id) =>
    pendingChanges.some((c) => c.id === id)
  ).length;
  const isThinking = panelState === 'thinking';

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderHeader() {
    return (
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-accent-black)] text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-gray-900">AI Agent</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Tab switcher — only show when not mid-run */}
          {!isThinking && (
            <div className="mr-2 flex rounded-md border border-[var(--color-border)] bg-[var(--color-interactive-hover)] p-0.5">
              <button
                type="button"
                onClick={() => setTab('chat')}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  tab === 'chat'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-[var(--color-foreground-muted)] hover:text-gray-900',
                )}
              >
                <MessageSquare className="h-3 w-3" />
                Chat
              </button>
              <button
                type="button"
                onClick={() => setTab('history')}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  tab === 'history'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-[var(--color-foreground-muted)] hover:text-gray-900',
                )}
              >
                <History className="h-3 w-3" />
                History
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-foreground-muted)] hover:bg-[var(--color-interactive-hover)] hover:text-gray-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  function renderIdle() {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent-black)]/10">
            <Sparkles className="h-6 w-6 text-[var(--color-accent-black)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">What would you like to do?</p>
            <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">
              Describe a task and the Agent will plan, propose changes, and wait for your approval.
            </p>
          </div>
        </div>

        <AgentPromptInput
          value={prompt}
          onChange={setPrompt}
          onSubmit={handleSubmit}
          isLoading={false}
          showExamples
        />
      </div>
    );
  }

  function renderThinking() {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
          {/* User prompt bubble */}
          {prompt === '' && statusMessages.length > 0 && (
            <div className="mb-4 flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-[var(--color-accent-black)] px-3 py-2 text-sm text-white">
                {summary || 'Processing…'}
              </div>
            </div>
          )}

          {/* Status messages */}
          <div className="space-y-2">
            {statusMessages.map((msg, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                  {i === statusMessages.length - 1 ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent-black)]" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-foreground-subtle)]" />
                  )}
                </div>
                <p className="text-sm text-[var(--color-foreground-muted)]">{msg}</p>
              </div>
            ))}
            {statusMessages.length === 0 && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent-black)]" />
                <p className="text-sm text-[var(--color-foreground-muted)]">Starting…</p>
              </div>
            )}
          </div>
          <div ref={statusBottomRef} />
        </div>
      </div>
    );
  }

  function renderClarification() {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col px-4 py-4">
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Agent needs more information
            </p>
            <ul className="space-y-1">
              {clarificationQuestions.map((q, i) => (
                <li key={i} className="text-sm text-amber-900">
                  {clarificationQuestions.length > 1 && `${i + 1}. `}{q}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <AgentPromptInput
          value={clarificationAnswer}
          onChange={setClarificationAnswer}
          onSubmit={handleClarificationSubmit}
          isLoading={false}
          placeholder="Answer the question above…"
        />
      </div>
    );
  }

  function renderProposal() {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Summary */}
        {summary && (
          <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
            <p className="text-sm text-gray-700">{summary}</p>
          </div>
        )}

        {/* Change cards */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {stagedChanges.map((change, i) => (
            <AgentChangeCard
              key={change.id}
              change={change}
              index={i}
              total={stagedChanges.length}
              bulkMode
              selected={selectedChangeIds.has(change.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>

        {/* Approve bar */}
        {pendingCount > 0 && (
          <AgentApproveBar
            totalChanges={stagedChanges.length}
            selectedCount={selectedCount}
            pendingCount={pendingCount}
            isCommitting={isCommitting}
            onApproveSelected={handleApproveSelected}
            onApproveAll={handleApproveAll}
            onRejectAll={handleRejectAll}
          />
        )}

        {/* Follow-up prompt when all pending resolved */}
        {pendingCount === 0 && panelState === 'proposal' && (
          <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-3">
            <AgentPromptInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleSubmit}
              isLoading={false}
              placeholder="Ask a follow-up…"
            />
          </div>
        )}
      </div>
    );
  }

  function renderApproved() {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Changes applied</p>
            {summary && (
              <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">{summary}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} className="mt-2">
            Start a new task
          </Button>
        </div>
      </div>
    );
  }

  function renderRejected() {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <XCircle className="h-6 w-6 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">No changes made</p>
            <p className="mt-1 text-xs text-[var(--color-foreground-muted)]">
              All proposed changes were rejected.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} className="mt-2">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  function renderChatContent() {
    switch (panelState) {
      case 'idle':          return renderIdle();
      case 'thinking':      return renderThinking();
      case 'clarification_needed': return renderClarification();
      case 'proposal':      return renderProposal();
      case 'approved':      return renderApproved();
      case 'rejected':      return renderRejected();
    }
  }

  // ---------------------------------------------------------------------------
  // Root render
  // ---------------------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!isThinking && !isCommitting) onOpenChange(next); }}>
      <SheetContent
        side="right"
        size="panel"
        className="flex flex-col overflow-hidden p-0 max-w-xl"
      >
        <SheetTitle className="sr-only">AI Agent</SheetTitle>
        {renderHeader()}

        {tab === 'history' && !isThinking ? (
          <AgentHistory
            tenant={tenant}
            onSelectEnvelope={(id) => {
              setEnvelopeId(id);
              setTab('chat');
            }}
          />
        ) : (
          renderChatContent()
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Public export — wraps the inner component in its own QueryClientProvider
// so it works without a root provider in the component tree.
// ---------------------------------------------------------------------------

export function AgentPanel(props: AgentPanelProps) {
  return (
    <QueryClientProvider client={agentQueryClient}>
      <AgentPanelInner {...props} />
    </QueryClientProvider>
  );
}
