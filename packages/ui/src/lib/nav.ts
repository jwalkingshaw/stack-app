import { NavItem, Role, Audience, Region, Surface } from './nav.config'

// Re-export types for external use
export type { NavItem, Role, Audience, Region, Surface } from './nav.config'

export interface AuthContext {
  isAuthenticated: boolean
  roles?: Role[]
  userId?: string
  user?: any
}

export interface VisibleNavItemsOptions {
  surface: Surface
  region?: Region
  authContext: AuthContext
}

/**
 * Filters navigation items based on authentication state, roles, surface, and region
 */
export function visibleNavItems(
  items: NavItem[], 
  options: VisibleNavItemsOptions
): NavItem[] {
  const { surface, region, authContext } = options
  const { isAuthenticated, roles = [] } = authContext

  return items.filter(item => {
    // Filter by surface
    if (!item.surface.includes(surface)) {
      return false
    }

    // Filter by region if specified
    if (region && item.region !== region) {
      return false
    }

    // Filter by audience
    if (item.audience === 'public') {
      return true
    }

    if (item.audience === 'authed') {
      return isAuthenticated
    }

    // Handle role-based audience
    if (Array.isArray(item.audience)) {
      return isAuthenticated && item.audience.some(role => roles.includes(role))
    }

    return false
  })
}

/**
 * Get navigation items for a specific region and surface
 */
export function getNavItemsForRegion(
  items: NavItem[],
  surface: Surface,
  region: Region,
  authContext: AuthContext
): NavItem[] {
  return visibleNavItems(items, { surface, region, authContext })
}

/**
 * Helper to determine if user can access a specific nav item
 */
export function canAccessNavItem(item: NavItem, authContext: AuthContext): boolean {
  const { isAuthenticated, roles = [] } = authContext

  if (item.audience === 'public') {
    return true
  }

  if (item.audience === 'authed') {
    return isAuthenticated
  }

  if (Array.isArray(item.audience)) {
    return isAuthenticated && item.audience.some(role => roles.includes(role))
  }

  return false
}

/**
 * Get current active nav item based on pathname
 */
export function getActiveNavItem(items: NavItem[], pathname: string): NavItem | null {
  // Find exact match first
  const exactMatch = items.find(item => item.url === pathname)
  if (exactMatch) return exactMatch

  // Find best partial match (longest matching path)
  const partialMatches = items
    .filter(item => pathname.startsWith(item.url) && item.url !== '/')
    .sort((a, b) => b.url.length - a.url.length)

  return partialMatches[0] || null
}

/**
 * Build navigation URL with org slug if needed
 */
export function buildNavUrl(item: NavItem, orgSlug?: string): string {
  if (orgSlug && !item.external && item.url.startsWith('/')) {
    return `/${orgSlug}${item.url}`
  }
  return item.url
}

/**
 * Get logo configuration for different surfaces
 */
export function getLogoConfig(surface: Surface) {
  const baseConfig = {
    iconSrc: '/stackcess-icon-wb-logo.svg',
    wordmarkSrc: '/stackcess-word-logo.svg',
    alt: 'Stackcess',
    iconSize: { width: 24, height: 24 },
    wordmarkSize: { width: 80, height: 16 }
  }

  switch (surface) {
    case 'auth':
      return {
        ...baseConfig,
        showWordmark: true,
        className: 'flex items-center space-x-2'
      }
    case 'marketing':
      return {
        ...baseConfig,
        showWordmark: true,
        className: 'flex items-center space-x-2'
      }
    case 'app':
      return {
        ...baseConfig,
        showWordmark: true,
        className: 'flex items-center space-x-2'
      }
    default:
      return baseConfig
  }
}