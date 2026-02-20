'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

let cachedWorkspaces: WorkspaceSummary[] | null = null
let cacheTimestamp = 0
let pendingRequest: Promise<WorkspaceSummary[] | null> | null = null
const CACHE_DURATION = 30000

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  role: string
  organizationType?: 'brand' | 'partner'
  partnerCategory?: 'retailer' | 'distributor' | 'wholesaler' | null
  lastAccessed?: string
  unreadCount?: number
}

interface UseWorkspacesOptions {
  currentWorkspaceSlug?: string
  initialWorkspaces?: WorkspaceSummary[]
}

interface UseWorkspacesResult {
  workspaces: WorkspaceSummary[]
  sortedWorkspaces: WorkspaceSummary[]
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

export function useWorkspaces(options: UseWorkspacesOptions = {}): UseWorkspacesResult {
  const { currentWorkspaceSlug, initialWorkspaces } = options
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>(
    initialWorkspaces ?? []
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const isCacheValid = () => {
    const now = Date.now()
    return cachedWorkspaces && now - cacheTimestamp < CACHE_DURATION
  }

  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      if (isCacheValid()) {
        setWorkspaces(cachedWorkspaces || [])
        return
      }

      if (pendingRequest) {
        const pendingData = await pendingRequest
        setWorkspaces(pendingData || [])
        return
      }

      pendingRequest = (async () => {
        const response = await fetch('/api/me/workspaces')
        if (!response.ok) {
          if (response.status === 401) {
            cachedWorkspaces = null
            cacheTimestamp = Date.now()
            return []
          }
          throw new Error('Failed to load workspaces')
        }

        const data = await response.json()
        const nextWorkspaces: WorkspaceSummary[] = Array.isArray(data.workspaces)
          ? data.workspaces
          : []
        cachedWorkspaces = nextWorkspaces
        cacheTimestamp = Date.now()
        return nextWorkspaces
      })()

      const nextWorkspaces = await pendingRequest
      setWorkspaces(nextWorkspaces || [])
      pendingRequest = null
    } catch (err) {
      pendingRequest = null
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(new Error(message))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialWorkspaces !== undefined) {
      setWorkspaces(initialWorkspaces)
      cachedWorkspaces = initialWorkspaces
      cacheTimestamp = Date.now()
      pendingRequest = null
      return
    }
    fetchWorkspaces()
  }, [fetchWorkspaces, initialWorkspaces])

  const sortedWorkspaces = useMemo(() => {
    if (workspaces.length === 0) return []

    return [...workspaces].sort((a, b) => {
      if (currentWorkspaceSlug) {
        if (a.slug === currentWorkspaceSlug) return -1
        if (b.slug === currentWorkspaceSlug) return 1
      }

      const aHasLast = Boolean(a.lastAccessed)
      const bHasLast = Boolean(b.lastAccessed)

      if (aHasLast && bHasLast) {
        return new Date(b.lastAccessed!).getTime() - new Date(a.lastAccessed!).getTime()
      }
      if (aHasLast && !bHasLast) return -1
      if (!aHasLast && bHasLast) return 1

      return a.name.localeCompare(b.name)
    })
  }, [workspaces, currentWorkspaceSlug])

  const refresh = useCallback(async () => {
    cachedWorkspaces = null
    cacheTimestamp = 0
    pendingRequest = null
    await fetchWorkspaces()
  }, [fetchWorkspaces])

  return {
    workspaces,
    sortedWorkspaces,
    loading,
    error,
    refresh,
  }
}
