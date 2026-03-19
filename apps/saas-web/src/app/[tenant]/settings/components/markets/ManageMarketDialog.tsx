'use client';

import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Globe, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeLocaleCode } from '@/lib/locale-code';
import {
  DIALOG_FORM_WIDTH_CLASS,
  type Country,
  type Locale,
  type LocaleCatalogEntry,
  type Market,
} from './types';

interface ManageMarketDialogProps {
  open: boolean;
  saving: boolean;
  market: Market | null;
  localeById: Map<string, Locale>;
  countryByCode: Map<string, Country>;
  activeLocaleIds: string[];
  activeCountryCodes: string[];
  availableLocaleCatalog: LocaleCatalogEntry[];
  availableCountries: Country[];
  onOpenChange: (open: boolean) => void;
  onAssignCountry: (countryCode: string) => void;
  onUnassignCountry: (countryCode: string) => void;
  onAssignLocaleCode: (localeCode: string) => void;
  onUnassignLocale: (localeId: string) => void;
  onSetDefaultLocale: (localeId: string) => void;
  onCreateLocaleAndAssign: (name: string, code: string) => void;
}

export function ManageMarketDialog({
  open,
  saving,
  market,
  localeById,
  countryByCode,
  activeLocaleIds,
  activeCountryCodes,
  availableLocaleCatalog,
  availableCountries,
  onOpenChange,
  onAssignCountry,
  onUnassignCountry,
  onAssignLocaleCode,
  onUnassignLocale,
  onSetDefaultLocale,
  onCreateLocaleAndAssign,
}: ManageMarketDialogProps) {
  const [addCountryCode, setAddCountryCode] = useState('');
  const [addLocaleCode, setAddLocaleCode] = useState('');
  const [customLocaleName, setCustomLocaleName] = useState('');
  const [customLocaleCode, setCustomLocaleCode] = useState('');

  useEffect(() => {
    if (!open) return;
    setAddCountryCode('');
    setAddLocaleCode('');
    setCustomLocaleName('');
    setCustomLocaleCode('');
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-white" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 bg-background">
          {market && (
            <div className="flex h-full flex-col">
              <div className="border-b border-border/60 py-6">
                <div className={`${DIALOG_FORM_WIDTH_CLASS} flex items-center justify-between px-4 sm:px-6`}>
                  <DialogPrimitive.Title className="flex items-center gap-2 text-xl font-semibold text-foreground">
                    <Globe className="h-5 w-5" />
                    Manage Market
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
                  <div className="rounded-md border border-border/60 p-3">
                    <div className="text-sm font-medium">{market.name}</div>
                    <div className="text-xs text-muted-foreground">{market.code}</div>
                  </div>

                  <div className="rounded-md border border-border/60 p-3">
                    <div className="mb-2 text-sm font-medium">Countries</div>
                    <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Select value={addCountryCode} onValueChange={setAddCountryCode}>
                        <SelectTrigger>
                          <SelectValue placeholder="Add country" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCountries.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.name} ({country.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="secondary"
                        disabled={saving || !addCountryCode}
                        onClick={() => {
                          onAssignCountry(addCountryCode);
                          setAddCountryCode('');
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeCountryCodes.map((countryCode) => (
                        <div
                          key={countryCode}
                          className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs"
                        >
                          <span>{countryByCode.get(countryCode)?.name || countryCode}</span>
                          <button
                            type="button"
                            className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted"
                            onClick={() => onUnassignCountry(countryCode)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {activeCountryCodes.length === 0 && (
                        <span className="text-sm text-muted-foreground">No countries assigned.</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-border/60 p-3">
                    <div className="mb-2 text-sm font-medium">Languages</div>
                    <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Select value={addLocaleCode} onValueChange={setAddLocaleCode}>
                        <SelectTrigger>
                          <SelectValue placeholder="Add language" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableLocaleCatalog.map((locale) => (
                            <SelectItem key={locale.code} value={locale.code}>
                              {locale.name} · {locale.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="secondary"
                        disabled={saving || !addLocaleCode}
                        onClick={() => {
                          onAssignLocaleCode(addLocaleCode);
                          setAddLocaleCode('');
                        }}
                      >
                        Add
                      </Button>
                    </div>

                    <div className="mb-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <Input
                        placeholder="Custom language name"
                        value={customLocaleName}
                        onChange={(event) => setCustomLocaleName(event.target.value)}
                      />
                      <Input
                        placeholder="Custom language code"
                        value={customLocaleCode}
                        onChange={(event) => setCustomLocaleCode(event.target.value)}
                      />
                      <Button
                        variant="outline"
                        disabled={saving || !customLocaleName.trim() || !customLocaleCode.trim()}
                        onClick={() => {
                          onCreateLocaleAndAssign(
                            customLocaleName.trim(),
                            normalizeLocaleCode(customLocaleCode)
                          );
                          setCustomLocaleName('');
                          setCustomLocaleCode('');
                        }}
                      >
                        Create + add
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {activeLocaleIds.map((localeId) => {
                        const locale = localeById.get(localeId);
                        if (!locale) return null;
                        const isDefault = market.default_locale_id === locale.id;
                        return (
                          <div
                            key={locale.id}
                            className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                          >
                            <div className="text-sm">
                              {locale.name}{' '}
                              <span className="text-xs text-muted-foreground">({locale.code})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={saving || isDefault}
                                onClick={() => onSetDefaultLocale(locale.id)}
                              >
                                {isDefault ? 'Default' : 'Set default'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={saving}
                                onClick={() => onUnassignLocale(locale.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {activeLocaleIds.length === 0 && (
                        <span className="text-sm text-muted-foreground">No languages assigned.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/60 py-6">
                <div className={`${DIALOG_FORM_WIDTH_CLASS} flex justify-end px-4 sm:px-6`}>
                  <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
