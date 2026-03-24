'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { FullscreenFormModal } from '@/components/ui/modal-shells';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type Country,
  type CreateMarketDraft,
  type LocaleCatalogEntry,
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
  localeCatalog: LocaleCatalogEntry[];
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
  localeCatalog,
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
  const [localeCodes, setLocaleCodes] = useState<string[]>([]);
  const [defaultLocaleCode, setDefaultLocaleCode] = useState('');

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
      localeCatalog.map((locale) => ({
        value: locale.code,
        label: `${locale.name} - ${locale.code}`,
      })),
    [localeCatalog]
  );

  useEffect(() => {
    if (!open) return;
    setName('');
    setCode('');
    setCurrency('');
    setTimezone('');
    setCountryCodes([]);
    setLocaleCodes([]);
    setDefaultLocaleCode('');
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
        localeCodes.length === 0 ||
        !defaultLocaleCode
      }
      onPrimaryAction={() =>
        onCreate({
          name: name.trim(),
          code: code || undefined,
          country_codes: countryCodes,
          locale_codes: localeCodes,
          default_locale_code: defaultLocaleCode,
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
          <label className="block text-sm font-medium text-foreground">Languages</label>
          <MultiSelect
            options={localeOptions}
            value={localeCodes}
            onChange={(next) => {
              setLocaleCodes(next);
              if (!next.includes(defaultLocaleCode)) {
                setDefaultLocaleCode(next[0] || '');
              }
            }}
            placeholder="Select languages"
            maxVisibleChips={5}
            disabled={saving || !referenceReady}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="market-default-language" className="block text-sm font-medium text-foreground">
          Default language
        </label>
        <Select
          value={defaultLocaleCode}
          onValueChange={setDefaultLocaleCode}
          disabled={localeCodes.length === 0 || saving || !referenceReady}
        >
          <SelectTrigger id="market-default-language">
            <SelectValue placeholder="Default language" />
          </SelectTrigger>
          <SelectContent>
            {localeCodes.map((localeCode) => {
              const locale = localeCatalog.find((row) => row.code === localeCode);
              return locale ? (
                <SelectItem key={locale.code} value={locale.code}>
                  {locale.name} - {locale.code}
                </SelectItem>
              ) : null;
            })}
          </SelectContent>
        </Select>
      </div>
    </FullscreenFormModal>
  );
}

