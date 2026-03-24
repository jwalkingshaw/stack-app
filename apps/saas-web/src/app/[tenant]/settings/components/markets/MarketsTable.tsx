'use client';

import { Badge } from '@/components/ui/badge';
import { ItemList } from '@/components/ui/item-list';
import type { Locale, Market } from './types';

interface MarketsTableProps {
  markets: Market[];
  localeById: Map<string, Locale>;
  activeLocaleIdsByMarket: Map<string, string[]>;
  activeCountryCodesByMarket: Map<string, string[]>;
  onAddMarket: () => void;
  onManageMarket: (marketId: string) => void;
}

export function MarketsTable({
  markets,
  localeById,
  activeLocaleIdsByMarket,
  activeCountryCodesByMarket,
  onAddMarket,
  onManageMarket,
}: MarketsTableProps) {
  return (
    <ItemList
      items={markets}
      getKey={(market) => market.id}
      renderTitle={(market) => market.name}
      getStatus={(market) => (market.is_active ? 'active' : 'inactive')}
      renderSubtitle={(market) => {
        const localeIds = activeLocaleIdsByMarket.get(market.id) || [];
        const countryCodes = activeCountryCodesByMarket.get(market.id) || [];
        const defaultCode = market.default_locale_id
          ? localeById.get(market.default_locale_id)?.code || '-'
          : '-';
        return `${countryCodes.length} countries - ${localeIds.length} languages - Default ${defaultCode}`;
      }}
      renderRight={(market) => (
        <div className="flex items-center gap-2">
          {market.is_default ? <Badge variant="success">Default</Badge> : null}
        </div>
      )}
      onClickItem={(market) => onManageMarket(market.id)}
      loading={false}
      emptyMessage="No markets found."
      headerLabel="markets"
      onCreate={onAddMarket}
      createLabel="Add market"
    />
  );
}
