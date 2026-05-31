/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1d2027',
      },
      fontFamily: {
        poppins: 'Poppins-Regular',
      },
    },
  },
  plugins: [],
};
