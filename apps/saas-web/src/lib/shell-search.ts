export interface ShellSearchContext {
  hint: string;
  placeholder: string;
}

const DEFAULT_CONTEXT: ShellSearchContext = {
  hint: "Search products and assets across this workspace",
  placeholder: "Search products, assets, SKUs, SCINs, and filenames",
};

export function resolveShellSearchContext(
  _pathname: string | null | undefined,
  _tenantSlug: string | null | undefined
): ShellSearchContext {
  return DEFAULT_CONTEXT;
}
