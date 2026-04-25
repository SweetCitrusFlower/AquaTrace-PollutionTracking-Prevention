/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary — Deep Teal. CTAs, active states, brand.
        dusk: {
          DEFAULT: '#35858E',
          light:   '#4da3ad',
          dark:    '#246069',
          50:      '#edf6f7',
          100:     '#cce8eb',
        },
        // Background — Cream / off-white. Low-fatigue surface.
        sand: {
          DEFAULT: '#E6EEC9',
          light:   '#f3f7e4',
          dark:    '#cdd6a8',
        },
        // Mid-tone — Sage Green. Cards, borders, secondary surfaces.
        grass: {
          DEFAULT: '#7DA78C',
          light:   '#9ec0ab',
          dark:    '#5e8a70',
        },
        // Accent — Lime-Khaki. Highlights, tags, data chips.
        water: {
          DEFAULT: '#C2D099',
          light:   '#d6e2b8',
          dark:    '#a3b874',
        },
        // Dark mode surfaces — neutral charcoal, easy on the eyes.
        surface: {
          900: '#111827',   // page bg dark
          800: '#1f2937',   // sidebar / header dark
          700: '#374151',   // cards dark
          600: '#4b5563',   // borders dark
          muted: '#9ca3af', // muted text dark
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 6px 24px -8px rgba(53, 133, 142, 0.20)',
        fab:  '0 10px 30px -6px rgba(53, 133, 142, 0.40)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
