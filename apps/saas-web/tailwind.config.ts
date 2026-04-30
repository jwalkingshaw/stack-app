import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Typography scale - compact fixed sizes for data-dense SaaS
      fontSize: {
        'xs': ['var(--text-xs)', { lineHeight: '1.4' }],        // 12px - metadata
        'sm': ['var(--text-sm)', { lineHeight: '1.5' }],        // 13px - secondary text
        'base': ['var(--text-base)', { lineHeight: '1.6' }],    // 15px - primary text
        'lg': ['var(--text-lg)', { lineHeight: '1.5' }],        // 16px - titles
        // Legacy responsive sizes
        'responsive-xs': ['var(--font-size-xs)', { lineHeight: '1.4' }],
        'responsive-sm': ['var(--font-size-sm)', { lineHeight: '1.5' }],
        'responsive-base': ['var(--font-size-base)', { lineHeight: '1.6' }],
        'responsive-lg': ['var(--font-size-lg)', { lineHeight: '1.5' }],
        'xl': ['var(--font-size-xl)', { lineHeight: '1.4' }],
        '2xl': ['var(--font-size-2xl)', { lineHeight: '1.3' }],
      },
      // Font weights
      fontWeight: {
        'normal': 'var(--font-weight-normal)',
        'medium': 'var(--font-weight-medium)',
        'semibold': 'var(--font-weight-semibold)',
      },
      // Enhanced color system with CSS variables
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        "accent-black": {
          DEFAULT: "var(--color-accent-black)",
          foreground: "var(--color-accent-black-foreground)",
          hover: "var(--color-accent-black-hover)",
          active: "var(--color-accent-black-active)",
          subtle: "var(--color-accent-black-subtle)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'fade-out': 'fadeOut 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-from-right': 'slideInFromRight 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-out-to-right': 'slideOutToRight 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-in-from-left': 'slideInFromLeft 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-out-to-left': 'slideOutToLeft 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInFromRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideOutToRight: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
        slideInFromLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideOutToLeft: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
      boxShadow: {
        'soft': '0 2px 8px 0 rgb(0 0 0 / 0.08)',
        'medium': '0 4px 16px 0 rgb(0 0 0 / 0.12)',
        'hard': '0 8px 32px 0 rgb(0 0 0 / 0.16)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
