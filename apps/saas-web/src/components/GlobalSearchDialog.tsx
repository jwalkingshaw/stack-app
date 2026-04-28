'use client'

import { useEffect, useMemo, useRef, useState } from "react"
import { FileText, Image as ImageIcon, Package, Search } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
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
  scin?: string | null
  thumbnailUrl?: string | null
  productType: string | null
  parentId: string | null
}

type AssetResult = SearchResultBase & {
  fileType: string | null
  mimeType?: string | null
  thumbnailUrl?: string | null
}

type SearchResultItem =
  | ({ kind: "product" } & ProductResult)
  | ({ kind: "asset" } & AssetResult)

type SearchApiResponse = {
  data?: {
    results?: SearchResultItem[]
    products?: ProductResult[]
    assets?: AssetResult[]
  }
}

const EMPTY_RESULTS: SearchResultItem[] = []

type SearchSection = {
  kind: SearchResultItem["kind"]
  label: string
  items: SearchResultItem[]
}

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  organizationType?: "brand" | "partner"
  activeScope: string | null
  placeholder?: string
  onNavigate: (url: string) => void
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
  tenantSlug,
  organizationType,
  activeScope,
  placeholder = "Search products and assets...",
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
        setResults(Array.isArray(payload.data?.results) ? payload.data.results : EMPTY_RESULTS)
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

  const firstResult = useMemo<SearchResultItem | null>(() => results[0] ?? null, [results])
  const sections = useMemo<SearchSection[]>(() => {
    const grouped = new Map<SearchResultItem["kind"], SearchResultItem[]>()
    const kindOrder: SearchResultItem["kind"][] = []

    for (const item of results) {
      if (!grouped.has(item.kind)) {
        grouped.set(item.kind, [])
        kindOrder.push(item.kind)
      }
      grouped.get(item.kind)!.push(item)
    }

    return kindOrder.map((kind) => ({
      kind,
      label: kind === "product" ? "Products" : "Assets",
      items: grouped.get(kind) ?? [],
    }))
  }, [results])

  const resultCount = results.length

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

  const resolveResultUrl = (item: SearchResultItem): string => {
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

    return `/${tenantSlug}/assets`
  }

  const handleSelect = (item: SearchResultItem) => {
    const nextUrl = resolveResultUrl(item)
    onOpenChange(false)
    setQuery("")
    setResults(EMPTY_RESULTS)
    setErrorMessage(null)
    onNavigate(nextUrl)
  }

  const showEmptyState = !isLoading && query.trim().length >= 2 && resultCount === 0 && !errorMessage

  const renderPreview = (item: SearchResultItem) => {
    if (item.thumbnailUrl) {
      return (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="h-11 w-11 rounded-xl object-cover"
          loading="lazy"
        />
      )
    }

    if (item.kind === "product") {
      return (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--app-shell-surface))] text-foreground/70">
          <Package className="h-4 w-4" />
        </div>
      )
    }

    const isImageLike =
      item.mimeType?.startsWith("image/") ||
      item.fileType?.toLowerCase() === "image"

    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--app-shell-surface))] text-foreground/60">
        {isImageLike ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </div>
    )
  }

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
              placeholder={placeholder}
              className="h-10 border-0 bg-transparent pl-9 pr-3 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-3 py-3">
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
            <div className="space-y-4">
              {sections.map((section) => (
                <section key={section.kind} className="space-y-1.5">
                  <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {section.label}
                  </div>
                  <div className="overflow-hidden rounded-2xl bg-[hsl(var(--app-shell-surface))]/42">
                    {section.items.map((item, index) => (
                      <button
                        key={`${item.kind}:${item.id}`}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          "group grid w-full grid-cols-[auto_1fr] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03]",
                          index > 0 && "border-t border-black/5"
                        )}
                      >
                        <div className="flex-shrink-0">{renderPreview(item)}</div>
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-[14px] font-medium leading-5 text-foreground">
                              {item.title}
                            </p>
                            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:inline">
                              {section.label.slice(0, -1)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] leading-5 text-muted-foreground">
                            {[item.subtitle, item.organizationName]
                              .filter((value): value is string => Boolean(value))
                              .join(" | ") || "\u00a0"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
