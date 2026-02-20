'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/loading-spinner';
import { Globe, Plus, X } from 'lucide-react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MarketsSettingsProps {
  tenantSlug: string;
}

interface Locale {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface Market {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_default?: boolean;
  currency_code?: string | null;
  timezone?: string | null;
  default_locale_id?: string | null;
}

interface MarketLocaleAssignment {
  id: string;
  market_id: string;
  locale_id: string;
  is_active: boolean;
}

interface Country {
  code: string;
  name: string;
}

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'UTC', label: 'UTC' }
];

const TIMEZONE_LABELS: Record<string, string> = {
  'America/New_York': 'ET',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Los_Angeles': 'PT',
  UTC: 'UTC'
};

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'MXN', label: 'MXN - Mexican Peso' },
  { value: 'BRL', label: 'BRL - Brazilian Real' }
];

export default function MarketsSettings({ tenantSlug }: MarketsSettingsProps) {
  const [locales, setLocales] = useState<Locale[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketAssignments, setMarketAssignments] = useState<MarketLocaleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manageMarketId, setManageMarketId] = useState<string | null>(null);
  const [marketSearch, setMarketSearch] = useState('');
  const [showCreateMarket, setShowCreateMarket] = useState(false);
  const [selectedLanguageCodes, setSelectedLanguageCodes] = useState<string[]>([]);
  const [defaultLanguageCode, setDefaultLanguageCode] = useState('');
  const [marketCurrency, setMarketCurrency] = useState('');
  const [marketTimezone, setMarketTimezone] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [countryLocaleOptions, setCountryLocaleOptions] = useState<Array<{ code: string; name: string; isPrimary: boolean }>>([]);

  const [manageMarketLocaleOptions, setManageMarketLocaleOptions] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [manageAddLanguageCode, setManageAddLanguageCode] = useState<Record<string, string>>({});

  const assignmentIndex = useMemo(() => {
    const map = new Map<string, MarketLocaleAssignment>();
    marketAssignments.forEach((assignment) => {
      map.set(`${assignment.market_id}:${assignment.locale_id}`, assignment);
    });
    return map;
  }, [marketAssignments]);

  const marketById = useMemo(() => {
    const map = new Map<string, Market>();
    markets.forEach((market) => {
      map.set(market.id, market);
    });
    return map;
  }, [markets]);

  const localeById = useMemo(() => {
    const map = new Map<string, Locale>();
    locales.forEach((locale) => {
      map.set(locale.id, locale);
    });
    return map;
  }, [locales]);

  const marketLocaleSearchIndex = useMemo(() => {
    const map = new Map<string, string[]>();
    marketAssignments.forEach((assignment) => {
      const locale = localeById.get(assignment.locale_id);
      if (!locale) return;
      const entry = `${locale.name} ${locale.code}`.toLowerCase();
      const existing = map.get(assignment.market_id);
      if (existing) {
        existing.push(entry);
      } else {
        map.set(assignment.market_id, [entry]);
      }
    });
    return map;
  }, [marketAssignments, localeById]);

  const activeLocalesByMarket = useMemo(() => {
    const map = new Map<string, Locale[]>();
    marketAssignments.forEach((assignment) => {
      if (!assignment.is_active) return;
      const locale = localeById.get(assignment.locale_id);
      if (!locale) return;
      const existing = map.get(assignment.market_id);
      if (existing) {
        existing.push(locale);
      } else {
        map.set(assignment.market_id, [locale]);
      }
    });
    return map;
  }, [marketAssignments, localeById]);

  const activeLocaleCountsByMarket = useMemo(() => {
    const counts = new Map<string, number>();
    activeLocalesByMarket.forEach((list, marketId) => {
      counts.set(marketId, list.length);
    });
    return counts;
  }, [activeLocalesByMarket]);

  const filteredMarkets = useMemo(() => {
    const query = marketSearch.trim().toLowerCase();
    if (!query) return markets;
    return markets.filter((market) => {
      const marketMatch = `${market.name} ${market.code}`.toLowerCase().includes(query);
      if (marketMatch) return true;
      const localeEntries = marketLocaleSearchIndex.get(market.id);
      if (!localeEntries) return false;
      return localeEntries.some((entry) => entry.includes(query));
    });
  }, [marketSearch, marketLocaleSearchIndex, markets]);

  const getManageLocaleOptions = (marketId: string) => {
    const options = manageMarketLocaleOptions[marketId] || [];
    if (options.length > 0) return options;
    return locales.map((locale) => ({ code: locale.code, name: locale.name }));
  };

  const languageOptions = useMemo(() => {
    if (countryLocaleOptions.length === 0) {
      return [];
    }

    const list = countryLocaleOptions.map((option) => ({
      code: option.code,
      name: option.name,
      isPrimary: option.isPrimary
    }));
    return list.sort((a, b) => {
      if (a.isPrimary === b.isPrimary) {
        return a.name.localeCompare(b.name);
      }
      return a.isPrimary ? -1 : 1;
    });
  }, [countryLocaleOptions]);

  const manageMarket = manageMarketId ? marketById.get(manageMarketId) : null;

  const fetchAll = async () => {
    try {
      setLoading(true);
      setError(null);

      const [localesRes, marketsRes, assignmentsRes, countriesRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/locales`),
        fetch(`/api/${tenantSlug}/markets`),
        fetch(`/api/${tenantSlug}/market-locales`),
        fetch(`/api/${tenantSlug}/countries`)
      ]);

      if (!localesRes.ok || !marketsRes.ok || !assignmentsRes.ok || !countriesRes.ok) {
        throw new Error('Failed to fetch markets data');
      }

      const [localesData, marketsData, assignmentsData, countriesData] = await Promise.all([
        localesRes.json(),
        marketsRes.json(),
        assignmentsRes.json(),
        countriesRes.json()
      ]);

      setLocales(localesData || []);
      setMarkets(marketsData || []);
      setMarketAssignments(assignmentsData || []);
      setCountries(countriesData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [tenantSlug]);

  useEffect(() => {
    const fetchCountryLocales = async () => {
      if (!selectedCountryCode) {
        setCountryLocaleOptions([]);
        return;
      }
      try {
        const response = await fetch(`/api/${tenantSlug}/country-locales?country=${selectedCountryCode}`);
        if (!response.ok) {
          setCountryLocaleOptions([]);
          return;
        }
        const data = await response.json();
        const mapped = (data || []).map((item: any) => ({
          code: item.locale_code,
          name: item.locale_name,
          isPrimary: Boolean(item.is_primary)
        }));
        setCountryLocaleOptions(mapped);
      } catch {
        setCountryLocaleOptions([]);
      }
    };

    fetchCountryLocales();
  }, [selectedCountryCode, tenantSlug]);

  useEffect(() => {
    if (!selectedCountryCode) {
      setSelectedLanguageCodes([]);
      setDefaultLanguageCode('');
      setMarketCurrency('');
      setMarketTimezone('');
    } else {
      setSelectedLanguageCodes([]);
    }
  }, [selectedCountryCode]);

  useEffect(() => {
    const fetchManageLocales = async () => {
      if (!manageMarketId) return;
      if (manageMarketLocaleOptions[manageMarketId]) return;
      const market = marketById.get(manageMarketId);
      if (!market?.code) return;

      try {
        const response = await fetch(`/api/${tenantSlug}/country-locales?country=${market.code}`);
        if (!response.ok) return;
        const data = await response.json();
        const mapped = (data || []).map((item: any) => ({
          code: item.locale_code,
          name: item.locale_name
        }));
        setManageMarketLocaleOptions((prev) => ({
          ...prev,
          [manageMarketId]: mapped
        }));
      } catch {
        // Ignore suggested locale fetch errors in the UI.
      }
    };

    fetchManageLocales();
  }, [manageMarketId, manageMarketLocaleOptions, marketById, tenantSlug]);

  useEffect(() => {
    if (countryLocaleOptions.length === 0) {
      setDefaultLanguageCode('');
      return;
    }

    const primary = countryLocaleOptions.find((option) => option.isPrimary);
    if (primary) {
      setDefaultLanguageCode(primary.code);
      setSelectedLanguageCodes((prev) =>
        prev.includes(primary.code) ? prev : [...prev, primary.code]
      );
    }
  }, [countryLocaleOptions]);

  const handleCreateMarket = async () => {
    if (!selectedCountryCode) {
      setError('Select a country to create a market.');
      return;
    }
    if (!marketCurrency || !marketTimezone) {
      setError('Select both a currency and timezone.');
      return;
    }

    const selectedCountry = countries.find((country) => country.code === selectedCountryCode);
    const name = selectedCountry?.name || '';
    if (!name) {
      setError('Selected country not found.');
      return;
    }

    const code = selectedCountryCode;
    const existingMarket = markets.find(
      (market) => market.code.toUpperCase() === code.toUpperCase()
    );
    if (existingMarket) {
      setError('A market already exists for this country.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/${tenantSlug}/markets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          currency_code: marketCurrency,
          timezone: marketTimezone
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create market');
      }

      const createdMarket = await response.json();

      const languagesToAssign = Array.from(
        new Set([
          ...selectedLanguageCodes,
          ...(defaultLanguageCode ? [defaultLanguageCode] : [])
        ])
      );

      let defaultLocaleId: string | null = null;

      if (languagesToAssign.length > 0) {
        for (const languageCode of languagesToAssign) {
          const option = languageOptions.find((item) => item.code === languageCode);
          const localeName = option?.name || languageCode;
          const locale = await ensureLocale(localeName, languageCode);
          await assignLocaleToMarket(createdMarket.id, locale.id);
          if (languageCode === defaultLanguageCode) {
            defaultLocaleId = locale.id;
          }
        }
      }

      if (defaultLocaleId) {
        await fetch(`/api/${tenantSlug}/markets/${createdMarket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ default_locale_id: defaultLocaleId })
        });
      }

      setSelectedCountryCode('');
      setCountryLocaleOptions([]);
      setSelectedLanguageCodes([]);
      setDefaultLanguageCode('');
      setMarketCurrency('');
      setMarketTimezone('');
      setError(null);
      await fetchAll();
      setShowCreateMarket(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market');
    } finally {
      setSaving(false);
    }
  };

  const ensureLocale = async (name: string, code: string) => {
    const normalizedCode = code.trim();
    const existing = locales.find((locale) => locale.code.toLowerCase() === normalizedCode.toLowerCase());
    if (existing) return existing;

    const response = await fetch(`/api/${tenantSlug}/locales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code: normalizedCode })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create locale');
    }

    return response.json();
  };

  const handleToggleActive = async (
    type: 'markets',
    id: string,
    isActive: boolean
  ) => {
    try {
      setSaving(true);
      const response = await fetch(`/api/${tenantSlug}/${type}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update status');
      }

      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAssignment = async (marketId: string, localeId: string, isActive: boolean) => {
    try {
      setSaving(true);
      const response = await fetch(`/api/${tenantSlug}/market-locales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_id: marketId, locale_id: localeId, is_active: !isActive })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update assignment');
      }

      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignment');
    } finally {
      setSaving(false);
    }
  };

  const assignLocaleToMarket = async (marketId: string, localeId: string) => {
    const response = await fetch(`/api/${tenantSlug}/market-locales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market_id: marketId, locale_id: localeId, is_active: true })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to assign language');
    }
  };

  const handleAddLocaleToMarket = async (marketId: string, code: string) => {
    const option = getManageLocaleOptions(marketId).find(
      (item) => item.code.toLowerCase() === code.toLowerCase()
    );
    if (!option) return;

    try {
      setSaving(true);
      const locale = await ensureLocale(option.name, option.code);
      const assignment = assignmentIndex.get(`${marketId}:${locale.id}`);
      const isActive = assignment?.is_active ?? false;
      if (!isActive) {
        await handleToggleAssignment(marketId, locale.id, isActive);
      }
      setManageAddLanguageCode((prev) => ({ ...prev, [marketId]: '' }));
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add language');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultMarket = async (marketId: string) => {
    try {
      setSaving(true);
      const response = await fetch(`/api/${tenantSlug}/markets/${marketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set default market');
      }

      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default market');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMarketSettings = async (
    marketId: string,
    updates: { default_locale_id?: string | null; currency_code?: string | null; timezone?: string | null }
  ) => {
    try {
      setSaving(true);
      const response = await fetch(`/api/${tenantSlug}/markets/${marketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update market');
      }

      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update market');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-10 px-8 py-8">
      <div className="w-full space-y-10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Markets</h1>
          <p className="text-sm text-muted-foreground">
            Define markets (countries) and the languages available in each market.
          </p>
        </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            placeholder="Search markets..."
            value={marketSearch}
            onChange={(e) => setMarketSearch(e.target.value)}
            className="max-w-[260px]"
          />
          <Button
            variant="accent-blue"
            onClick={() => setShowCreateMarket(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Market
          </Button>
        </div>
      </div>

      <section className="space-y-4 rounded-lg border border-border/60 bg-card p-6">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Market Languages</h2>
          <p className="text-sm text-muted-foreground">
            Add and assign languages for each market.
          </p>
        </header>

        <div className="space-y-3">
          {markets.length === 0 && (
            <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Add a market above to start assigning languages.
            </div>
          )}
          {markets.length > 0 && filteredMarkets.length === 0 && (
            <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              No markets match your search.
            </div>
          )}
          {filteredMarkets.map((market) => {
            const activeLocales = activeLocalesByMarket.get(market.id) || [];
            const activeCount = activeLocaleCountsByMarket.get(market.id) || 0;
            const visibleLocales = activeLocales.slice(0, 4);
            const remainingCount = activeLocales.length - visibleLocales.length;
            const defaultLocale = market.default_locale_id
              ? localeById.get(market.default_locale_id)
              : null;

            return (
              <div key={market.id} className="rounded-md border border-border/60 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-foreground">{market.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {market.timezone && (
                          <span>
                            Timezone: {TIMEZONE_LABELS[market.timezone] || market.timezone}
                          </span>
                        )}
                        {market.timezone && market.currency_code && <span className="px-1">•</span>}
                        {market.currency_code && <span>Currency: {market.currency_code}</span>}
                        {(market.timezone || market.currency_code) && (
                          <span className="px-1">•</span>
                        )}
                        <span>
                          Languages:{' '}
                          {activeLocales.length > 0
                            ? activeLocales
                                .map((locale) =>
                                  locale.name.replace(/\s*\(.+\)/, '')
                                )
                                .join(', ')
                            : 'None'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {visibleLocales.length === 0 && (
                        <span className="text-xs text-muted-foreground">No languages assigned</span>
                      )}
                      {visibleLocales.map((locale) => (
                        <Badge key={locale.id} variant="secondary">
                          {locale.code}
                        </Badge>
                      ))}
                      {remainingCount > 0 && (
                        <Badge variant="outline">+{remainingCount} more</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {market.is_default && <Badge variant="secondary">Default</Badge>}
                    <Badge variant="secondary">{activeCount} languages</Badge>
                    {!market.is_default && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSetDefaultMarket(market.id)}
                        disabled={saving}
                      >
                        Set as default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setManageMarketId(market.id)}
                    >
                      Manage market
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      </div>
        <DialogPrimitive.Root
          open={Boolean(manageMarketId)}
          onOpenChange={(open) => {
            if (open) {
              setError(null);
              return;
            }
            setManageMarketId(null);
            setManageAddLanguageCode((prev) => ({
              ...prev,
              ...(manageMarketId ? { [manageMarketId]: '' } : {})
            }));
          }}
        >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-white/80 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed inset-0 z-50 bg-white">
            {manageMarket && (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-border p-6">
                  <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-semibold">
                    <Globe className="h-5 w-5" />
                    Manage languages
                  </DialogPrimitive.Title>
                  <button
                    onClick={() => setManageMarketId(null)}
                    disabled={saving}
                    className="rounded-md p-1.5 transition-colors hover:bg-muted"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <div className="w-full max-w-5xl space-y-6">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">{manageMarket.name}</div>
                    <div className="text-xs text-muted-foreground">{manageMarket.code}</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-foreground">
                        Currency
                      </label>
                      <Select
                        value={manageMarket.currency_code || ''}
                        onValueChange={(value) =>
                          handleUpdateMarketSettings(manageMarket.id, { currency_code: value || null })
                        }
                      >
                        <SelectTrigger className="h-10 px-3 rounded-xl">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-foreground">
                        Timezone
                      </label>
                      <Select
                        value={manageMarket.timezone || ''}
                        onValueChange={(value) =>
                          handleUpdateMarketSettings(manageMarket.id, { timezone: value || null })
                        }
                      >
                        <SelectTrigger className="h-10 px-3 rounded-xl">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[2fr_auto] sm:items-center">
                      <Select
                        value={manageAddLanguageCode[manageMarket.id] || ''}
                        onValueChange={(value) =>
                          setManageAddLanguageCode((prev) => ({ ...prev, [manageMarket.id]: value }))
                        }
                      >
                        <SelectTrigger className="h-10 px-3 rounded-xl">
                          <SelectValue placeholder="Select a language to add" />
                        </SelectTrigger>
                        <SelectContent>
                          {getManageLocaleOptions(manageMarket.id).map((option) => (
                            <SelectItem key={option.code} value={option.code}>
                              {option.name} ({option.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          handleAddLocaleToMarket(
                            manageMarket.id,
                            manageAddLanguageCode[manageMarket.id] || ''
                          )
                        }
                        disabled={saving || !(manageAddLanguageCode[manageMarket.id] || '')}
                      >
                        Add language
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {(activeLocalesByMarket.get(manageMarket.id) || []).map((locale) => {
                        const assignment = assignmentIndex.get(`${manageMarket.id}:${locale.id}`);
                        const isActive = assignment?.is_active ?? false;
                        const isDefault = manageMarket.default_locale_id === locale.id;
                        return (
                          <div key={locale.id} className="flex items-center justify-between gap-3 text-sm text-foreground">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isActive}
                                onChange={async () => {
                                  await handleToggleAssignment(manageMarket.id, locale.id, isActive);
                                  if (isDefault && isActive) {
                                    await handleUpdateMarketSettings(manageMarket.id, { default_locale_id: null });
                                  }
                                }}
                                disabled={saving}
                                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                              />
                              <span>{locale.code}</span>
                              <span className="text-xs text-muted-foreground">{locale.name}</span>
                            </label>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleUpdateMarketSettings(manageMarket.id, { default_locale_id: locale.id })}
                              disabled={saving || !isActive}
                            >
                              {isDefault ? 'Default' : 'Set default'}
                            </Button>
                          </div>
                        );
                      })}
                      {(activeLocalesByMarket.get(manageMarket.id) || []).length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          No languages assigned yet.
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                </div>

                <div className="border-t border-border p-6">
                  <div className="flex w-full max-w-5xl justify-end">
                    <Button variant="outline" onClick={() => setManageMarketId(null)} disabled={saving}>
                      Done
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <DialogPrimitive.Root
        open={showCreateMarket}
        onOpenChange={(open) => {
          if (open) {
            setError(null);
            return;
          }
          if (!open && !saving) {
            setShowCreateMarket(false);
            setSelectedLanguageCodes([]);
            setSelectedCountryCode('');
            setCountryLocaleOptions([]);
            setDefaultLanguageCode('');
            setMarketCurrency('');
            setMarketTimezone('');
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-white" />
          <DialogPrimitive.Content className="fixed inset-0 z-50 bg-white">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border p-6">
                <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-semibold">
                  <Globe className="h-5 w-5" />
                  Add Market
                </DialogPrimitive.Title>
                <button
                  onClick={() => !saving && setShowCreateMarket(false)}
                  disabled={saving}
                  className="rounded-md p-1.5 transition-colors hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="w-full max-w-5xl space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Country
                    </label>
                    <Select value={selectedCountryCode} onValueChange={setSelectedCountryCode}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a country" />
                      </SelectTrigger>
                      <SelectContent>
                        {countries.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name} ({country.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Languages to assign
                    </label>
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border/60 px-3 py-2">
                      {languageOptions.map((option) => {
                        const checked = selectedLanguageCodes.includes(option.code);
                        const isDefault = defaultLanguageCode === option.code;
                        return (
                          <div key={option.code} className="flex items-center justify-between gap-3 text-sm text-foreground">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? selectedLanguageCodes.filter((code) => code !== option.code)
                                    : [...selectedLanguageCodes, option.code];
                                  setSelectedLanguageCodes(next);
                                  if (checked && isDefault) {
                                    setDefaultLanguageCode('');
                                  }
                                  if (!checked && !defaultLanguageCode) {
                                    setDefaultLanguageCode(option.code);
                                  }
                                }}
                                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                disabled={saving}
                              />
                              <span>{option.name}</span>
                              <span className="text-xs text-muted-foreground">{option.code}</span>
                            </label>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setDefaultLanguageCode(option.code)}
                              disabled={saving || !checked}
                            >
                              {isDefault ? 'Default' : 'Set default'}
                            </Button>
                          </div>
                        );
                      })}
                      {languageOptions.length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          {selectedCountryCode ? 'No languages available yet.' : 'Select a country to see languages.'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-foreground">
                        Currency
                      </label>
                      <Select value={marketCurrency} onValueChange={setMarketCurrency}>
                        <SelectTrigger className="h-10 px-3 rounded-xl">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Timezone
                    </label>
                    <Select value={marketTimezone} onValueChange={setMarketTimezone}>
                      <SelectTrigger className="h-10 px-3 rounded-xl">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t border-border p-6">
                <div className="flex w-full max-w-5xl justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => !saving && setShowCreateMarket(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="accent-blue"
                    onClick={handleCreateMarket}
                    disabled={saving || !selectedCountryCode || !marketCurrency || !marketTimezone}
                  >
                    {saving ? 'Creating...' : 'Create Market'}
                  </Button>
                </div>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="h-full bg-background">
      <PageLoader text="Loading markets..." size="lg" />
    </div>
  );
}
