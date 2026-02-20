'use client'

// Framework-agnostic imports - Link and Image components will be passed as props
import React, { ComponentType } from 'react'
import { ReactNode, useState, useEffect } from 'react'
import { Menu, Bell, Settings, User, LogOut } from 'lucide-react'

// Enhanced header types for unified design system
export type HeaderVariant = 
  | 'auth-flow'           // Clean minimal for login/onboarding
  | 'marketing'           // Marketing site with sidebar
  | 'saas-authenticated'  // SaaS app with auth features

export type SidebarState = 'collapsed' | 'expanded'

export interface AuthUser {
  id: string
  email: string
  given_name: string | null
  family_name: string | null
  picture: string | null
  name: string
}

export interface UnifiedHeaderProps {
  variant: HeaderVariant
  
  // Sidebar integration
  sidebarState?: SidebarState
  isMobile?: boolean
  onSidebarToggle?: () => void
  
  // Authentication
  user?: AuthUser | null
  isAuthenticated?: boolean
  onLogin?: () => void
  onLogout?: () => void
  onRegister?: () => void
  
  // Navigation
  logoHref?: string
  showNotifications?: boolean
  notificationCount?: number
  onNotificationClick?: () => void
  
  // Customization
  children?: ReactNode
  className?: string
  
  // Framework components
  LinkComponent?: ComponentType<{ href: string; children: ReactNode; className?: string }>
  ImageComponent?: ComponentType<{ src: string; alt: string; width?: number; height?: number; className?: string }>
}

