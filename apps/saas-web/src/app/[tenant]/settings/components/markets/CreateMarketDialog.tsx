'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { FullscreenFormModal } from '@/components/ui/modal-shells';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type Country,
  type CreateMarketDraft,
  type Locale,
  NONE_OPTION,
  type ReferenceOption,
  toMarketCode,
} from './types';

interface CreateMarketDialogProps {
  open: boolean;
  saving: boolean;
  referenceLoading: boolean;
  referenceReady: boolean;
  countries: Country[];
  locales: Locale[];
  currencies: ReferenceOption[];
  timezones: ReferenceOption[];
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: CreateMarketDraft) => void;
}

export function CreateMarketDialog({
  open,
  saving,
  referenceLoading,
  referenceReady,
  countries,
  locales,
  currencies,
  timezones,
  onOpenChange,
  onCreate,
}: CreateMarketDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [localeIds, setLocaleIds] = useState<string[]>([]);
  const [defaultLocaleId, setDefaultLocaleId] = useState('');

  const activeLocales = useMemo(
    () => locales.filter((locale) => locale.is_active),
    [locales]
  );

  const countryOptions = useMemo<MultiSelectOption[]>(
    () =>
      countries.map((country) => ({
        value: country.code,
        label: `${country.name} (${country.code})`,
      })),
    [countries]
  );

  const localeOptions = useMemo<MultiSelectOption[]>(
    () =>
      activeLocales.map((locale) => ({
        value: locale.id,
        label: `${locale.name} (${locale.code})`,
      })),
    [activeLocales]
  );

  useEffect(() => {
    if (!open) return;
    setName('');
    setCode('');
    setCurrency('');
    setTimezone('');
    setCountryCodes([]);
    setLocaleIds([]);
    setDefaultLocaleId('');
  }, [open]);

  return (
    <FullscreenFormModal
      open={open}
      title="Add Market"
      onOpenChange={onOpenChange}
      onBack={() => !saving && onOpenChange(false)}
      primaryActionLabel="Create Market"
      primaryActionLoading={saving}
      primaryActionLoadingLabel="Creating..."
      primaryActionDisabled={
        saving ||
        !referenceReady ||
        !name.trim() ||
        countryCodes.length === 0 ||
        localeIds.length === 0 ||
        !defaultLocaleId
      }
      onPrimaryAction={() =>
        onCreate({
          name: name.trim(),
          code: code || undefined,
          country_codes: countryCodes,
          locale_ids: localeIds,
          default_locale_id: defaultLocaleId,
          currency_code: currency || null,
          timezone: timezone || null,
        })
      }
    >
      {referenceLoading ? (
        <div className="text-xs text-muted-foreground">Loading market reference data...</div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="market-name" className="block text-sm font-medium text-foreground">
            Market name
          </label>
          <Input
            id="market-name"
            placeholder="Market name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving || !referenceReady}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="market-code" className="block text-sm font-medium text-foreground">
            Market code (optional)
          </label>
          <Input
            id="market-code"
            placeholder="Market code (optional)"
            value={code}
            onChange={(event) => setCode(toMarketCode(event.target.value))}
            disabled={saving || !referenceReady}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="market-currency" className="block text-sm font-medium text-foreground">
            Currency (optional)
          </label>
          <Select
            value={currency || NONE_OPTION}
            onValueChange={(value) => setCurrency(value === NONE_OPTION ? '' : value)}
            disabled={saving || !referenceReady}
          >
            <SelectTrigger id="market-currency">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_OPTION}>None</SelectItem>
              {currencies.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="market-timezone" className="block text-sm font-medium text-foreground">
            Timezone (optional)
          </label>
          <Select
            value={timezone || NONE_OPTION}
            onValueChange={(value) => setTimezone(value === NONE_OPTION ? '' : value)}
            disabled={saving || !referenceReady}
          >
            <SelectTrigger id="market-timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_OPTION}>None</SelectItem>
              {timezones.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Countries</label>
          <MultiSelect
            options={countryOptions}
            value={countryCodes}
            onChange={setCountryCodes}
            placeholder="Select countries"
            maxVisibleChips={5}
            disabled={saving || !referenceReady}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Locales</label>
          <MultiSelect
            options={localeOptions}
            value={localeIds}
            onChange={(next) => {
              setLocaleIds(next);
              if (!next.includes(defaultLocaleId)) {
                setDefaultLocaleId(next[0] || '');
              }
            }}
            placeholder={localeOptions.length === 0 ? 'Add locales in Localization first' : 'Select locales'}
            maxVisibleChips={5}
            disabled={saving || !referenceReady}
          />
          <div className="text-xs text-muted-foreground">
            Markets can group existing organization locales only. Add missing locales in Localization.
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="market-default-locale" className="block text-sm font-medium text-foreground">
          Default locale
        </label>
        <Select
          value={defaultLocaleId}
          onValueChange={setDefaultLocaleId}
          disabled={localeIds.length === 0 || saving || !referenceReady}
        >
          <SelectTrigger id="market-default-locale">
            <SelectValue placeholder="Default locale" />
          </SelectTrigger>
          <SelectContent>
            {localeIds.map((localeId) => {
              const locale = activeLocales.find((row) => row.id === localeId);
              return locale ? (
                <SelectItem key={locale.id} value={locale.id}>
                  {locale.name} ({locale.code})
                </SelectItem>
              ) : null;
            })}
          </SelectContent>
        </Select>
      </div>
    </FullscreenFormModal>
  );
}
