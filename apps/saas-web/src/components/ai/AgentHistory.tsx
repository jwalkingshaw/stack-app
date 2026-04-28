'use client';

import React from 'react';
import { Check, X, Clock, Loader2, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface HistoryEnvelope {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  taskType: string;
  summary?: string;
  stagedChanges: Array<{ approved: boolean | null }>;
  createdAt: string;
}

interface AgentHistoryProps {
  tenant: string;
  onSelectEnvelope?: (envelopeId: string) => void;
}

function StatusIcon({ status }: { status: HistoryEnvelope['status'] }) {
  switch (status) {
    case 'completed':
      return <Check className="h-3.5 w-3.5 text-green-600" />;
    case 'rejected':
      return <X className="h-3.5 w-3.5 text-gray-400" />;
    case 'failed':
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'pending':
      return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    default:
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent-black)]" />;
  }
}

function StatusLabel({ status }: { status: HistoryEnvelope['status'] }) {
  const labels: Record<string, string> = {
    completed: 'Applied',
    rejected: 'Rejected',
    failed: 'Failed',
    pending: 'Pending review',
    approved: 'Approved',
  };
  return <>{labels[status] ?? status}</>;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupByDate(envelopes: HistoryEnvelope[]): Record<string, HistoryEnvelope[]> {
  const groups: Record<string, HistoryEnvelope[]> = {};
  for (const env of envelopes) {
    const date = new Date(env.createdAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    const key = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(env);
  }
  return groups;
}

export function AgentHistory({ tenant, onSelectEnvelope }: AgentHistoryProps) {
  const { data, isLoading, isError } = useQuery<HistoryEnvelope[]>({
    queryKey: ['agent-history', tenant],
    queryFn: async () => {
      const res = await fetch(`/api/${tenant}/ai-agent`);
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-foreground-muted)]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center px-6">
        <AlertCircle className="h-8 w-8 text-[var(--color-foreground-subtle)]" />
        <p className="text-sm text-[var(--color-foreground-muted)]">Could not load history.</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center px-6">
        <Clock className="h-8 w-8 text-[var(--color-foreground-subtle)]" />
        <p className="text-sm font-medium text-gray-900">No tasks yet</p>
        <p className="text-xs text-[var(--color-foreground-muted)]">
          Your Agent task history will appear here.
        </p>
      </div>
    );
  }

  const groups = groupByDate(data);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {Object.entries(groups).map(([dateLabel, envelopes]) => (
        <div key={dateLabel}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-foreground-muted)]">
            {dateLabel}
          </p>
          <div className="space-y-1">
            {envelopes.map((env) => {
              const appliedCount = env.stagedChanges.filter((c) => c.approved === true).length;
              const totalCount = env.stagedChanges.length;

              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => onSelectEnvelope?.(env.id)}
                  className={cn(
                    'w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-left transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-interactive-hover)]',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-interactive-hover)]">
                      <StatusIcon status={env.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-gray-900">
                        {env.summary || 'Agent task'}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-foreground-muted)]">
                        <StatusLabel status={env.status} />
                        {totalCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{appliedCount}/{totalCount} changes</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{formatDate(env.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
