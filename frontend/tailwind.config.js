/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          700: '#1e2540',
          800: '#151b30',
          900: '#12172b',
          950: '#0a0e1a',
        },
      },
    },
  },
  plugins: [],
};
