/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        emperia: {
          bg: '#0a0a0a',
          surface: '#111111',
          border: '#272727',
          hover: '#1a1a1a',
          accent: '#3b82f6',
          text: '#e5e5e5',
          muted: '#888888',
        }
      }
    },
  },
  plugins: [],
}
