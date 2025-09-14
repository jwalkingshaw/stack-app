import { LucideIcon, Home, Monitor, TestTube, Beaker, Files, Settings, BarChart3, Upload, User, LogIn, UserPlus, Folder, DollarSign } from 'lucide-react'

export type Role = 'admin' | 'user' | 'viewer'
export type Audience = 'public' | 'authed' | Role[]
export type Region = 'header-left' | 'header-right' | 'sidebar'
export type Surface = 'marketing' | 'auth' | 'app'

export interface NavItem {
  id: string
  title: string
  url: string
  icon?: LucideIcon
  description?: string
  audience: Audience
  region: Region
  surface: Surface[]
  badge?: string | null
  external?: boolean
  onClick?: () => void
}

// Navigation configuration - single source of truth
export const navigationConfig: NavItem[] = [
  // Marketing content navigation
  {
    id: 'stackcess-iq',
    title: 'Stackcess IQ',
    url: '/',
    icon: Home,
    description: 'Latest industry insights',
    audience: 'public',
    region: 'sidebar',
    surface: ['marketing']
  },
  {
    id: 'technology',
    title: 'Technology',
    url: '/technology',
    icon: Monitor,
    description: 'Tech trends & analysis',
    audience: 'public',
    region: 'sidebar',
    surface: ['marketing']
  },
  {
    id: 'testing',
    title: 'Testing',
    url: '/testing',
    icon: TestTube,
    description: 'QA best practices',
    audience: 'public',
    region: 'sidebar',
    surface: ['marketing']
  },
  {
    id: 'science',
    title: 'Science',
    url: '/science',
    icon: Beaker,
    description: 'Research & development',
    audience: 'public',
    region: 'sidebar',
    surface: ['marketing']
  },
  {
    id: 'pricing',
    title: 'Pricing',
    url: '/pricing',
    icon: DollarSign,
    description: 'View our pricing plans',
    audience: 'public',
    region: 'header-left',
    surface: ['marketing']
  },

  // Marketing header auth actions
  {
    id: 'sign-in',
    title: 'Sign In',
    url: '/login',
    icon: LogIn,
    audience: 'public',
    region: 'header-right',
    surface: ['marketing']
  },
  {
    id: 'get-started',
    title: 'Get Started',
    url: '/register',
    icon: UserPlus,
    audience: 'public',
    region: 'header-right',
    surface: ['marketing']
  },

  // SaaS application navigation
  {
    id: 'dashboard',
    title: 'Dashboard',
    url: '/',
    icon: BarChart3,
    description: 'Overview & analytics',
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },
  {
    id: 'assets',
    title: 'Assets',
    url: '/assets',
    icon: Files,
    description: 'Digital asset management',
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },
  {
    id: 'folders',
    title: 'Folders',
    url: '/folders',
    icon: Folder,
    description: 'Organize your assets',
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },
  {
    id: 'upload',
    title: 'Upload',
    url: '/upload',
    icon: Upload,
    description: 'Add new assets',
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },
  {
    id: 'settings',
    title: 'Settings',
    url: '/settings',
    icon: Settings,
    description: 'Account & preferences',
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },


  // User menu items (header-right for app)
  {
    id: 'profile',
    title: 'Profile',
    url: '/profile',
    icon: User,
    audience: 'authed',
    region: 'header-right',
    surface: ['app']
  }
]

// Quick access items for app sidebar
export const quickAccessConfig: NavItem[] = [
  {
    id: 'all-assets',
    title: 'All Assets',
    url: '/assets',
    icon: Home,
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },
  {
    id: 'favorites',
    title: 'Favorites',
    url: '/favorites',
    icon: Home, // Will be replaced with Star icon in actual usage
    badge: '2',
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },
  {
    id: 'recent',
    title: 'Recent',
    url: '/recent',
    icon: Home, // Will be replaced with Clock icon
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },
  {
    id: 'shared',
    title: 'Shared',
    url: '/shared',
    icon: Home, // Will be replaced with Share2 icon
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  },
  {
    id: 'trash',
    title: 'Trash',
    url: '/trash',
    icon: Home, // Will be replaced with Trash2 icon
    audience: 'authed',
    region: 'sidebar',
    surface: ['app']
  }
]