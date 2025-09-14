/**
 * Unified Typography System for Tradetool
 * Consistent font families, sizes, weights, and line heights
 */

// Font Families
export const fontFamilies = {
  sans: [
    'Inter',
    'ui-sans-serif', 
    'system-ui', 
    '-apple-system', 
    'BlinkMacSystemFont', 
    'Segoe UI', 
    'Roboto', 
    'Helvetica Neue', 
    'Arial', 
    'sans-serif'
  ],
  serif: [
    'ui-serif', 
    'Georgia', 
    'Cambria', 
    'Times New Roman', 
    'Times', 
    'serif'
  ],
  mono: [
    'JetBrains Mono',
    'ui-monospace', 
    'SFMono-Regular', 
    'Monaco', 
    'Consolas', 
    'Liberation Mono', 
    'Courier New', 
    'monospace'
  ],
} as const;

// Font Weights
export const fontWeights = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const;

// Font Sizes (rem units)
export const fontSizes = {
  xs: '0.75rem',      // 12px
  sm: '0.875rem',     // 14px
  base: '1rem',       // 16px
  lg: '1.125rem',     // 18px
  xl: '1.25rem',      // 20px
  '2xl': '1.5rem',    // 24px
  '3xl': '1.875rem',  // 30px
  '4xl': '2.25rem',   // 36px
  '5xl': '3rem',      // 48px
  '6xl': '3.75rem',   // 60px
  '7xl': '4.5rem',    // 72px
  '8xl': '6rem',      // 96px
  '9xl': '8rem',      // 128px
} as const;

// Line Heights
export const lineHeights = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
} as const;

// Letter Spacing
export const letterSpacing = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
} as const;

// Typography Scale - Semantic text styles
export const textStyles = {
  // Display headings (for hero sections, large titles)
  'display-2xl': {
    fontSize: fontSizes['8xl'],
    lineHeight: lineHeights.none,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacing.tight,
  },
  'display-xl': {
    fontSize: fontSizes['7xl'],
    lineHeight: lineHeights.none,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacing.tight,
  },
  'display-lg': {
    fontSize: fontSizes['6xl'],
    lineHeight: lineHeights.none,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacing.tight,
  },
  'display-md': {
    fontSize: fontSizes['5xl'],
    lineHeight: lineHeights.tight,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacing.tight,
  },
  'display-sm': {
    fontSize: fontSizes['4xl'],
    lineHeight: lineHeights.tight,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacing.normal,
  },
  'display-xs': {
    fontSize: fontSizes['3xl'],
    lineHeight: lineHeights.tight,
    fontWeight: fontWeights.bold,
    letterSpacing: letterSpacing.normal,
  },
  
  // Regular headings
  'heading-xl': {
    fontSize: fontSizes['2xl'],
    lineHeight: lineHeights.tight,
    fontWeight: fontWeights.semibold,
    letterSpacing: letterSpacing.normal,
  },
  'heading-lg': {
    fontSize: fontSizes.xl,
    lineHeight: lineHeights.tight,
    fontWeight: fontWeights.semibold,
    letterSpacing: letterSpacing.normal,
  },
  'heading-md': {
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.snug,
    fontWeight: fontWeights.semibold,
    letterSpacing: letterSpacing.normal,
  },
  'heading-sm': {
    fontSize: fontSizes.base,
    lineHeight: lineHeights.snug,
    fontWeight: fontWeights.semibold,
    letterSpacing: letterSpacing.normal,
  },
  'heading-xs': {
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.snug,
    fontWeight: fontWeights.semibold,
    letterSpacing: letterSpacing.wide,
  },
  
  // Body text
  'body-xl': {
    fontSize: fontSizes.xl,
    lineHeight: lineHeights.relaxed,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  'body-lg': {
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.relaxed,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  'body-md': {
    fontSize: fontSizes.base,
    lineHeight: lineHeights.normal,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  'body-sm': {
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.normal,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  'body-xs': {
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.normal,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  
  // Labels and UI text
  'label-lg': {
    fontSize: fontSizes.base,
    lineHeight: lineHeights.snug,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.normal,
  },
  'label-md': {
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.snug,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.normal,
  },
  'label-sm': {
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.snug,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacing.wide,
  },
  
  // Captions and helper text
  'caption-lg': {
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.normal,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  'caption-md': {
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.normal,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
  },
  'caption-sm': {
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.tight,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.wide,
  },
  
  // Code and monospace
  'code-lg': {
    fontSize: fontSizes.base,
    lineHeight: lineHeights.normal,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
    fontFamily: fontFamilies.mono.join(', '),
  },
  'code-md': {
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.normal,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
    fontFamily: fontFamilies.mono.join(', '),
  },
  'code-sm': {
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.normal,
    fontWeight: fontWeights.normal,
    letterSpacing: letterSpacing.normal,
    fontFamily: fontFamilies.mono.join(', '),
  },
} as const;

// CSS Custom Properties for fonts
export const typographyCSSVariables = {
  '--font-family-sans': fontFamilies.sans.join(', '),
  '--font-family-serif': fontFamilies.serif.join(', '),
  '--font-family-mono': fontFamilies.mono.join(', '),
  
  // Font sizes
  '--font-size-xs': fontSizes.xs,
  '--font-size-sm': fontSizes.sm,
  '--font-size-base': fontSizes.base,
  '--font-size-lg': fontSizes.lg,
  '--font-size-xl': fontSizes.xl,
  '--font-size-2xl': fontSizes['2xl'],
  '--font-size-3xl': fontSizes['3xl'],
  '--font-size-4xl': fontSizes['4xl'],
  '--font-size-5xl': fontSizes['5xl'],
  '--font-size-6xl': fontSizes['6xl'],
  '--font-size-7xl': fontSizes['7xl'],
  '--font-size-8xl': fontSizes['8xl'],
  '--font-size-9xl': fontSizes['9xl'],
  
  // Line heights
  '--line-height-none': lineHeights.none,
  '--line-height-tight': lineHeights.tight,
  '--line-height-snug': lineHeights.snug,
  '--line-height-normal': lineHeights.normal,
  '--line-height-relaxed': lineHeights.relaxed,
  '--line-height-loose': lineHeights.loose,
} as const;

// Tailwind-compatible typography object
export const tailwindTypography = {
  fontFamily: {
    sans: fontFamilies.sans,
    serif: fontFamilies.serif,
    mono: fontFamilies.mono,
  },
  fontSize: fontSizes,
  fontWeight: fontWeights,
  lineHeight: lineHeights,
  letterSpacing,
} as const;

// Export everything
export const typography = {
  fontFamilies,
  fontWeights,
  fontSizes,
  lineHeights,
  letterSpacing,
  textStyles,
  cssVariables: typographyCSSVariables,
  tailwind: tailwindTypography,
} as const;

export default typography;