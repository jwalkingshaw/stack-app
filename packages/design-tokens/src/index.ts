/**
 * Tradetool Design Tokens
 * Unified design system for all Tradetool applications
 */

// Export individual token categories
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './components';

// Import everything for convenience
import { colors, semanticColors, cssVariables as colorCSSVariables, tailwindColors } from './colors';
import { typography, typographyCSSVariables, tailwindTypography } from './typography';
import { spacingSystem, spacingCSSVariables, tailwindSpacing } from './spacing';
import { componentTokens } from './components';

// Combined CSS variables for easy consumption
export const cssVariables = {
  ...colorCSSVariables.light,
  ...typographyCSSVariables,
  ...spacingCSSVariables,
} as const;

export const darkCSSVariables = {
  ...colorCSSVariables.dark,
  ...typographyCSSVariables,
  ...spacingCSSVariables,
} as const;

// Tailwind configuration object
export const tailwindConfig = {
  colors: tailwindColors,
  ...tailwindTypography,
  ...tailwindSpacing,
  extend: {
    // Custom utilities that can be extended in consuming apps
    animation: {
      'fade-in': 'fadeIn 0.2s ease-in-out',
      'slide-up': 'slideUp 0.3s ease-out',
      'slide-down': 'slideDown 0.3s ease-out',
    },
    keyframes: {
      fadeIn: {
        '0%': { opacity: '0' },
        '100%': { opacity: '1' },
      },
      slideUp: {
        '0%': { transform: 'translateY(10px)', opacity: '0' },
        '100%': { transform: 'translateY(0)', opacity: '1' },
      },
      slideDown: {
        '0%': { transform: 'translateY(-10px)', opacity: '0' },
        '100%': { transform: 'translateY(0)', opacity: '1' },
      },
    },
    boxShadow: {
      'soft': '0 2px 8px 0 rgb(0 0 0 / 0.08)',
      'medium': '0 4px 16px 0 rgb(0 0 0 / 0.12)',
      'hard': '0 8px 32px 0 rgb(0 0 0 / 0.16)',
      'focus': `0 0 0 2px ${semanticColors.primary[500]}`,
    },
  },
} as const;

// Theme object for easy consumption in apps
export const theme = {
  colors,
  semanticColors,
  typography,
  spacing: spacingSystem,
  components: componentTokens,
  cssVariables,
  darkCSSVariables,
  tailwindConfig,
} as const;

// Utility function to generate CSS custom properties
export function generateCSSVariables(isDark = false) {
  const variables = isDark ? darkCSSVariables : cssVariables;
  
  return Object.entries(variables)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n  ');
}

// Utility function to generate a complete CSS theme
export function generateThemeCSS() {
  return `
:root {
  ${generateCSSVariables(false)}
}

.dark {
  ${generateCSSVariables(true)}
}

/* Base styles */
* {
  box-sizing: border-box;
}

body {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  color: var(--color-foreground);
  background-color: var(--color-background);
  margin: 0;
  padding: 0;
}

/* Focus styles */
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Selection styles */
::selection {
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
}

/* Scrollbar styles */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--color-background-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--color-border-secondary);
  border-radius: var(--border-radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-foreground-tertiary);
}
`.trim();
}

export default theme;