'use client';

import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Globe, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type Country,
  type CreateMarketDraft,
  DIALOG_FORM_WIDTH_CLASS,
  type LocaleCatalogEntry,
  NONE_OPTION,
  type ReferenceOption,
  toMarketCode,
} from './types';

interface CreateMarketDialogProps {
  open: boolean;
  saving: boolean;
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
        label: `${locale.name} · ${locale.code}`,
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
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-white" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 bg-background">
          <div className="flex h-full flex-col">
            <div className="border-b border-border/60 py-6">
              <div className={`${DIALOG_FORM_WIDTH_CLASS} flex items-center justify-between px-4 sm:px-6`}>
                <DialogPrimitive.Title className="flex items-center gap-2 text-xl font-semibold text-foreground">
                  <Globe className="h-5 w-5" />
                  Add Market
                </DialogPrimitive.Title>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:bg-muted"
                  onClick={() => !saving && onOpenChange(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-8">
              <div className={`${DIALOG_FORM_WIDTH_CLASS} space-y-4 px-4 sm:px-6`}>
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
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="market-currency" className="block text-sm font-medium text-foreground">
                      Currency (optional)
                    </label>
                    <Select
                      value={currency || NONE_OPTION}
                      onValueChange={(value) => setCurrency(value === NONE_OPTION ? '' : value)}
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
                      disabled={saving}
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
                      disabled={saving}
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
                    disabled={localeCodes.length === 0}
                  >
                    <SelectTrigger id="market-default-language">
                      <SelectValue placeholder="Default language" />
                    </SelectTrigger>
                    <SelectContent>
                      {localeCodes.map((localeCode) => {
                        const locale = localeCatalog.find((row) => row.code === localeCode);
                        return locale ? (
                          <SelectItem key={locale.code} value={locale.code}>
                            {locale.name} · {locale.code}
                          </SelectItem>
                        ) : null;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t border-border/60 py-6">
              <div className={`${DIALOG_FORM_WIDTH_CLASS} flex justify-end gap-3 px-4 sm:px-6`}>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  variant="accent-blue"
                  disabled={
                    saving ||
                    !name.trim() ||
                    countryCodes.length === 0 ||
                    localeCodes.length === 0 ||
                    !defaultLocaleCode
                  }
                  onClick={() =>
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
                  {saving ? 'Creating...' : 'Create Market'}
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

