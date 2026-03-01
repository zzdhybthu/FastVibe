/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        th: {
          page: 'var(--c-page)',
          header: 'var(--c-header)',
          surface: 'var(--c-surface)',
          'surface-dim': 'var(--c-surface-dim)',
          input: 'var(--c-input)',
          elevated: 'var(--c-elevated)',
          hover: 'var(--c-hover)',
          muted: 'var(--c-muted)',
          border: 'var(--c-border)',
          'border-strong': 'var(--c-border-strong)',
        },
        ink: {
          DEFAULT: 'var(--c-text)',
          2: 'var(--c-text-2)',
          3: 'var(--c-text-3)',
          muted: 'var(--c-text-muted)',
          hint: 'var(--c-text-hint)',
          faint: 'var(--c-text-faint)',
        },
      },
    },
  },
  plugins: [],
};
