import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        surface: {
          DEFAULT: "rgba(255, 255, 255, 0.03)",
          hover: "rgba(255, 255, 255, 0.06)",
          elevated: "rgba(255, 255, 255, 0.05)",
          border: "rgba(255, 255, 255, 0.08)",
          subtle: "rgba(255, 255, 255, 0.04)",
        },
        brand: {
          emerald: "#10b981",
          emeraldLight: "#34d399",
          emeraldDark: "#059669",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "pixel-shift": {
          "0%": { transform: "translate(0px, 0px)" },
          "25%": { transform: "translate(15px, 0px)" },
          "50%": { transform: "translate(15px, 15px)" },
          "75%": { transform: "translate(0px, 15px)" },
          "100%": { transform: "translate(0px, 0px)" },
        },
        "subtle-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "pixel-shift": "pixel-shift 60s linear infinite",
        "subtle-pulse": "subtle-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