export function UnifiedHeader({
  variant,
  sidebarState,
  isMobile = false,
  onSidebarToggle,
  user,
  isAuthenticated = false,
  onLogin,
  onLogout,
  onRegister,
  logoHref = "/",
  showNotifications = false,
  notificationCount = 0,
  onNotificationClick,
  children,
  className = "",
  LinkComponent = ({ href, children, className }) => <a href={href} className={className}>{children}</a>,
  ImageComponent = ({ src, alt, className }) => <img src={src} alt={alt} className={className} />
}: UnifiedHeaderProps) {
  
  // Scroll detection state
  const [isScrolled, setIsScrolled] = useState(false)
  
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  
  // Enhanced header classes with Sanity.io inspired styling
  const getHeaderClasses = () => {
    const baseClasses = "w-full bg-white border-b border-gray-200 transition-all duration-300 ease-out"
    
    switch (variant) {
      case 'auth-flow':
        return `${baseClasses} sticky top-0 z-50`
        
      case 'marketing':
        // Marketing with black background - positioned below announcement bar
        return `fixed top-[3rem] left-0 right-0 z-[60] bg-[#0a0a0a] h-[67px] transition-all duration-300 ${isScrolled ? 'border-b border-white/10' : 'border-b border-transparent'}`
        
      case 'saas-authenticated':
        // SaaS app with white background - not fixed, flows with content
        return `${baseClasses} bg-white border-b border-gray-200 h-[67px] flex-shrink-0`
        
      default:
        return `${baseClasses} sticky top-0 z-50`
    }
  }
  
  // Container classes based on variant
  const getContainerClasses = () => {
    switch (variant) {
      case 'auth-flow':
        return "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      case 'marketing':
        return "w-full px-4"
      case 'saas-authenticated':
        return "w-full px-6"
      default:
        return "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    }
  }
  
  // Navigation link styles based on variant
  const getNavLinkClasses = () => {
    if (variant === 'marketing') {
      return "px-3 py-1.5 text-sm font-medium text-white hover:text-white/70 hover:bg-white/10 rounded-full transition-all duration-200 no-underline hover:no-underline"
    }
    return "px-3 py-1.5 text-sm font-medium text-gray-900 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all duration-200 no-underline hover:no-underline"
  }
  
  // Button styles based on variant
  const getButtonClasses = () => {
    if (variant === 'marketing') {
      return "px-3 py-1.5 text-sm font-medium text-white hover:text-white/70 hover:bg-white/10 rounded-full transition-all duration-200"
    }
    return "px-3 py-1.5 text-sm font-medium text-gray-900 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all duration-200"
  }
  
  const getSignupButtonClasses = () => {
    if (variant === 'marketing') {
      return "px-4 py-1.5 text-sm font-medium text-black border border-white hover:border-white/70 hover:bg-white/10 bg-white rounded-full transition-all duration-200"
    }
    return "px-4 py-1.5 text-sm font-medium text-gray-900 border border-gray-300 hover:border-gray-400 hover:bg-gray-100 rounded-full transition-all duration-200"
  }
  
  const getMobileMenuClasses = () => {
    if (variant === 'marketing') {
      return "p-2 text-white hover:text-white/70 transition-colors"
    }
    return "p-2 text-gray-900 hover:text-gray-700 transition-colors"
  }
  
  // Logo configuration - consistent across all variants
  const LogoComponent = () => {
    return (
      <LinkComponent href={logoHref} className="flex items-center space-x-2">
        <ImageComponent 
          src="/stackcess-icon-wb-logo.svg" 
          alt="Stackcess" 
          width={24}
          height={24}
          className="h-6 w-6 flex-shrink-0"
        />
        <ImageComponent 
          src="/stackcess-word-logo.svg" 
          alt="Stackcess" 
          width={80}
          height={16}
          className="h-4 w-auto hidden sm:block flex-shrink-0"
        />
      </LinkComponent>
    )
  }
  
  // Navigation for Marketing variant
  const MarketingNavigation = () => {
    if (variant !== 'marketing') return null
    
    return (
      <nav className="hidden md:flex items-center space-x-1">
        {/* Commented out SAAS-related links for marketing site deployment */}
        {/* 
        <Link 
          href="/products" 
          className={getNavLinkClasses()}
        >
          PRODUCTS
        </Link>
        <Link 
          href="/solutions" 
          className={getNavLinkClasses()}
        >
          SOLUTIONS
        </Link>
        <Link 
          href="/resources" 
          className={getNavLinkClasses()}
        >
          RESOURCES
        </Link>
        <Link 
          href="/docs" 
          className={getNavLinkClasses()}
        >
          DOCS
        </Link>
        */}
        {/* 
        <Link 
          href="/pricing" 
          className={getNavLinkClasses()}
        >
          PRICING
        </Link>
        */}
      </nav>
    )
  }
  
  // Navigation for SaaS variant - minimal since sidebar handles navigation
  const SaasNavigation = () => {
    if (variant !== 'saas-authenticated') return null
    
    // No navigation needed - sidebar handles this
    return null
  }
  
  // Authentication section
  const AuthSection = () => {
    switch (variant) {
      case 'auth-flow':
        return null // No auth buttons in auth flow
        
      case 'marketing':
        return (
          <div className="flex items-center gap-2">
            {/* Commented out SAAS-related auth buttons for marketing site deployment */}
            {/* 
            {!isAuthenticated && (
              <>
                <button
                  onClick={onLogin}
                  className={getButtonClasses()}
                >
                  LOG IN
                </button>
                <button
                  onClick={onRegister}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#2563EB] rounded-full transition-all duration-200"
                >
                  CONTACT SALES
                </button>
                <button
                  onClick={onRegister}
                  className="px-4 py-1.5 text-sm font-medium text-white rounded-full transition-all duration-200"
                  style={{ backgroundColor: '#0052ff' }}
                >
                  GET STARTED
                </button>
              </>
            )}
            */}
            {children}
          </div>
        )
        
      case 'saas-authenticated':
        return (
          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <>
                <button
                  onClick={onLogout}
                  className={getSignupButtonClasses()}
                >
                  LOGOUT
                </button>
              </>
            ) : null}
            
            {children}
          </div>
        )
        
      default:
        return children
    }
  }
  
  // Mobile menu toggle for marketing
  const MobileMenuToggle = () => {
    if (variant !== 'marketing' || !isMobile || !onSidebarToggle) return null
    
    return (
      <button
        onClick={onSidebarToggle}
        className={getMobileMenuClasses()}
        aria-label="Toggle menu"
      >
        <Menu size={20} />
      </button>
    )
  }
  
  
  return (
    <header className={`${getHeaderClasses()} ${className}`}>
      <div className={getContainerClasses()}>
        <div className="flex items-center justify-between h-[67px] w-full relative">
          {/* Left side: Logo */}
          <div className="flex items-center">
            <LogoComponent />
          </div>

          {/* Center: Navigation - absolutely positioned to true center */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center">
            <MarketingNavigation />
            <SaasNavigation />
          </div>

          {/* Right side: Auth + Actions */}
          <div className="flex items-center">
            <AuthSection />
            <MobileMenuToggle />
          </div>
        </div>
      </div>
    </header>
  )
}