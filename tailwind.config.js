/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — Dusk Purple. Used for premium, primary CTAs, chatbot header.
        dusk: {
          DEFAULT: '#744577',
          light:   '#9468a0',
          dark:    '#5a325e',
          50:      '#f5f0f6',
          100:     '#e8dcec',
        },
        // Base background — Sand/Beige. Organic, low-fatigue surface.
        sand: {
          DEFAULT: '#F0E9B6',
          light:   '#f8f4d4',
          dark:    '#d8cf86',
        },
        // Secondary — Light Grass. Cards, NGO sections.
        grass: {
          DEFAULT: '#ACCFA3',
          light:   '#c9dec0',
          dark:    '#88b07e',
        },
        // Tertiary — Teal/Mint. Active nav, water icons, alerts.
        water: {
          DEFAULT: '#84C5B1',
          light:   '#a8d6c6',
          dark:    '#5fa691',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 6px 24px -8px rgba(116, 69, 119, 0.18)',
        fab:  '0 10px 30px -6px rgba(116, 69, 119, 0.45)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
