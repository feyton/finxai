/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './<custom-folder>/**/*.{js,jsx,ts,tsx}'],
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
