/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FFFAEB',
        surface: '#FFFFFF',
        surfaceSoft: '#FFFDF7',
        charcoal: '#2B2B2B',
        charcoalLight: '#4A4A4A',
        charcoalMuted: '#6B6B6B',
        warmgrey: '#E5E0D0',
        warmgreyDark: '#C9C4B3',
        accent: '#F2C94C',
        accentHover: '#E0B83B',
        accentDeep: '#D97706',
        success: '#2E7D32',
        warning: '#ED6C02',
        danger: '#D32F2F',
        info: '#0288D1'
      }
    }
  },
  plugins: []
};
