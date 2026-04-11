/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          50: "#f6f7f4",
          100: "#eef1ea",
          200: "#dde5dc",
          300: "#c0cfc8",
          400: "#8aa59a",
          500: "#4f7367",
          600: "#36584d",
          700: "#2b463e",
          800: "#223731",
          900: "#1a2925",
        },
        danger: {
          50: "#fff3f2",
          100: "#ffe1de",
          500: "#d95043",
          600: "#b4382d",
          700: "#912d25",
        },
        amber: {
          50: "#fff8eb",
          100: "#ffedc6",
          500: "#f1a53a",
          700: "#9a5d14",
        },
      },
      boxShadow: {
        panel: "0 18px 50px -28px rgba(19, 36, 31, 0.28)",
      },
      fontFamily: {
        sans: ['"Manrope"', "Segoe UI", "sans-serif"],
        display: ['"Space Grotesk"', "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      backgroundImage: {
        "app-grid":
          "linear-gradient(rgba(79,115,103,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(79,115,103,0.08) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
}
