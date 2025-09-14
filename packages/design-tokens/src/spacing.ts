/**
 * Unified Spacing System for Tradetool
 * Consistent spacing, sizing, and layout values
 */

// Base spacing scale (rem units)
export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',    // 2px
  1: '0.25rem',       // 4px
  1.5: '0.375rem',    // 6px
  2: '0.5rem',        // 8px
  2.5: '0.625rem',    // 10px
  3: '0.75rem',       // 12px
  3.5: '0.875rem',    // 14px
  4: '1rem',          // 16px
  5: '1.25rem',       // 20px
  6: '1.5rem',        // 24px
  7: '1.75rem',       // 28px
  8: '2rem',          // 32px
  9: '2.25rem',       // 36px
  10: '2.5rem',       // 40px
  11: '2.75rem',      // 44px
  12: '3rem',         // 48px
  14: '3.5rem',       // 56px
  16: '4rem',         // 64px
  20: '5rem',         // 80px
  24: '6rem',         // 96px
  28: '7rem',         // 112px
  32: '8rem',         // 128px
  36: '9rem',         // 144px
  40: '10rem',        // 160px
  44: '11rem',        // 176px
  48: '12rem',        // 192px
  52: '13rem',        // 208px
  56: '14rem',        // 224px
  60: '15rem',        // 240px
  64: '16rem',        // 256px
  72: '18rem',        // 288px
  80: '20rem',        // 320px
  96: '24rem',        // 384px
} as const;

// Semantic spacing tokens
export const semanticSpacing = {
  // Component internal spacing
  component: {
    xs: spacing[1],       // 4px
    sm: spacing[2],       // 8px
    md: spacing[3],       // 12px
    lg: spacing[4],       // 16px
    xl: spacing[6],       // 24px
    '2xl': spacing[8],    // 32px
  },
  
  // Layout spacing (between components)
  layout: {
    xs: spacing[4],       // 16px
    sm: spacing[6],       // 24px
    md: spacing[8],       // 32px
    lg: spacing[12],      // 48px
    xl: spacing[16],      // 64px
    '2xl': spacing[24],   // 96px
    '3xl': spacing[32],   // 128px
  },
  
  // Section spacing (major page sections)
  section: {
    xs: spacing[16],      // 64px
    sm: spacing[20],      // 80px
    md: spacing[24],      // 96px
    lg: spacing[32],      // 128px
    xl: spacing[40],      // 160px
    '2xl': spacing[48],   // 192px
  },
  
  // Container spacing
  container: {
    xs: spacing[4],       // 16px
    sm: spacing[6],       // 24px
    md: spacing[8],       // 32px
    lg: spacing[12],      // 48px
    xl: spacing[16],      // 64px
  },
} as const;

// Size scale for components
export const sizes = {
  // Using same scale as spacing for consistency
  ...spacing,
  
  // Additional component-specific sizes
  auto: 'auto',
  full: '100%',
  screen: '100vh',
  svw: '100svw',
  lvw: '100lvw',
  dvw: '100dvw',
  min: 'min-content',
  max: 'max-content',
  fit: 'fit-content',
  
  // Common component sizes
  xs: '20rem',          // 320px
  sm: '24rem',          // 384px
  md: '28rem',          // 448px
  lg: '32rem',          // 512px
  xl: '36rem',          // 576px
  '2xl': '42rem',       // 672px
  '3xl': '48rem',       // 768px
  '4xl': '56rem',       // 896px
  '5xl': '64rem',       // 1024px
  '6xl': '72rem',       // 1152px
  '7xl': '80rem',       // 1280px
} as const;

// Border radius scale
export const borderRadius = {
  none: '0',
  sm: '0.125rem',       // 2px
  DEFAULT: '0.25rem',   // 4px
  md: '0.375rem',       // 6px
  lg: '0.5rem',         // 8px
  xl: '0.75rem',        // 12px
  '2xl': '1rem',        // 16px
  '3xl': '1.5rem',      // 24px
  full: '9999px',
} as const;

// Border width scale
export const borderWidth = {
  DEFAULT: '1px',
  0: '0',
  2: '2px',
  4: '4px',
  8: '8px',
} as const;

// Breakpoints for responsive design
export const breakpoints = {
  xs: '475px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// Z-index scale
export const zIndex = {
  auto: 'auto',
  0: '0',
  10: '10',
  20: '20',
  30: '30',
  40: '40',
  50: '50',
  
  // Semantic z-index values
  dropdown: '1000',
  sticky: '1020',
  fixed: '1030',
  backdrop: '1040',
  modal: '1050',
  popover: '1060',
  tooltip: '1070',
  toast: '1080',
} as const;

// CSS Custom Properties for spacing
export const spacingCSSVariables = {
  // Component spacing
  '--spacing-component-xs': semanticSpacing.component.xs,
  '--spacing-component-sm': semanticSpacing.component.sm,
  '--spacing-component-md': semanticSpacing.component.md,
  '--spacing-component-lg': semanticSpacing.component.lg,
  '--spacing-component-xl': semanticSpacing.component.xl,
  '--spacing-component-2xl': semanticSpacing.component['2xl'],
  
  // Layout spacing
  '--spacing-layout-xs': semanticSpacing.layout.xs,
  '--spacing-layout-sm': semanticSpacing.layout.sm,
  '--spacing-layout-md': semanticSpacing.layout.md,
  '--spacing-layout-lg': semanticSpacing.layout.lg,
  '--spacing-layout-xl': semanticSpacing.layout.xl,
  '--spacing-layout-2xl': semanticSpacing.layout['2xl'],
  '--spacing-layout-3xl': semanticSpacing.layout['3xl'],
  
  // Section spacing
  '--spacing-section-xs': semanticSpacing.section.xs,
  '--spacing-section-sm': semanticSpacing.section.sm,
  '--spacing-section-md': semanticSpacing.section.md,
  '--spacing-section-lg': semanticSpacing.section.lg,
  '--spacing-section-xl': semanticSpacing.section.xl,
  '--spacing-section-2xl': semanticSpacing.section['2xl'],
  
  // Border radius
  '--border-radius-sm': borderRadius.sm,
  '--border-radius-default': borderRadius.DEFAULT,
  '--border-radius-md': borderRadius.md,
  '--border-radius-lg': borderRadius.lg,
  '--border-radius-xl': borderRadius.xl,
  '--border-radius-2xl': borderRadius['2xl'],
  '--border-radius-3xl': borderRadius['3xl'],
  '--border-radius-full': borderRadius.full,
} as const;

// Tailwind-compatible spacing object
export const tailwindSpacing = {
  spacing,
  width: sizes,
  height: sizes,
  maxWidth: sizes,
  maxHeight: sizes,
  minWidth: sizes,
  minHeight: sizes,
  borderRadius,
  borderWidth,
  zIndex,
} as const;

// Export everything
export const spacingSystem = {
  spacing,
  semanticSpacing,
  sizes,
  borderRadius,
  borderWidth,
  breakpoints,
  zIndex,
  cssVariables: spacingCSSVariables,
  tailwind: tailwindSpacing,
} as const;

export default spacingSystem;