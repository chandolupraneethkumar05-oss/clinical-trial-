/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        linen: {
          50: '#fdfcfb',
          100: '#faf8f5',
          200: '#f5f2eb',
          300: '#ebe6dc',
          400: '#ded7c8',
          500: '#c5bcb0',
          600: '#948a7e',
          700: '#696156',
          800: '#403b35',
          900: '#1e1c19',
        },
        charcoal: {
          50: '#f6f6f6',
          100: '#e7e7e8',
          200: '#d0d1d2',
          700: '#383a3d',
          800: '#222527',
          900: '#191b1a',
          950: '#111312',
        },
        terracotta: {
          50: '#fdf4f2',
          100: '#fce6e3',
          200: '#f9cfca',
          500: '#e05a47',
          600: '#c84b31',
          700: '#a63b25',
        },
        sage: {
          50: '#f3f7f4',
          100: '#e4eee6',
          200: '#cbded0',
          600: '#3d6b52',
          700: '#2d5a3f',
          800: '#21432f',
        },
        brand: {
          50: '#f0f5fa',
          100: '#e0ecf5',
          500: '#1e6091',
          600: '#164e78',
          700: '#113d5e',
        }
      },
      fontFamily: {
        serif: [
          '"Fraunces"',
          '"Newsreader"',
          'Georgia',
          'serif'
        ],
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif'
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'monospace'
        ]
      }
    },
  },
  plugins: [],
}
