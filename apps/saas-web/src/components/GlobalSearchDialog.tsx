'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { Files, Megaphone, Package, Search } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { buildTenantPathForScope, isReservedPartnerScope } from "@/lib/tenant-view-scope"
import { getProductUrl } from "@/lib/product-utils"

type SearchResultBase = {
  id: string
  title: string
  subtitle: string | null
  organizationSlug: string | null
  organizationName: string | null
}

type ProductResult = SearchResultBase & {
  sku: string | null
  productType: string | null
  parentId: string | null
}

type AssetResult = SearchResultBase & {
  fileType: string | null
}

type UpdateResult = SearchResultBase & {
  status: string | null
}

type KitResult = SearchResultBase & {
  kitItemCount: number
}

type SearchApiResponse = {
  data?: {
    products?: ProductResult[]
    assets?: AssetResult[]
    updates?: UpdateResult[]
    kits?: KitResult[]
  }
}

type SearchSectionItem =
  | ({ kind: "product" } & ProductResult)
  | ({ kind: "asset" } & AssetResult)
  | ({ kind: "update" } & UpdateResult)
  | ({ kind: "kit" } & KitResult)

type SearchSection = {
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
  items: SearchSectionItem[]
}

const EMPTY_RESULTS = {
  products: [] as ProductResult[],
  assets: [] as AssetResult[],
  updates: [] as UpdateResult[],
  kits: [] as KitResult[],
}

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  organizationType?: "brand" | "partner"
  activeScope: string | null
  onNavigate: (url: string) => void
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
  tenantSlug,
  organizationType,
  activeScope,
  onNavigate,
}: GlobalSearchDialogProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState(EMPTY_RESULTS)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return

    const normalizedQuery = query.trim()
    if (normalizedQuery.length < 2) {
      setResults(EMPTY_RESULTS)
      setErrorMessage(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const normalizedTenant = tenantSlug.trim().toLowerCase()
        const normalizedScope = (activeScope || "").trim().toLowerCase()
        const params = new URLSearchParams({
          q: normalizedQuery,
          limit: "6",
        })

        if (organizationType === "partner") {
          if (normalizedScope === "all") {
            params.set("view", "all")
          } else if (
            normalizedScope &&
            normalizedScope !== normalizedTenant &&
            !isReservedPartnerScope(normalizedScope)
          ) {
            params.set("brand", normalizedScope)
          }
        }

        const response = await fetch(`/api/${tenantSlug}/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        })

        if (!response.ok) {
          setResults(EMPTY_RESULTS)
          setErrorMessage("Search is currently unavailable.")
          return
        }

        const payload = (await response.json()) as SearchApiResponse
        setResults({
          products: Array.isArray(payload.data?.products) ? payload.data!.products : [],
          assets: Array.isArray(payload.data?.assets) ? payload.data!.assets : [],
          updates: Array.isArray(payload.data?.updates) ? payload.data!.updates : [],
          kits: Array.isArray(payload.data?.kits) ? payload.data!.kits : [],
        })
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return
        setResults(EMPTY_RESULTS)
        setErrorMessage("Search request failed.")
      } finally {
        setIsLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [activeScope, open, organizationType, query, tenantSlug])

  const sections = useMemo<SearchSection[]>(
    () => [
      {
        key: "products",
        label: "Products",
        icon: Package,
        items: results.products.map((item) => ({ ...item, kind: "product" as const })),
      },
      {
        key: "assets",
        label: "Assets",
        icon: Files,
        items: results.assets.map((item) => ({ ...item, kind: "asset" as const })),
      },
      {
        key: "updates",
        label: "Updates",
        icon: Megaphone,
        items: results.updates.map((item) => ({ ...item, kind: "update" as const })),
      },
      {
        key: "kits",
        label: "Kits",
        icon: Files,
        items: results.kits.map((item) => ({ ...item, kind: "kit" as const })),
      },
    ],
    [results]
  )

  const firstResult = useMemo<SearchSectionItem | null>(() => {
    for (const section of sections) {
      if (section.items.length > 0) {
        return section.items[0]
      }
    }
    return null
  }, [sections])

  const resultCount = useMemo(
    () => sections.reduce((count, section) => count + section.items.length, 0),
    [sections]
  )

  const resolveScopedUrl = (baseUrl: string, organizationSlug: string | null): string => {
    if (organizationType !== "partner") return baseUrl

    const normalizedTenant = tenantSlug.trim().toLowerCase()
    const normalizedScope = (activeScope || "").trim().toLowerCase()
    const normalizedItemOrg = (organizationSlug || "").trim().toLowerCase()

    let scope: string | null = null
    if (normalizedScope === "all") {
      if (normalizedItemOrg && normalizedItemOrg !== normalizedTenant) {
        scope = normalizedItemOrg
      }
    } else if (
      normalizedScope &&
      normalizedScope !== normalizedTenant &&
      !isReservedPartnerScope(normalizedScope)
    ) {
      scope = normalizedScope
    }

    if (!scope) return baseUrl

    const scopeRoot = buildTenantPathForScope({
      tenantSlug,
      scope,
    })
    const tenantPrefix = `/${tenantSlug}`
    if (!baseUrl.startsWith(tenantPrefix)) return baseUrl
    return `${scopeRoot}${baseUrl.slice(tenantPrefix.length)}`
  }

  const resolveResultUrl = (item: SearchSectionItem): string => {
    if (item.kind === "product") {
      const productUrl = getProductUrl(
        {
          id: item.id,
          sku: item.sku,
          type: item.productType,
          parent_id: item.parentId,
          product_name: item.title,
        },
        tenantSlug
      )
      return resolveScopedUrl(productUrl, item.organizationSlug)
    }

    if (item.kind === "asset") {
      const assetUrl = `/${tenantSlug}/assets?q=${encodeURIComponent(item.title)}`
      return resolveScopedUrl(assetUrl, item.organizationSlug)
    }

    const updateUrl = `/${tenantSlug}/updates/${item.id}`
    return resolveScopedUrl(updateUrl, item.organizationSlug)
  }

  const handleSelect = (item: SearchSectionItem) => {
    const nextUrl = resolveResultUrl(item)
    onOpenChange(false)
    setQuery("")
    setResults(EMPTY_RESULTS)
    setErrorMessage(null)
    onNavigate(nextUrl)
  }

  const showEmptyState = !isLoading && query.trim().length >= 2 && resultCount === 0 && !errorMessage

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/40"
        className="top-20 max-w-2xl translate-y-0 gap-0 overflow-hidden p-0 sm:top-[16vh]"
      >
        <DialogTitle className="sr-only">Global Search</DialogTitle>
        <div className="border-b border-gray-200 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && firstResult) {
                  event.preventDefault()
                  handleSelect(firstResult)
                }
              }}
              placeholder="Search products, assets, updates, and kits..."
              className="h-10 border-0 bg-transparent pl-9 pr-3 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-2 py-2">
          {isLoading ? (
            <div className="px-3 py-8 text-sm text-muted-foreground">Searching...</div>
          ) : errorMessage ? (
            <div className="px-3 py-8 text-sm text-destructive">{errorMessage}</div>
          ) : showEmptyState ? (
            <div className="px-3 py-8 text-sm text-muted-foreground">
              No results found for &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : query.trim().length < 2 ? (
            <div className="px-3 py-8 text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          ) : (
            <div className="space-y-3">
              {sections
                .filter((section) => section.items.length > 0)
                .map((section) => {
                  const Icon = section.icon
                  return (
                    <div key={section.key}>
                      <div className="flex items-center gap-2 px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        <span>{section.label}</span>
                      </div>
                      <div className="space-y-1">
                        {section.items.map((item) => (
                          <button
                            key={`${section.key}:${item.id}`}
                            type="button"
                            onClick={() => handleSelect(item)}
                            className="flex w-full items-center justify-between rounded-md border border-transparent px-2.5 py-2 text-left hover:border-border hover:bg-muted/40"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[item.subtitle, item.organizationName]
                                  .filter((value): value is string => Boolean(value))
                                  .join(" | ") || "\u00a0"}
                              </p>
                            </div>
                            <span className="ml-3 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {item.kind}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
