/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#05000A', // Almost black with a hint of deep purple
          panel: '#0C0018', // Deep purple-black for panels
          primary: '#5B21B6', // Deep pure violet/purple
          secondary: '#3B0764', // Very dark purple for shadows/depth
          accent: '#A78BFA', // Lighter purple for highlights
          success: '#10B981', 
          error: '#F43F5E', 
          border: 'rgba(91, 33, 182, 0.2)', // Deep purple tinted borders
        }
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'], // Keep for logo/headers
        inter: ['Inter', 'sans-serif'], // Primary font for luxury UI
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '60px',
      }
    },
  },
  plugins: [],
}
