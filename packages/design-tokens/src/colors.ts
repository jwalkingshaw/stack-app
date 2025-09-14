/**
 * Unified Color System for Tradetool
 * Single source of truth for all color values across marketing site and SaaS app
 */

// Brand Colors
export const brandColors = {
  // Primary Orange (Stackcess brand color) - Updated to deeper #ff5500
  orange: {
    50: 'hsl(20 100% 97%)',
    100: 'hsl(20 100% 94%)', 
    200: 'hsl(20 100% 88%)',
    300: 'hsl(20 100% 78%)',
    400: 'hsl(20 100% 65%)',
    500: 'hsl(20 100% 50%)', // Primary orange - #ff5500
    600: 'hsl(20 100% 45%)',
    700: 'hsl(20 100% 38%)',
    800: 'hsl(20 100% 32%)',
    900: 'hsl(20 100% 25%)',
    950: 'hsl(20 100% 13%)',
  },
  
  // Secondary Blue
  blue: {
    50: 'hsl(214 100% 97%)',
    100: 'hsl(214 95% 93%)',
    200: 'hsl(213 97% 87%)',
    300: 'hsl(212 96% 78%)',
    400: 'hsl(213 94% 68%)',
    500: 'hsl(217 91% 60%)', // Secondary blue
    600: 'hsl(221 83% 53%)',
    700: 'hsl(224 76% 48%)',
    800: 'hsl(226 71% 40%)',
    900: 'hsl(224 64% 33%)',
    950: 'hsl(226 55% 21%)',
  },
} as const;

// Semantic Colors
export const semanticColors = {
  // Primary (Orange)
  primary: {
    DEFAULT: brandColors.orange[500],
    foreground: 'hsl(0 0% 98%)',
    50: brandColors.orange[50],
    100: brandColors.orange[100],
    200: brandColors.orange[200],
    300: brandColors.orange[300],
    400: brandColors.orange[400],
    500: brandColors.orange[500],
    600: brandColors.orange[600],
    700: brandColors.orange[700],
    800: brandColors.orange[800],
    900: brandColors.orange[900],
    950: brandColors.orange[950],
  },
  
  // Secondary (Blue)
  secondary: {
    DEFAULT: brandColors.blue[500],
    foreground: 'hsl(0 0% 98%)',
    50: brandColors.blue[50],
    100: brandColors.blue[100],
    200: brandColors.blue[200],
    300: brandColors.blue[300],
    400: brandColors.blue[400],
    500: brandColors.blue[500],
    600: brandColors.blue[600],
    700: brandColors.blue[700],
    800: brandColors.blue[800],
    900: brandColors.blue[900],
    950: brandColors.blue[950],
  },

  // Neutral colors - Enhanced for Sanity.io-inspired design
  neutral: {
    0: 'hsl(0 0% 100%)',     // pure white
    25: 'hsl(210 25% 99%)',  // barely off-white
    50: 'hsl(210 20% 98%)',  // subtle background
    100: 'hsl(220 14% 96%)', // light background
    150: 'hsl(218 11% 94%)', // intermediate shade
    200: 'hsl(220 13% 91%)', // border light
    250: 'hsl(217 12% 87%)', // intermediate shade
    300: 'hsl(216 12% 84%)', // border
    350: 'hsl(215 11% 80%)', // intermediate shade
    400: 'hsl(218 11% 65%)', // muted text
    450: 'hsl(217 10% 58%)', // intermediate shade
    500: 'hsl(220 9% 46%)',  // secondary text
    550: 'hsl(219 12% 40%)', // intermediate shade
    600: 'hsl(215 14% 34%)', // main text light
    650: 'hsl(216 16% 30%)', // intermediate shade
    700: 'hsl(217 19% 27%)', // dark surfaces
    750: 'hsl(218 22% 24%)', // intermediate shade
    800: 'hsl(215 28% 17%)', // darker surfaces
    850: 'hsl(217 33% 14%)', // intermediate shade
    900: 'hsl(221 39% 11%)', // main text dark
    925: 'hsl(222 47% 8%)',  // darker background
    950: 'hsl(224 71% 4%)',  // near black
  },

  // Status colors
  success: {
    DEFAULT: 'hsl(142 76% 36%)',
    foreground: 'hsl(0 0% 98%)',
    light: 'hsl(142 76% 95%)',
    dark: 'hsl(142 76% 20%)',
  },
  
  warning: {
    DEFAULT: 'hsl(38 92% 50%)',
    foreground: 'hsl(0 0% 98%)',
    light: 'hsl(38 92% 95%)',
    dark: 'hsl(38 92% 30%)',
  },
  
  error: {
    DEFAULT: 'hsl(0 84% 60%)',
    foreground: 'hsl(0 0% 98%)',
    light: 'hsl(0 84% 95%)',
    dark: 'hsl(0 84% 40%)',
  },
} as const;

