'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PROFILE_TYPE_LABELS: Record<string, string> = {
  portal:      'Partner Portal',
  marketplace: 'Marketplace',
  retail:      'Retail',
  export:      'Export / File',
  api:         'API Integration',
};

type ReadinessMissing = { field_code: string; notes: string | null };
type ReadinessWarning = { field_code: string; issue: string };

type ProfileReadiness = {
  profile_id: string;
  profile_name: string;
  profile_code: string;
  profile_type: string;
  total_required: number;
  complete_count: number;
  percent: number;
  is_ready: boolean;
  missing: ReadinessMissing[];
  warnings: ReadinessWarning[];
};

interface ChannelReadinessSectionProps {
  tenantSlug: string;
  productId: string;
}

function ProgressBar({ percent, isReady }: { percent: number; isReady: boolean }) {
  const color = isReady
    ? 'bg-emerald-500'
    : percent >= 70
    ? 'bg-amber-400'
    : 'bg-destructive/70';

  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.max(2, percent)}%` }}
      />
    </div>
  );
}

function ProfileCard({ profile }: { profile: ProfileReadiness }) {
  const [expanded, setExpanded] = useState(false);
  const hasMissing = profile.missing.length > 0;
  const hasWarnings = profile.warnings.length > 0;
  const hasDetails = hasMissing || hasWarnings;

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {profile.is_ready ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span className="text-sm font-medium text-foreground truncate">
                {profile.profile_name}
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {PROFILE_TYPE_LABELS[profile.profile_type] ?? profile.profile_type}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <ProgressBar percent={profile.percent} isReady={profile.is_ready} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {profile.total_required === 0
                    ? 'No required fields'
                    : `${profile.complete_count} / ${profile.total_required} required fields`}
                </span>
                <span className={profile.is_ready ? 'text-emerald-600 font-medium' : 'font-medium'}>
                  {profile.percent}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {hasDetails && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {hasMissing ? `${profile.missing.length} missing field${profile.missing.length === 1 ? '' : 's'}` : ''}
            {hasMissing && hasWarnings ? ' · ' : ''}
            {hasWarnings ? `${profile.warnings.length} warning${profile.warnings.length === 1 ? '' : 's'}` : ''}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="border-t border-gray-200 bg-muted/20 px-4 py-3 space-y-3">
          {hasMissing && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1.5">Missing required fields</p>
              <ul className="space-y-1">
                {profile.missing.map((m) => (
                  <li key={m.field_code} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/60" />
                    <span>
                      <code className="font-mono text-foreground">{m.field_code}</code>
                      {m.notes ? <span className="ml-1 text-muted-foreground">— {m.notes}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasWarnings && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1.5">Warnings</p>
              <ul className="space-y-1">
                {profile.warnings.map((w) => (
                  <li key={w.field_code} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>
                      <code className="font-mono text-foreground">{w.field_code}</code>
                      <span className="ml-1">— {w.issue}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChannelReadinessSection({ tenantSlug, productId }: ChannelReadinessSectionProps) {
  const [profiles, setProfiles] = useState<ProfileReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${tenantSlug}/products/${productId}/readiness`);
      const payload = await res.json().catch(() => ({})) as { success?: boolean; data?: { profiles: ProfileReadiness[] }; error?: string };
      if (!res.ok) {
        setError(payload.error ?? 'Failed to load readiness data');
        return;
      }
      setProfiles(payload.data?.profiles ?? []);
    } catch {
      setError('Failed to load readiness data');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, productId]);

  useEffect(() => {
    void fetchReadiness();
  }, [fetchReadiness]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg border border-border/60 bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-6 py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Zap className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No channels configured</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add channels in Settings → Channels to track channel readiness.
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href={`/${tenantSlug}/settings/output-profiles`}>Configure channels</a>
        </Button>
      </div>
    );
  }

  const readyCount = profiles.filter((p) => p.is_ready).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {readyCount} of {profiles.length} profile{profiles.length === 1 ? '' : 's'} ready
        </p>
        <button
          onClick={() => void fetchReadiness()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {profiles.map((profile) => (
          <ProfileCard key={profile.profile_id} profile={profile} />
        ))}
      </div>
    </div>
  );
}
