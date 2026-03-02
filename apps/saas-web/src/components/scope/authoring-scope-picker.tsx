"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import { useMarketContext } from "@/components/market-context";

export type AuthoringScopeMode = "global" | "scoped";

export type AuthoringScopeValue = {
  mode: AuthoringScopeMode;
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
  destinationIds: string[];
};

export const createGlobalAuthoringScope = (): AuthoringScopeValue => ({
  mode: "global",
  marketIds: [],
  channelIds: [],
  localeIds: [],
  destinationIds: [],
});

export const normalizeAuthoringScope = (
  scope: Partial<AuthoringScopeValue> | null | undefined
): AuthoringScopeValue => {
  const next: AuthoringScopeValue = {
    mode: scope?.mode === "scoped" ? "scoped" : "global",
    marketIds: Array.from(new Set(Array.isArray(scope?.marketIds) ? scope!.marketIds : [])),
    channelIds: Array.from(new Set(Array.isArray(scope?.channelIds) ? scope!.channelIds : [])),
    localeIds: Array.from(new Set(Array.isArray(scope?.localeIds) ? scope!.localeIds : [])),
    destinationIds: Array.from(new Set(Array.isArray(scope?.destinationIds) ? scope!.destinationIds : [])),
  };

  if (next.mode === "global") {
    return createGlobalAuthoringScope();
  }

  return next;
};

type AuthoringScopePickerProps = {
  value: AuthoringScopeValue;
  onChange: (next: AuthoringScopeValue) => void;
  title?: string;
  description?: string;
  className?: string;
  showDestination?: boolean;
  showHeader?: boolean;
};

const pluralize = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

export function getAuthoringScopeSummary(scope: AuthoringScopeValue): string {
  const normalized = normalizeAuthoringScope(scope);
  if (normalized.mode === "global") {
    return "Global";
  }

  const parts: string[] = [];
  if (normalized.marketIds.length > 0) {
    parts.push(pluralize(normalized.marketIds.length, "market", "markets"));
  }
  if (normalized.channelIds.length > 0) {
    parts.push(pluralize(normalized.channelIds.length, "channel", "channels"));
  }
  if (normalized.localeIds.length > 0) {
    parts.push(pluralize(normalized.localeIds.length, "language", "languages"));
  }
  if (normalized.destinationIds.length > 0) {
    parts.push(pluralize(normalized.destinationIds.length, "destination", "destinations"));
  }

  return parts.length > 0 ? parts.join(" / ") : "Scoped";
}

