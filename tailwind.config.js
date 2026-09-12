/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#faf9f7',
          100: '#f0eee9',
          200: '#e0dcd4',
          300: '#c7c0b4',
          400: '#a39a8c',
          500: '#7d7468',
          600: '#5f584e',
          700: '#48423a',
          800: '#000000',
          900: '#000000',
          950: '#14110e',
        },
        brand: {
          50: '#f5f5f5',
          100: '#e5e5e5',
          200: '#d4d4d4',
          300: '#a3a3a3',
          400: '#737373',
          500: '#525252',
          600: '#262626',
          700: '#171717',
          800: '#0a0a0a',
          900: '#000000',
        },
        amber: {
          50: '#fdf6ec',
          100: '#fae8cb',
          200: '#f2cd8f',
          300: '#e8ac57',
          400: '#dd8f30',
          500: '#c4741f',
          600: '#a25a18',
          700: '#7f4417',
          800: '#673718',
          900: '#562f17',
        },
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
