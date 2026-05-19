/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Healthtech petrol/slate palette — institucional, calmo e clínico.
        surface: {
          50: "#f5f8fa",
          100: "#e8eff4",
          200: "#d3dfe8",
          300: "#abbecd",
          400: "#6f8a9d",
          500: "#3f5f74",
          600: "#2a4759",
          700: "#1f3645",
          800: "#172836",
          900: "#0e1c27",
        },
        // Accent teal — "tecnologia em cuidado".
        teal: {
          50: "#ecfdfb",
          100: "#cff7f1",
          200: "#9fefe3",
          300: "#5fdccc",
          400: "#2dc1b3",
          500: "#0ea597",
          600: "#0a857c",
          700: "#0a6963",
          800: "#0b524f",
          900: "#0a3f3d",
        },
        // Petrol — deep healthtech blue/teal hybrid used in hero gradients.
        petrol: {
          50: "#eef5f7",
          100: "#d6e7ec",
          200: "#aecdd6",
          300: "#7aacb9",
          400: "#46899a",
          500: "#286a7d",
          600: "#1d5365",
          700: "#173f4f",
          800: "#102d3a",
          900: "#0a1f2a",
          950: "#06151c",
        },
        // Critical alerts only.
        danger: {
          50: "#fef2f2",
          100: "#fde2e2",
          500: "#dc3545",
          600: "#b8202f",
          700: "#921622",
        },
        amber: {
          50: "#fff8eb",
          100: "#ffedc6",
          500: "#f1a53a",
          700: "#9a5d14",
        },
      },
      boxShadow: {
        panel: "0 18px 50px -28px rgba(15, 36, 49, 0.32)",
        soft: "0 1px 2px rgba(15, 36, 49, 0.04), 0 8px 24px -12px rgba(15, 36, 49, 0.18)",
        ring: "0 0 0 1px rgba(15, 36, 49, 0.06), 0 12px 32px -16px rgba(15, 36, 49, 0.22)",
      },
      fontFamily: {
        sans: ['"Inter"', '"Manrope"', "Segoe UI", "sans-serif"],
        display: ['"Space Grotesk"', '"Inter"', "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      backgroundImage: {
        "app-grid":
          "linear-gradient(rgba(42,71,89,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(42,71,89,0.06) 1px, transparent 1px)",
        "hero-radial":
          "radial-gradient(60% 60% at 20% 10%, rgba(14,165,151,0.18), transparent 60%), radial-gradient(50% 50% at 100% 0%, rgba(42,71,89,0.18), transparent 60%)",
      },
    },
  },
  plugins: [],
};
