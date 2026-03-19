'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Locale, Market } from './types';

interface MarketsTableProps {
  markets: Market[];
  saving: boolean;
  localeById: Map<string, Locale>;
  activeLocaleIdsByMarket: Map<string, string[]>;
  activeCountryCodesByMarket: Map<string, string[]>;
  onSetDefaultMarket: (marketId: string) => void;
  onToggleMarketActive: (marketId: string, isActive: boolean) => void;
  onManageMarket: (marketId: string) => void;
}

export function MarketsTable({
  markets,
  saving,
  localeById,
  activeLocaleIdsByMarket,
  activeCountryCodesByMarket,
  onSetDefaultMarket,
  onToggleMarketActive,
  onManageMarket,
}: MarketsTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/30">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Market</th>
            <th className="px-3 py-2 font-medium">Countries</th>
            <th className="px-3 py-2 font-medium">Languages</th>
            <th className="px-3 py-2 font-medium">Default Language</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((market) => {
            const localeIds = activeLocaleIdsByMarket.get(market.id) || [];
            const countryCodes = activeCountryCodesByMarket.get(market.id) || [];
            const defaultCode = market.default_locale_id
              ? localeById.get(market.default_locale_id)?.code || '-'
              : '-';

            return (
              <tr key={market.id} className="border-t border-border/60">
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{market.name}</div>
                  <div className="text-xs text-muted-foreground">{market.code}</div>
                </td>
                <td className="px-3 py-2">{countryCodes.length}</td>
                <td className="px-3 py-2">{localeIds.length}</td>
                <td className="px-3 py-2">{defaultCode}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {market.is_default && <Badge variant="success">Default</Badge>}
                    {!market.is_active && <Badge variant="neutral">Inactive</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving || market.is_default}
                      onClick={() => onSetDefaultMarket(market.id)}
                    >
                      Set default
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving}
                      onClick={() => onToggleMarketActive(market.id, market.is_active)}
                    >
                      {market.is_active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving}
                      onClick={() => onManageMarket(market.id)}
                    >
                      Manage
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
          {markets.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                No markets found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
