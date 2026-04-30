import catalogData from "./locale-catalog.json";

export interface LocaleCatalogEntry {
  code: string;
  name: string;
  sort_order?: number;
}

export const DEFAULT_LOCALE_CATALOG: LocaleCatalogEntry[] = catalogData;
