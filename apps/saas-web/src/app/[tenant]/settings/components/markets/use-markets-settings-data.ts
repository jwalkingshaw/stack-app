'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateMarketPayload,
  Country,
  LocaleCatalogEntry,
  Locale,
  Market,
  MarketCountryAssignment,
  MarketLocaleAssignment,
  ReferenceDataResponse,
  ReferenceOption,
} from './types';

interface MarketsSettingsDataState {
  loading: boolean;
  referenceLoading: boolean;
  referenceReady: boolean;
  saving: boolean;
  error: string | null;
  markets: Market[];
  locales: Locale[];
  marketLocales: MarketLocaleAssignment[];
  marketCountries: MarketCountryAssignment[];
  countries: Country[];
  currencies: ReferenceOption[];
  timezones: ReferenceOption[];
  localeCatalog: LocaleCatalogEntry[];
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (response.ok) {
    return response.json();
  }
  const body = await response.json().catch(() => ({}));
  const message =
    typeof body?.error === 'string' && body.error.trim().length > 0
      ? body.error
      : fallbackMessage;
  throw new Error(message);
}

export function useMarketsSettingsData(tenantSlug: string) {
  const [state, setState] = useState<MarketsSettingsDataState>({
    loading: true,
    referenceLoading: false,
    referenceReady: false,
    saving: false,
    error: null,
    markets: [],
    locales: [],
    marketLocales: [],
    marketCountries: [],
    countries: [],
    currencies: [],
    timezones: [],
    localeCatalog: [],
  });
  const referenceReadyRef = useRef(false);
  const referenceRequestRef = useRef<Promise<void> | null>(null);

  const setError = useCallback((message: string | null) => {
    setState((current) => ({ ...current, error: message }));
  }, []);

  const fetchCore = useCallback(async () => {
    try {
      setState((current) => ({ ...current, loading: true, error: null }));

      const [contextRes, marketCountriesRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/market-context`),
        fetch(`/api/${tenantSlug}/market-countries`),
      ]);

      const [contextData, marketCountriesData] = await Promise.all([
        readJson<{
          markets?: Market[];
          locales?: Locale[];
          marketLocales?: MarketLocaleAssignment[];
        }>(contextRes, 'Failed to load market context.'),
        readJson<MarketCountryAssignment[]>(
          marketCountriesRes,
          'Failed to load market countries.'
        ),
      ]);

      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        markets: contextData?.markets || [],
        locales: contextData?.locales || [],
        marketLocales: contextData?.marketLocales || [],
        marketCountries: marketCountriesData || [],
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load market settings.',
      }));
    }
  }, [tenantSlug]);

  const ensureReferenceData = useCallback(async () => {
    if (referenceReadyRef.current) return;
    if (referenceRequestRef.current) {
      await referenceRequestRef.current;
      return;
    }

    const request = (async () => {
      try {
        setState((current) => ({ ...current, referenceLoading: true }));
        const referenceRes = await fetch(`/api/${tenantSlug}/settings/reference-data`);
        const referenceData = await readJson<ReferenceDataResponse>(
          referenceRes,
          'Failed to load reference data.'
        );
        setState((current) => ({
          ...current,
          referenceLoading: false,
          referenceReady: true,
          countries: referenceData?.countries || [],
          currencies: referenceData?.currencies || [],
          timezones: referenceData?.timezones || [],
          localeCatalog: referenceData?.locale_catalog || [],
        }));
        referenceReadyRef.current = true;
      } catch (error) {
        setState((current) => ({
          ...current,
          referenceLoading: false,
          error:
            current.error ||
            (error instanceof Error ? error.message : 'Failed to load reference data.'),
        }));
      }
    })();

    referenceRequestRef.current = request;
    try {
      await request;
    } finally {
      referenceRequestRef.current = null;
    }
  }, [tenantSlug]);

  useEffect(() => {
    referenceReadyRef.current = false;
    referenceRequestRef.current = null;
    setState((current) => ({
      ...current,
      referenceLoading: false,
      referenceReady: false,
      countries: [],
      currencies: [],
      timezones: [],
      localeCatalog: [],
    }));
    void fetchCore();
    void ensureReferenceData();
  }, [ensureReferenceData, fetchCore]);

  const patchMarket = useCallback(
    async (marketId: string, updates: Record<string, unknown>) => {
      const response = await fetch(`/api/${tenantSlug}/markets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_id: marketId, ...updates }),
      });
      await readJson<Market>(response, 'Failed to update market.');
    },
    [tenantSlug]
  );

  const createMarket = useCallback(
    async (payload: CreateMarketPayload) => {
      const response = await fetch(`/api/${tenantSlug}/markets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await readJson<Market>(response, 'Failed to create market.');
    },
    [tenantSlug]
  );

  const deleteMarket = useCallback(
    async (marketId: string) => {
      const response = await fetch(`/api/${tenantSlug}/markets`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_id: marketId }),
      });
      await readJson<{ success: boolean }>(response, 'Failed to delete market.');
    },
    [tenantSlug]
  );

  const assignCountry = useCallback(
    async (marketId: string, countryCode: string) => {
      const response = await fetch(`/api/${tenantSlug}/market-countries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_id: marketId, country_code: countryCode }),
      });
      await readJson<MarketCountryAssignment>(response, 'Failed to assign country.');
    },
    [tenantSlug]
  );

  const unassignCountry = useCallback(
    async (marketId: string, countryCode: string) => {
      const response = await fetch(`/api/${tenantSlug}/market-countries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_id: marketId, country_code: countryCode, is_active: false }),
      });
      await readJson<MarketCountryAssignment>(response, 'Failed to unassign country.');
    },
    [tenantSlug]
  );

  const assignLocale = useCallback(
    async (marketId: string, localeId: string) => {
      const response = await fetch(`/api/${tenantSlug}/market-locales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_id: marketId, locale_id: localeId }),
      });
      await readJson<MarketLocaleAssignment>(response, 'Failed to assign language.');
    },
    [tenantSlug]
  );

  const unassignLocale = useCallback(
    async (marketId: string, localeId: string) => {
      const response = await fetch(`/api/${tenantSlug}/market-locales`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_id: marketId, locale_id: localeId, is_active: false }),
      });
      await readJson<MarketLocaleAssignment>(response, 'Failed to unassign language.');
    },
    [tenantSlug]
  );

  const createLocale = useCallback(
    async (name: string, code: string) => {
      const response = await fetch(`/api/${tenantSlug}/locales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code }),
      });
      return readJson<Locale>(response, 'Failed to create language.');
    },
    [tenantSlug]
  );

  const runAction = useCallback(
    async (task: () => Promise<void>, fallback: string) => {
      try {
        setState((current) => ({ ...current, saving: true, error: null }));
        await task();
        await fetchCore();
        void ensureReferenceData();
      } catch (error) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : fallback,
        }));
      } finally {
        setState((current) => ({ ...current, saving: false }));
      }
    },
    [ensureReferenceData, fetchCore]
  );

  return {
    ...state,
    setError,
    refresh: fetchCore,
    ensureReferenceData,
    runAction,
    patchMarket,
    createMarket,
    deleteMarket,
    assignCountry,
    unassignCountry,
    assignLocale,
    unassignLocale,
    createLocale,
  };
}
