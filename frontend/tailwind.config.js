export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      keyframes: {
        scan: {
          '0%, 100%': { top: '10%' },
          '50%': { top: '90%' },
        }
      },
      animation: {
        scan: 'scan 2.5s ease-in-out infinite',
      }
    },
  },
  plugins: [],
};
