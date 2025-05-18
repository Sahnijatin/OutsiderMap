/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E0FDFA',
          100: '#BCFCF4',
          200: '#8FF7EA',
          300: '#5AEEDA',
          400: '#2DE1C8',
          500: '#06D6A0', // Main teal
          600: '#05AB80',
          700: '#048060',
          800: '#035640',
          900: '#012B20',
        },
        secondary: {
          50: '#FFE0F1',
          100: '#FFB8DE',
          200: '#FF8AC9',
          300: '#FF5CB3',
          400: '#FF2E9D',
          500: '#F72585', // Main magenta
          600: '#C61E6A',
          700: '#941650',
          800: '#630F35',
          900: '#31071B',
        },
        accent: {
          50: '#E0F4FF',
          100: '#B8E5FF',
          200: '#8AD4FF',
          300: '#5CC3FF',
          400: '#2EB2FF',
          500: '#4CC9F0', // Main electric blue
          600: '#1E9FC6',
          700: '#167794',
          800: '#0F4F63',
          900: '#072831',
        },
        success: {
          500: '#10B981',
        },
        warning: {
          500: '#F59E0B',
        },
        error: {
          500: '#EF4444',
        },
        dark: {
          800: '#121212',
          900: '#080808',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Poppins', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [],
};