// Application-specific color scheme - Sanity.io inspired
export const appColors = {
  // Backgrounds
  background: {
    DEFAULT: semanticColors.neutral[0],
    secondary: semanticColors.neutral[25], // Slightly warmer white
    tertiary: semanticColors.neutral[50],  // Subtle background
    elevated: semanticColors.neutral[0],   // Card backgrounds
    overlay: 'hsl(0 0% 0% / 0.5)',        // Modal overlays
  },
  
  // Foregrounds - Enhanced hierarchy
  foreground: {
    DEFAULT: semanticColors.neutral[900],  // Primary text
    secondary: semanticColors.neutral[650], // Secondary text
    tertiary: semanticColors.neutral[500], // Tertiary text
    muted: semanticColors.neutral[400],    // Muted text
    subtle: semanticColors.neutral[350],   // Very subtle text
  },
  
  // Borders - More nuanced
  border: {
    DEFAULT: semanticColors.neutral[200],  // Default borders
    secondary: semanticColors.neutral[150], // Subtle borders
    strong: semanticColors.neutral[300],   // Strong borders
    focus: semanticColors.primary[500],    // Focus rings
    hover: semanticColors.neutral[250],    // Hover state borders
  },
  
  // Interactive elements - Enhanced states
  interactive: {
    hover: semanticColors.neutral[50],     // Hover backgrounds
    pressed: semanticColors.neutral[100],  // Active/pressed state
    selected: semanticColors.primary[50],  // Selected state
    disabled: semanticColors.neutral[150], // Disabled state
    focus: semanticColors.primary[100],    // Focus background
  },
  
  // Surface colors for cards, panels, etc.
  surface: {
    DEFAULT: semanticColors.neutral[0],    // Default surface
    elevated: semanticColors.neutral[0],   // Elevated surface
    sunken: semanticColors.neutral[25],    // Sunken surface
    overlay: semanticColors.neutral[0],    // Overlay surface
  },
} as const;