export function AuthoringScopePicker({
  value,
  onChange,
  title = "Authoring scope",
  description = "Defines where newly created content should apply.",
  className,
  showDestination = true,
  showHeader = true,
}: AuthoringScopePickerProps) {
  const normalizedValue = normalizeAuthoringScope(value);
  const {
    markets,
    channels,
    locales,
    destinations,
    marketLocales,
    selectedMarketId,
    selectedChannelId,
    selectedLocaleId,
    selectedDestinationId,
  } = useMarketContext();

  const setMode = (mode: AuthoringScopeMode) => {
    if (mode === "global") {
      onChange(createGlobalAuthoringScope());
      return;
    }
    onChange({
      ...normalizedValue,
      mode: "scoped",
    });
  };

  const setScopedValues = (updates: Partial<AuthoringScopeValue>) => {
    onChange(
      normalizeAuthoringScope({
        ...normalizedValue,
        ...updates,
        mode: "scoped",
      })
    );
  };

  const applyCurrentContext = () => {
    const next = normalizeAuthoringScope({
      mode: "scoped",
      marketIds: selectedMarketId ? [selectedMarketId] : [],
      channelIds: selectedChannelId ? [selectedChannelId] : [],
      localeIds: selectedLocaleId ? [selectedLocaleId] : [],
      destinationIds: selectedDestinationId ? [selectedDestinationId] : [],
    });
    onChange(next);
  };

  const marketOptions = useMemo(
    () =>
      markets.map((market) => ({
        value: market.id,
        label: `${market.name} (${market.code})`,
      })),
    [markets]
  );

  const channelOptions = useMemo(
    () =>
      channels.map((channel) => ({
        value: channel.id,
        label: `${channel.name} (${channel.code})`,
      })),
    [channels]
  );

  const filteredLocaleOptions = useMemo(() => {
    if (normalizedValue.marketIds.length === 0) {
      return locales.map((locale) => ({
        value: locale.id,
        label: `${locale.name} (${locale.code})`,
      }));
    }

    const allowedLocaleIds = new Set(
      marketLocales
        .filter(
          (assignment) =>
            assignment.is_active !== false &&
            normalizedValue.marketIds.includes(assignment.market_id)
        )
        .map((assignment) => assignment.locale_id)
    );

    if (allowedLocaleIds.size === 0) {
      return locales.map((locale) => ({
        value: locale.id,
        label: `${locale.name} (${locale.code})`,
      }));
    }

    return locales
      .filter((locale) => allowedLocaleIds.has(locale.id))
      .map((locale) => ({
        value: locale.id,
        label: `${locale.name} (${locale.code})`,
      }));
  }, [locales, marketLocales, normalizedValue.marketIds]);

  const filteredDestinationOptions = useMemo(() => {
    return destinations
      .filter((destination) => {
        const matchesChannel =
          !destination.channel_id ||
          normalizedValue.channelIds.length === 0 ||
          normalizedValue.channelIds.includes(destination.channel_id);
        const matchesMarket =
          !destination.market_id ||
          normalizedValue.marketIds.length === 0 ||
          normalizedValue.marketIds.includes(destination.market_id);
        return matchesChannel && matchesMarket;
      })
      .map((destination) => ({
        value: destination.id,
        label: destination.name,
      }));
  }, [destinations, normalizedValue.channelIds, normalizedValue.marketIds]);

  const hasScopedDimensions =
    normalizedValue.marketIds.length > 0 ||
    normalizedValue.channelIds.length > 0 ||
    normalizedValue.localeIds.length > 0 ||
    normalizedValue.destinationIds.length > 0;

  const destinationNeedsChannelWarning =
    normalizedValue.destinationIds.length > 0 && normalizedValue.channelIds.length === 0;

  return (
    <div className={cn("space-y-3", className)}>
      {showHeader ? (
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={normalizedValue.mode === "global" ? "default" : "outline"}
          onClick={() => setMode("global")}
        >
          Global
        </Button>
        <Button
          type="button"
          size="sm"
          variant={normalizedValue.mode === "scoped" ? "default" : "outline"}
          onClick={() => setMode("scoped")}
        >
          Scoped
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={applyCurrentContext}>
            Use current context
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(createGlobalAuthoringScope())}
          >
            Clear
          </Button>
        </div>
      </div>

      {normalizedValue.mode === "scoped" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Markets</label>
            <MultiSelect
              options={marketOptions}
              value={normalizedValue.marketIds}
              onChange={(marketIds) => setScopedValues({ marketIds })}
              placeholder="Select one or more markets"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Channels</label>
            <MultiSelect
              options={channelOptions}
              value={normalizedValue.channelIds}
              onChange={(channelIds) => setScopedValues({ channelIds })}
              placeholder="Select one or more channels"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Languages</label>
            <MultiSelect
              options={filteredLocaleOptions}
              value={normalizedValue.localeIds}
              onChange={(localeIds) => setScopedValues({ localeIds })}
              placeholder="Select one or more languages"
            />
          </div>
          {showDestination ? (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Destinations</label>
              <MultiSelect
                options={filteredDestinationOptions}
                value={normalizedValue.destinationIds}
                onChange={(destinationIds) => setScopedValues({ destinationIds })}
                placeholder="Select one or more destinations"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Global means this content is not limited to a specific market, channel, language, or destination.
        </p>
      )}

      {normalizedValue.mode === "scoped" && !hasScopedDimensions ? (
        <p className="text-xs text-amber-700">
          Select at least one scope dimension or switch back to global.
        </p>
      ) : null}

      {normalizedValue.mode === "scoped" && destinationNeedsChannelWarning ? (
        <p className="text-xs text-amber-700">
          Destination scope usually pairs with channel scope for downstream publishing consistency.
        </p>
      ) : null}
    </div>
  );
}
