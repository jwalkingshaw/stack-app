'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PROFILE_TYPE_LABELS: Record<string, string> = {
  portal: 'Partner Portal',
  marketplace: 'Marketplace',
  retail: 'Retail',
  export: 'Export / File',
  api: 'API Integration',
};

type ReadinessMissing = {
  field_code: string;
  notes: string | null;
  kind?: 'field' | 'slot' | 'partner_document';
  label?: string;
};
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
  slot_summary?: {
    required: number;
    complete: number;
  };
  partner_document_summary?: {
    required: number;
    complete: number;
  };
};

interface ChannelReadinessSectionProps {
  tenantSlug: string;
  productId: string;
  selectedProfileId?: string | null;
  selectedProfileName?: string | null;
  marketId?: string | null;
  localeId?: string | null;
  channelId?: string | null;
  destinationId?: string | null;
  onMissingSelect?: (item: ReadinessMissing, profile: ProfileReadiness) => void;
}

function ProgressBar({ percent, isReady }: { percent: number; isReady: boolean }) {
  const color = isReady
    ? 'bg-emerald-500'
    : percent >= 70
      ? 'bg-amber-400'
      : 'bg-destructive/70';

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.max(2, percent)}%` }}
      />
    </div>
  );
}

function ProfileCard({
  profile,
  onMissingSelect,
}: {
  profile: ProfileReadiness;
  onMissingSelect?: (item: ReadinessMissing, profile: ProfileReadiness) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMissing = profile.missing.length > 0;
  const hasWarnings = profile.warnings.length > 0;
  const hasDetails = hasMissing || hasWarnings;

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {profile.is_ready ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span className="truncate text-sm font-medium text-foreground">
                {profile.profile_name}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {PROFILE_TYPE_LABELS[profile.profile_type] ?? profile.profile_type}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <ProgressBar percent={profile.percent} isReady={profile.is_ready} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {profile.total_required === 0
                    ? 'No required items'
                    : `${profile.complete_count} / ${profile.total_required} required items`}
                </span>
                <span className={profile.is_ready ? 'font-medium text-emerald-600' : 'font-medium'}>
                  {profile.percent}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {((profile.slot_summary?.required ?? 0) > 0 ||
          (profile.partner_document_summary?.required ?? 0) > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {(profile.slot_summary?.required ?? 0) > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5">
                Slots {profile.slot_summary?.complete ?? 0}/{profile.slot_summary?.required ?? 0}
              </span>
            )}
            {(profile.partner_document_summary?.required ?? 0) > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5">
                Partner docs {profile.partner_document_summary?.complete ?? 0}/{profile.partner_document_summary?.required ?? 0}
              </span>
            )}
          </div>
        )}

        {hasDetails && (
          <button
            onClick={() => setExpanded((value) => !value)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {hasMissing ? `${profile.missing.length} missing item${profile.missing.length === 1 ? '' : 's'}` : ''}
            {hasMissing && hasWarnings ? ' · ' : ''}
            {hasWarnings ? `${profile.warnings.length} warning${profile.warnings.length === 1 ? '' : 's'}` : ''}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="space-y-3 border-t border-border/60 bg-muted/20 px-4 py-3">
          {hasMissing && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground">Missing required items</p>
              <ul className="space-y-1">
                {profile.missing.map((missing) => (
                  <li key={`${missing.kind || 'field'}:${missing.field_code}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/60" />
                    {onMissingSelect ? (
                      <button
                        type="button"
                        onClick={() => onMissingSelect(missing, profile)}
                        className="text-left hover:text-foreground"
                      >
                        <code className="font-mono text-foreground">{missing.label || missing.field_code}</code>
                        {missing.kind ? (
                          <span className="ml-1 uppercase tracking-wide text-[10px]">
                            {missing.kind.replace('_', ' ')}
                          </span>
                        ) : null}
                        {missing.notes ? <span className="ml-1 text-muted-foreground">- {missing.notes}</span> : null}
                      </button>
                    ) : (
                      <span>
                        <code className="font-mono text-foreground">{missing.label || missing.field_code}</code>
                        {missing.kind ? (
                          <span className="ml-1 uppercase tracking-wide text-[10px]">
                            {missing.kind.replace('_', ' ')}
                          </span>
                        ) : null}
                        {missing.notes ? <span className="ml-1 text-muted-foreground">- {missing.notes}</span> : null}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasWarnings && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground">Warnings</p>
              <ul className="space-y-1">
                {profile.warnings.map((warning) => (
                  <li key={warning.field_code} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>
                      <code className="font-mono text-foreground">{warning.field_code}</code>
                      <span className="ml-1">- {warning.issue}</span>
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

export function ChannelReadinessSection({
  tenantSlug,
  productId,
  selectedProfileId = null,
  selectedProfileName = null,
  marketId = null,
  localeId = null,
  channelId = null,
  destinationId = null,
  onMissingSelect,
}: ChannelReadinessSectionProps) {
  const [profiles, setProfiles] = useState<ProfileReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (marketId) query.set("marketId", marketId);
      if (localeId) query.set("localeId", localeId);
      if (channelId) query.set("channelId", channelId);
      if (destinationId) query.set("destinationId", destinationId);
      const res = await fetch(
        query.toString()
          ? `/api/${tenantSlug}/products/${productId}/readiness?${query.toString()}`
          : `/api/${tenantSlug}/products/${productId}/readiness`
      );
      const payload = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { profiles: ProfileReadiness[] };
        error?: string;
      };
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
  }, [channelId, destinationId, localeId, marketId, productId, tenantSlug]);

  useEffect(() => {
    void fetchReadiness();
  }, [fetchReadiness]);

  const visibleProfiles = selectedProfileId
    ? profiles.filter((profile) => profile.profile_id === selectedProfileId)
    : profiles;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((value) => (
          <div key={value} className="h-20 animate-pulse rounded-lg border border-border/60 bg-card" />
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

  if (visibleProfiles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-6 py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Zap className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">
          {selectedProfileName ? `No readiness data for ${selectedProfileName}` : 'No destinations configured'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure destinations in Settings to track destination readiness.
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href={`/${tenantSlug}/settings/output-profiles`}>Configure destinations</a>
        </Button>
      </div>
    );
  }

  const readyCount = visibleProfiles.filter((profile) => profile.is_ready).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {readyCount} of {visibleProfiles.length} destination{visibleProfiles.length === 1 ? '' : 's'} ready
        </p>
        <button
          onClick={() => void fetchReadiness()}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {visibleProfiles.map((profile) => (
          <ProfileCard
            key={profile.profile_id}
            profile={profile}
            onMissingSelect={onMissingSelect}
          />
        ))}
      </div>
    </div>
  );
}
