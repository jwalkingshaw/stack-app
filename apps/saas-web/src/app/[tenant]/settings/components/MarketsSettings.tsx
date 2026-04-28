'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { SettingsPageContent } from './settings-page-content';
import { CreateMarketDialog } from './markets/CreateMarketDialog';
import { MarketsTable } from './markets/MarketsTable';
import { toMap } from './markets/types';
import { useMarketsSettingsData } from './markets/use-markets-settings-data';

interface MarketsSettingsProps {
  tenantSlug: string;
}

export default function MarketsSettings({ tenantSlug }: MarketsSettingsProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const {
    loading,
    referenceLoading,
    referenceReady,
    saving,
    error,
    setError,
    ensureReferenceData,
    runAction,
    createMarket,
    markets,
    locales,
    marketLocales,
    marketCountries,
    countries,
    currencies,
    timezones,
  } = useMarketsSettingsData(tenantSlug);

  const localeById = useMemo(() => toMap(locales, 'id'), [locales]);
  const countryByCode = useMemo(() => toMap(countries, 'code'), [countries]);
  const activeLocales = useMemo(() => locales.filter((locale) => locale.is_active), [locales]);

  const activeLocaleIdsByMarket = useMemo(() => {
    const out = new Map<string, string[]>();
    marketLocales.forEach((row) => {
      if (!row.is_active) return;
      const list = out.get(row.market_id) || [];
      list.push(row.locale_id);
      out.set(row.market_id, list);
    });
    return out;
  }, [marketLocales]);

  const activeCountryCodesByMarket = useMemo(() => {
    const out = new Map<string, string[]>();
    marketCountries.forEach((row) => {
      if (!row.is_active) return;
      const list = out.get(row.market_id) || [];
      list.push(row.country_code);
      out.set(row.market_id, list);
    });
    return out;
  }, [marketCountries]);

  const filteredMarkets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((market) => {
      if (`${market.name} ${market.code}`.toLowerCase().includes(q)) return true;
      const localeMatch = (activeLocaleIdsByMarket.get(market.id) || [])
        .map((id) => localeById.get(id))
        .filter((row): row is (typeof locales)[number] => Boolean(row))
        .some((row) => `${row.name} ${row.code}`.toLowerCase().includes(q));
      if (localeMatch) return true;
      return (activeCountryCodesByMarket.get(market.id) || [])
        .map((code) => countryByCode.get(code))
        .filter((row): row is (typeof countries)[number] => Boolean(row))
        .some((row) => `${row.name} ${row.code}`.toLowerCase().includes(q));
    });
  }, [activeCountryCodesByMarket, activeLocaleIdsByMarket, countryByCode, localeById, markets, search]);

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading markets..." size="lg" />
      </div>
    );
  }

  return (
    <>
      <SettingsPageContent page="markets">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Markets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional operational markets for partner access, routing, and future catalog logic. Product content is authored by locale.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search markets..."
              className="max-w-sm"
            />
          </div>

          <MarketsTable
            markets={filteredMarkets}
            localeById={localeById}
            activeLocaleIdsByMarket={activeLocaleIdsByMarket}
            activeCountryCodesByMarket={activeCountryCodesByMarket}
            onAddMarket={() => {
              setError(null);
              void ensureReferenceData();
              setShowCreateDialog(true);
            }}
            onManageMarket={(nextMarketId) => {
              router.push(`/${tenantSlug}/settings/markets/${nextMarketId}`);
            }}
          />
        </div>
      </SettingsPageContent>

      <CreateMarketDialog
        open={showCreateDialog}
        saving={saving}
        referenceLoading={referenceLoading}
        referenceReady={referenceReady}
        countries={countries}
        locales={activeLocales}
        currencies={currencies}
        timezones={timezones}
        onOpenChange={(open) => {
          if (!open && !saving) setShowCreateDialog(false);
        }}
        onCreate={(draft) =>
          runAction(async () => {
            await createMarket({
              name: draft.name,
              code: draft.code,
              country_codes: draft.country_codes,
              locale_ids: draft.locale_ids,
              default_locale_id: draft.default_locale_id,
              currency_code: draft.currency_code ?? null,
              timezone: draft.timezone ?? null,
            });
            setShowCreateDialog(false);
          }, 'Failed to create market.')
        }
      />
    </>
  );
}

