/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0b0e',
          900: '#0f1115',
          800: '#151821',
          700: '#1d212c',
          600: '#2a2f3d',
          500: '#3d4354'
        },
        status: {
          green:   '#22c55e',
          yellow:  '#eab308',
          red:     '#ef4444',
          churned: '#a855f7'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: []
};