// CSS Custom Properties for both light and dark themes
export const cssVariables = {
  light: {
    // Primary brand colors
    '--color-primary': semanticColors.primary[500],
    '--color-primary-foreground': semanticColors.primary.foreground,
    '--color-primary-hover': semanticColors.primary[600],
    '--color-primary-active': semanticColors.primary[700],
    '--color-primary-subtle': semanticColors.primary[50],
    
    // Secondary colors
    '--color-secondary': semanticColors.secondary[500],
    '--color-secondary-foreground': semanticColors.secondary.foreground,
    '--color-secondary-hover': semanticColors.secondary[600],
    '--color-secondary-active': semanticColors.secondary[700],
    '--color-secondary-subtle': semanticColors.secondary[50],
    
    // Background hierarchy
    '--color-background': appColors.background.DEFAULT,
    '--color-background-secondary': appColors.background.secondary,
    '--color-background-tertiary': appColors.background.tertiary,
    '--color-background-elevated': appColors.surface.elevated,
    '--color-background-sunken': appColors.surface.sunken,
    '--color-background-overlay': appColors.background.overlay,
    
    // Text hierarchy
    '--color-foreground': appColors.foreground.DEFAULT,
    '--color-foreground-secondary': appColors.foreground.secondary,
    '--color-foreground-tertiary': appColors.foreground.tertiary,
    '--color-foreground-muted': appColors.foreground.muted,
    '--color-foreground-subtle': appColors.foreground.subtle,
    
    // Border system
    '--color-border': appColors.border.DEFAULT,
    '--color-border-secondary': appColors.border.secondary,
    '--color-border-strong': appColors.border.strong,
    '--color-border-focus': appColors.border.focus,
    '--color-border-hover': appColors.border.hover,
    
    // Interactive states
    '--color-interactive-hover': appColors.interactive.hover,
    '--color-interactive-pressed': appColors.interactive.pressed,
    '--color-interactive-selected': appColors.interactive.selected,
    '--color-interactive-disabled': appColors.interactive.disabled,
    '--color-interactive-focus': appColors.interactive.focus,
    
    // Status colors
    '--color-success': semanticColors.success.DEFAULT,
    '--color-success-foreground': semanticColors.success.foreground,
    '--color-success-light': semanticColors.success.light,
    '--color-warning': semanticColors.warning.DEFAULT,
    '--color-warning-foreground': semanticColors.warning.foreground,
    '--color-warning-light': semanticColors.warning.light,
    '--color-error': semanticColors.error.DEFAULT,
    '--color-error-foreground': semanticColors.error.foreground,
    '--color-error-light': semanticColors.error.light,
  },
  
  dark: {
    // Primary brand colors (enhanced contrast)
    '--color-primary': semanticColors.primary[400], // Slightly lighter for dark
    '--color-primary-foreground': semanticColors.neutral[950],
    '--color-primary-hover': semanticColors.primary[300],
    '--color-primary-active': semanticColors.primary[500],
    '--color-primary-subtle': semanticColors.primary[950],
    
    // Secondary colors
    '--color-secondary': semanticColors.secondary[400],
    '--color-secondary-foreground': semanticColors.neutral[950],
    '--color-secondary-hover': semanticColors.secondary[300],
    '--color-secondary-active': semanticColors.secondary[500],
    '--color-secondary-subtle': semanticColors.secondary[900],
    
    // Background hierarchy (dark theme)
    '--color-background': semanticColors.neutral[950],
    '--color-background-secondary': semanticColors.neutral[925],
    '--color-background-tertiary': semanticColors.neutral[900],
    '--color-background-elevated': semanticColors.neutral[900],
    '--color-background-sunken': semanticColors.neutral[925],
    '--color-background-overlay': 'hsl(0 0% 0% / 0.8)',
    
    // Text hierarchy (dark theme)
    '--color-foreground': semanticColors.neutral[50],
    '--color-foreground-secondary': semanticColors.neutral[300],
    '--color-foreground-tertiary': semanticColors.neutral[400],
    '--color-foreground-muted': semanticColors.neutral[500],
    '--color-foreground-subtle': semanticColors.neutral[600],
    
    // Border system (dark theme)
    '--color-border': semanticColors.neutral[800],
    '--color-border-secondary': semanticColors.neutral[850],
    '--color-border-strong': semanticColors.neutral[700],
    '--color-border-focus': semanticColors.primary[400],
    '--color-border-hover': semanticColors.neutral[750],
    
    // Interactive states (dark theme)
    '--color-interactive-hover': semanticColors.neutral[900],
    '--color-interactive-pressed': semanticColors.neutral[850],
    '--color-interactive-selected': semanticColors.primary[900],
    '--color-interactive-disabled': semanticColors.neutral[800],
    '--color-interactive-focus': semanticColors.primary[900],
    
    // Status colors (dark theme optimized)
    '--color-success': 'hsl(142 76% 45%)', // Brighter for dark
    '--color-success-foreground': semanticColors.neutral[950],
    '--color-success-light': 'hsl(142 76% 15%)',
    '--color-warning': 'hsl(38 92% 60%)', // Brighter for dark
    '--color-warning-foreground': semanticColors.neutral[950],
    '--color-warning-light': 'hsl(38 92% 15%)',
    '--color-error': 'hsl(0 84% 70%)', // Brighter for dark
    '--color-error-foreground': semanticColors.neutral[950],
    '--color-error-light': 'hsl(0 84% 15%)',
  },
} as const;

// Export all colors
export const colors = {
  ...brandColors,
  ...semanticColors,
  ...appColors,
} as const;

// Tailwind-compatible color object
export const tailwindColors = {
  primary: semanticColors.primary,
  secondary: semanticColors.secondary,
  neutral: semanticColors.neutral,
  success: semanticColors.success,
  warning: semanticColors.warning,
  error: semanticColors.error,
  orange: brandColors.orange,
  blue: brandColors.blue,
} as const;

export default colors;