/**
 * Component-specific design tokens for Tradetool
 * Shared styling patterns for common UI components
 */

import { colors, semanticColors } from './colors';
import { typography, textStyles } from './typography';
import { spacing, borderRadius, zIndex } from './spacing';

// Button component tokens
export const button = {
  // Base button styles
  base: {
    fontFamily: typography.fontFamilies.sans.join(', '),
    fontSize: textStyles['body-md'].fontSize,
    fontWeight: textStyles['label-md'].fontWeight,
    lineHeight: textStyles['body-md'].lineHeight,
    borderRadius: borderRadius.md,
    borderWidth: '1px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    transition: 'all 0.2s ease-in-out',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  
  // Size variants
  sizes: {
    xs: {
      height: '2rem',        // 32px
      padding: `${spacing[1]} ${spacing[2]}`,
      fontSize: textStyles['body-xs'].fontSize,
    },
    sm: {
      height: '2.25rem',     // 36px
      padding: `${spacing[1.5]} ${spacing[3]}`,
      fontSize: textStyles['body-sm'].fontSize,
    },
    md: {
      height: '2.5rem',      // 40px
      padding: `${spacing[2]} ${spacing[4]}`,
      fontSize: textStyles['body-md'].fontSize,
    },
    lg: {
      height: '2.75rem',     // 44px
      padding: `${spacing[2.5]} ${spacing[5]}`,
      fontSize: textStyles['body-lg'].fontSize,
    },
    xl: {
      height: '3rem',        // 48px
      padding: `${spacing[3]} ${spacing[6]}`,
      fontSize: textStyles['body-lg'].fontSize,
    },
    icon: {
      height: '2.5rem',      // 40px
      width: '2.5rem',       // 40px
      padding: spacing[0],
    },
  },
  
  // Color variants - Enhanced for Sanity.io aesthetic
  variants: {
    primary: {
      backgroundColor: semanticColors.primary.DEFAULT,
      color: semanticColors.primary.foreground,
      borderColor: semanticColors.primary.DEFAULT,
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      ':hover': {
        backgroundColor: semanticColors.primary[600],
        borderColor: semanticColors.primary[600],
        transform: 'translateY(-1px)',
        boxShadow: '0 4px 8px 0 rgb(0 0 0 / 0.12), 0 2px 4px 0 rgb(0 0 0 / 0.08)',
      },
      ':active': {
        backgroundColor: semanticColors.primary[700],
        borderColor: semanticColors.primary[700],
        transform: 'translateY(0)',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      ':disabled': {
        backgroundColor: semanticColors.neutral[200],
        borderColor: semanticColors.neutral[250],
        color: semanticColors.neutral[400],
        cursor: 'not-allowed',
        transform: 'none',
        boxShadow: 'none',
      },
    },
    secondary: {
      backgroundColor: semanticColors.neutral[0],
      color: semanticColors.neutral[700],
      borderColor: semanticColors.neutral[200],
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      ':hover': {
        backgroundColor: semanticColors.neutral[25],
        borderColor: semanticColors.neutral[300],
        color: semanticColors.neutral[800],
        transform: 'translateY(-1px)',
        boxShadow: '0 4px 8px 0 rgb(0 0 0 / 0.08)',
      },
      ':active': {
        backgroundColor: semanticColors.neutral[50],
        borderColor: semanticColors.neutral[350],
        transform: 'translateY(0)',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      ':disabled': {
        backgroundColor: semanticColors.neutral[50],
        borderColor: semanticColors.neutral[150],
        color: semanticColors.neutral[350],
        cursor: 'not-allowed',
        transform: 'none',
        boxShadow: 'none',
      },
    },
    ghost: {
      backgroundColor: 'transparent',
      color: semanticColors.neutral[700],
      borderColor: 'transparent',
      ':hover': {
        backgroundColor: semanticColors.neutral[100],
        color: semanticColors.neutral[900],
      },
      ':active': {
        backgroundColor: semanticColors.neutral[200],
      },
      ':disabled': {
        backgroundColor: 'transparent',
        color: semanticColors.neutral[400],
        cursor: 'not-allowed',
      },
    },
    destructive: {
      backgroundColor: semanticColors.error.DEFAULT,
      color: semanticColors.error.foreground,
      borderColor: semanticColors.error.DEFAULT,
      ':hover': {
        backgroundColor: semanticColors.error.dark,
        borderColor: semanticColors.error.dark,
      },
      ':active': {
        backgroundColor: semanticColors.error.dark,
        borderColor: semanticColors.error.dark,
      },
      ':disabled': {
        backgroundColor: semanticColors.neutral[300],
        borderColor: semanticColors.neutral[300],
        color: semanticColors.neutral[500],
        cursor: 'not-allowed',
      },
    },
  },
} as const;

// Input component tokens
export const input = {
  base: {
    fontFamily: typography.fontFamilies.sans.join(', '),
    fontSize: textStyles['body-md'].fontSize,
    lineHeight: textStyles['body-md'].lineHeight,
    borderRadius: borderRadius.md,
    borderWidth: '1px',
    backgroundColor: semanticColors.neutral[0],
    borderColor: semanticColors.neutral[300],
    color: semanticColors.neutral[900],
    padding: `${spacing[2]} ${spacing[3]}`,
    transition: 'all 0.2s ease-in-out',
    ':focus': {
      outline: 'none',
      borderColor: semanticColors.primary.DEFAULT,
      boxShadow: `0 0 0 1px ${semanticColors.primary.DEFAULT}`,
    },
    ':disabled': {
      backgroundColor: semanticColors.neutral[100],
      borderColor: semanticColors.neutral[200],
      color: semanticColors.neutral[500],
      cursor: 'not-allowed',
    },
    '::placeholder': {
      color: semanticColors.neutral[400],
    },
  },
  
  sizes: {
    sm: {
      height: '2.25rem',     // 36px
      padding: `${spacing[1.5]} ${spacing[2.5]}`,
      fontSize: textStyles['body-sm'].fontSize,
    },
    md: {
      height: '2.5rem',      // 40px
      padding: `${spacing[2]} ${spacing[3]}`,
      fontSize: textStyles['body-md'].fontSize,
    },
    lg: {
      height: '2.75rem',     // 44px
      padding: `${spacing[2.5]} ${spacing[4]}`,
      fontSize: textStyles['body-lg'].fontSize,
    },
  },
  
  states: {
    error: {
      borderColor: semanticColors.error.DEFAULT,
      ':focus': {
        borderColor: semanticColors.error.DEFAULT,
        boxShadow: `0 0 0 1px ${semanticColors.error.DEFAULT}`,
      },
    },
    success: {
      borderColor: semanticColors.success.DEFAULT,
      ':focus': {
        borderColor: semanticColors.success.DEFAULT,
        boxShadow: `0 0 0 1px ${semanticColors.success.DEFAULT}`,
      },
    },
  },
} as const;

// Card component tokens
export const card = {
  base: {
    backgroundColor: semanticColors.neutral[0],
    borderRadius: borderRadius.lg,
    borderWidth: '1px',
    borderColor: semanticColors.neutral[200],
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    overflow: 'hidden',
  },
  
  variants: {
    default: {
      padding: spacing[6],
    },
    compact: {
      padding: spacing[4],
    },
    spacious: {
      padding: spacing[8],
    },
    borderless: {
      borderColor: 'transparent',
      boxShadow: 'none',
    },
  },
  
  interactive: {
    cursor: 'pointer',
    transition: 'all 0.2s ease-in-out',
    ':hover': {
      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      transform: 'translateY(-1px)',
    },
  },
} as const;

// Modal component tokens
export const modal = {
  backdrop: {
    position: 'fixed',
    inset: '0',
    backgroundColor: 'rgb(0 0 0 / 0.5)',
    backdropFilter: 'blur(4px)',
    zIndex: zIndex.backdrop,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  
  content: {
    backgroundColor: semanticColors.neutral[0],
    borderRadius: borderRadius.lg,
    boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    maxHeight: '90vh',
    maxWidth: '90vw',
    overflow: 'auto',
    position: 'relative',
    zIndex: zIndex.modal,
  },
  
  sizes: {
    sm: {
      width: '24rem',       // 384px
    },
    md: {
      width: '32rem',       // 512px
    },
    lg: {
      width: '42rem',       // 672px
    },
    xl: {
      width: '48rem',       // 768px
    },
    full: {
      width: '100%',
      height: '100%',
      borderRadius: '0',
    },
  },
} as const;

// Navigation component tokens
export const navigation = {
  base: {
    backgroundColor: semanticColors.neutral[0],
    borderBottomWidth: '1px',
    borderBottomColor: semanticColors.neutral[200],
    backdropFilter: 'blur(12px)',
  },
  
  link: {
    fontFamily: typography.fontFamilies.sans.join(', '),
    fontSize: textStyles['body-md'].fontSize,
    fontWeight: textStyles['label-md'].fontWeight,
    color: semanticColors.neutral[700],
    textDecoration: 'none',
    padding: `${spacing[2]} ${spacing[3]}`,
    borderRadius: borderRadius.md,
    transition: 'all 0.2s ease-in-out',
    ':hover': {
      color: semanticColors.neutral[900],
      backgroundColor: semanticColors.neutral[100],
    },
    ':focus': {
      outline: 'none',
      boxShadow: `0 0 0 2px ${semanticColors.primary.DEFAULT}`,
    },
  },
  
  linkActive: {
    color: semanticColors.primary.DEFAULT,
    backgroundColor: semanticColors.primary[50],
    ':hover': {
      color: semanticColors.primary[600],
      backgroundColor: semanticColors.primary[100],
    },
  },
} as const;

// Toast/notification component tokens
export const toast = {
  base: {
    backgroundColor: semanticColors.neutral[900],
    color: semanticColors.neutral[50],
    borderRadius: borderRadius.lg,
    padding: `${spacing[3]} ${spacing[4]}`,
    fontSize: textStyles['body-sm'].fontSize,
    fontWeight: textStyles['label-md'].fontWeight,
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    zIndex: zIndex.toast,
    maxWidth: '24rem',
    minWidth: '20rem',
  },
  
  variants: {
    success: {
      backgroundColor: semanticColors.success.DEFAULT,
      color: semanticColors.success.foreground,
    },
    warning: {
      backgroundColor: semanticColors.warning.DEFAULT,
      color: semanticColors.warning.foreground,
    },
    error: {
      backgroundColor: semanticColors.error.DEFAULT,
      color: semanticColors.error.foreground,
    },
    info: {
      backgroundColor: semanticColors.secondary.DEFAULT,
      color: semanticColors.secondary.foreground,
    },
  },
} as const;

// Export all component tokens
export const componentTokens = {
  button,
  input,
  card,
  modal,
  navigation,
  toast,
} as const;

export default componentTokens;