'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/ui/loading-spinner';
import { SettingsPageContent } from './settings-page-content';
import { CreateMarketDialog } from './markets/CreateMarketDialog';
import { ManageMarketDialog } from './markets/ManageMarketDialog';
import { MarketsTable } from './markets/MarketsTable';
import { toMap } from './markets/types';
import { useMarketsSettingsData } from './markets/use-markets-settings-data';

interface MarketsSettingsProps {
  tenantSlug: string;
}

export default function MarketsSettings({ tenantSlug }: MarketsSettingsProps) {
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [manageMarketId, setManageMarketId] = useState<string | null>(null);

  const {
    loading,
    saving,
    error,
    setError,
    runAction,
    patchMarket,
    createMarket,
    assignCountry,
    unassignCountry,
    assignLocale,
    unassignLocale,
    createLocale,
    markets,
    locales,
    marketLocales,
    marketCountries,
    countries,
    currencies,
    timezones,
    localeCatalog,
  } = useMarketsSettingsData(tenantSlug);

  const localeById = useMemo(() => toMap(locales, 'id'), [locales]);
  const localeByCode = useMemo(
    () => new Map(locales.map((locale) => [locale.code.toLowerCase(), locale])),
    [locales]
  );
  const countryByCode = useMemo(() => toMap(countries, 'code'), [countries]);
  const localeCatalogByCode = useMemo(
    () => new Map(localeCatalog.map((entry) => [entry.code.toLowerCase(), entry])),
    [localeCatalog]
  );
  const marketById = useMemo(() => toMap(markets, 'id'), [markets]);
  const activeLocales = useMemo(() => locales.filter((row) => row.is_active), [locales]);
  const manageMarket = manageMarketId ? marketById.get(manageMarketId) || null : null;

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

  const manageLocaleIds = manageMarketId ? activeLocaleIdsByMarket.get(manageMarketId) || [] : [];
  const manageCountryCodes = manageMarketId ? activeCountryCodesByMarket.get(manageMarketId) || [] : [];
  const manageAvailableCountries = useMemo(() => {
    const used = new Set(manageCountryCodes);
    return countries.filter((country) => !used.has(country.code));
  }, [countries, manageCountryCodes]);
  const manageAvailableLocales = useMemo(() => {
    const assignedCodes = new Set(
      manageLocaleIds
        .map((localeId) => localeById.get(localeId)?.code?.toLowerCase())
        .filter((code): code is string => Boolean(code))
    );
    return localeCatalog.filter((entry) => !assignedCodes.has(entry.code.toLowerCase()));
  }, [localeCatalog, localeById, manageLocaleIds]);

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
  }, [activeCountryCodesByMarket, activeLocaleIdsByMarket, countryByCode, countries, localeById, locales, markets, search]);

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageLoader text="Loading markets..." size="lg" />
      </div>
    );
  }

  const ensureLocaleByCode = async (localeCode: string) => {
    const normalizedCode = localeCode.trim().toLowerCase();
    const existing = localeByCode.get(normalizedCode);
    if (existing) {
      if (!existing.is_active) {
        throw new Error(`Language ${existing.code} exists but is inactive. Please reactivate it first.`);
      }
      return existing;
    }

    const catalogEntry = localeCatalogByCode.get(normalizedCode);
    const localeName = catalogEntry?.name || localeCode;
    const created = await createLocale(localeName, localeCode);
    return created;
  };

  return (
    <>
      <SettingsPageContent page="markets">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Markets</h1>
          <p className="text-sm text-muted-foreground">
            Reference data comes from API and market writes are server-validated.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="space-y-4 rounded-lg border border-border/60 bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search markets..."
              className="max-w-sm"
            />
            <Button
              variant="accent-blue"
              className="gap-2"
              onClick={() => {
                setError(null);
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Market
            </Button>
          </div>

          <MarketsTable
            markets={filteredMarkets}
            saving={saving}
            localeById={localeById}
            activeLocaleIdsByMarket={activeLocaleIdsByMarket}
            activeCountryCodesByMarket={activeCountryCodesByMarket}
            onSetDefaultMarket={(marketId) =>
              runAction(() => patchMarket(marketId, { is_default: true }), 'Failed to set default market.')
            }
            onToggleMarketActive={(marketId, isActive) =>
              runAction(
                () => patchMarket(marketId, { is_active: !isActive }),
                'Failed to update market status.'
              )
            }
            onManageMarket={setManageMarketId}
          />
        </section>
      </SettingsPageContent>

      <CreateMarketDialog
        open={showCreateDialog}
        saving={saving}
        countries={countries}
        localeCatalog={localeCatalog}
        currencies={currencies}
        timezones={timezones}
        onOpenChange={(open) => {
          if (!open && !saving) setShowCreateDialog(false);
        }}
        onCreate={(draft) =>
          runAction(async () => {
            const localeIds: string[] = [];
            for (const localeCode of draft.locale_codes) {
              const locale = await ensureLocaleByCode(localeCode);
              if (!localeIds.includes(locale.id)) {
                localeIds.push(locale.id);
              }
            }

            const defaultLocale = await ensureLocaleByCode(draft.default_locale_code);
            if (!localeIds.includes(defaultLocale.id)) {
              localeIds.push(defaultLocale.id);
            }

            await createMarket({
              name: draft.name,
              code: draft.code,
              country_codes: draft.country_codes,
              locale_ids: localeIds,
              default_locale_id: defaultLocale.id,
              currency_code: draft.currency_code ?? null,
              timezone: draft.timezone ?? null,
            });
            setShowCreateDialog(false);
          }, 'Failed to create market.')
        }
      />

      <ManageMarketDialog
        open={Boolean(manageMarketId)}
        saving={saving}
        market={manageMarket}
        localeById={localeById}
        countryByCode={countryByCode}
        activeLocaleIds={manageLocaleIds}
        activeCountryCodes={manageCountryCodes}
        availableLocaleCatalog={manageAvailableLocales}
        availableCountries={manageAvailableCountries}
        onOpenChange={(open) => {
          if (!open && !saving) setManageMarketId(null);
        }}
        onAssignCountry={(countryCode) =>
          manageMarket &&
          runAction(
            () => assignCountry(manageMarket.id, countryCode),
            'Failed to assign country.'
          )
        }
        onUnassignCountry={(countryCode) =>
          manageMarket &&
          runAction(
            () => unassignCountry(manageMarket.id, countryCode),
            'Failed to unassign country.'
          )
        }
        onAssignLocaleCode={(localeCode) =>
          manageMarket &&
          runAction(
            async () => {
              const locale = await ensureLocaleByCode(localeCode);
              await assignLocale(manageMarket.id, locale.id);
            },
            'Failed to assign language.'
          )
        }
        onUnassignLocale={(localeId) =>
          manageMarket &&
          runAction(
            () => unassignLocale(manageMarket.id, localeId),
            'Failed to unassign language.'
          )
        }
        onSetDefaultLocale={(localeId) =>
          manageMarket &&
          runAction(
            () => patchMarket(manageMarket.id, { default_locale_id: localeId }),
            'Failed to set default language.'
          )
        }
        onCreateLocaleAndAssign={(name, code) =>
          manageMarket &&
          runAction(async () => {
            const created = await createLocale(name, code);
            await assignLocale(manageMarket.id, created.id);
          }, 'Failed to create language.')
        }
      />
    </>
  );
}
